"""AI 주간 리포트 자동 생성 + 이상 탐지 알림"""

from fastapi import APIRouter, HTTPException
from database import get_db
from dotenv import load_dotenv
import anthropic
import os
import json

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

router = APIRouter()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def _gather_report_data() -> dict:
    """주간 리포트용 원시 데이터 수집"""
    data = {}
    with get_db() as conn:
        # 1. 총 재고 금액
        r = conn.execute(
            "SELECT COALESCE(SUM(amount_krw),0) as v FROM datecode_inventory WHERE status='사용가능'"
        ).fetchone()
        data["total_krw"] = r["v"]

        # 2. SKU 수
        r = conn.execute(
            "SELECT COUNT(DISTINCT part_number) as v FROM datecode_inventory WHERE status='사용가능'"
        ).fetchone()
        data["total_sku"] = r["v"]

        # 3. 긴급 재고 (2년 초과) — 상위 10건
        rows = conn.execute(
            """SELECT part_number, datecode, actual_stock, days_elapsed, amount_krw, sr_number
               FROM datecode_inventory
               WHERE urgency='critical' AND status='사용가능'
               ORDER BY days_elapsed DESC LIMIT 10"""
        ).fetchall()
        data["urgent_items"] = [dict(r) for r in rows]
        data["urgent_count"] = conn.execute(
            "SELECT COUNT(*) as v FROM datecode_inventory WHERE urgency='critical' AND status='사용가능'"
        ).fetchone()["v"]

        # 4. 노후 재고 금액 비중
        r = conn.execute(
            "SELECT COALESCE(SUM(amount_krw),0) as v FROM datecode_inventory WHERE urgency='critical' AND status='사용가능'"
        ).fetchone()
        data["urgent_krw"] = r["v"]

        # 5. 이번 주 입출고 (최근 7일)
        rows = conn.execute(
            """SELECT part_number, customer, SUM(quantity) as qty
               FROM shipment_log
               WHERE ship_date >= date('now', '-7 days')
               GROUP BY part_number, customer
               ORDER BY qty DESC LIMIT 10"""
        ).fetchall()
        data["weekly_shipments_top"] = [dict(r) for r in rows]

        r = conn.execute(
            "SELECT COALESCE(SUM(quantity),0) as v FROM shipment_log WHERE ship_date >= date('now', '-7 days')"
        ).fetchone()
        data["weekly_outbound_total"] = r["v"]

        # 6. 전주 대비 (7~14일 전)
        r = conn.execute(
            "SELECT COALESCE(SUM(quantity),0) as v FROM shipment_log WHERE ship_date >= date('now', '-14 days') AND ship_date < date('now', '-7 days')"
        ).fetchone()
        data["prev_week_outbound"] = r["v"]

        # 7. SR# 벤더별 금액 상위
        rows = conn.execute(
            """SELECT sr_number, SUM(amount_krw) as total_krw, SUM(actual_stock) as total_qty
               FROM datecode_inventory WHERE status='사용가능'
               GROUP BY sr_number ORDER BY total_krw DESC LIMIT 10"""
        ).fetchall()
        data["vendor_summary"] = [dict(r) for r in rows]

        # 8. MOQ 이하 품목
        rows = conn.execute(
            """SELECT pm.part_number, pm.moq, pm.booking,
                      COALESCE(SUM(CASE WHEN di.status='사용가능' THEN di.actual_stock ELSE 0 END),0) as stock
               FROM product_master pm
               LEFT JOIN datecode_inventory di ON pm.part_number = di.part_number
               WHERE pm.moq > 0
               GROUP BY pm.part_number
               HAVING (stock - pm.booking) <= pm.moq
               LIMIT 10"""
        ).fetchall()
        data["moq_alerts"] = [dict(r) for r in rows]

    return data


def _gather_anomaly_data() -> dict:
    """이상 탐지용 원시 데이터 수집"""
    data = {}
    with get_db() as conn:
        # 1. 출고량 급증 품목: 최근 1개월 vs 이전 3개월 평균
        rows = conn.execute(
            """SELECT recent.part_number,
                      recent.qty as recent_qty,
                      COALESCE(prev.avg_qty, 0) as avg_qty
               FROM (
                 SELECT part_number, SUM(quantity) as qty
                 FROM shipment_log
                 WHERE ship_date >= date('now', '-30 days')
                 GROUP BY part_number
               ) recent
               LEFT JOIN (
                 SELECT part_number, SUM(quantity)/3.0 as avg_qty
                 FROM shipment_log
                 WHERE ship_date >= date('now', '-120 days') AND ship_date < date('now', '-30 days')
                 GROUP BY part_number
               ) prev ON recent.part_number = prev.part_number
               WHERE prev.avg_qty > 0 AND recent.qty > prev.avg_qty * 1.5
               ORDER BY (recent.qty / prev.avg_qty) DESC
               LIMIT 10"""
        ).fetchall()
        data["surge_items"] = [dict(r) for r in rows]

        # 2. 장기 미출고 재고: 재고 있지만 최근 6개월 출고 없음
        rows = conn.execute(
            """SELECT di.part_number, di.sr_number, SUM(di.actual_stock) as stock,
                      MIN(di.datecode) as oldest_dc, SUM(di.amount_krw) as krw
               FROM datecode_inventory di
               WHERE di.status = '사용가능' AND di.actual_stock > 0
                 AND di.part_number NOT IN (
                   SELECT DISTINCT part_number FROM shipment_log
                   WHERE ship_date >= date('now', '-180 days')
                 )
               GROUP BY di.part_number
               HAVING stock > 0
               ORDER BY krw DESC
               LIMIT 10"""
        ).fetchall()
        data["stale_items"] = [dict(r) for r in rows]

        # 3. 재고 급감 품목: 전주 대비 50% 이상 감소
        rows = conn.execute(
            """SELECT part_number,
                      SUM(CASE WHEN ship_date >= date('now', '-7 days') THEN quantity ELSE 0 END) as this_week,
                      SUM(CASE WHEN ship_date >= date('now', '-14 days') AND ship_date < date('now', '-7 days') THEN quantity ELSE 0 END) as last_week
               FROM shipment_log
               WHERE ship_date >= date('now', '-14 days')
               GROUP BY part_number
               HAVING this_week > last_week * 1.5 AND last_week > 0
               ORDER BY this_week DESC
               LIMIT 10"""
        ).fetchall()
        data["spike_outbound"] = [dict(r) for r in rows]

        # 4. 노후도 악화: 주의→긴급 임박 (600~730일)
        rows = conn.execute(
            """SELECT part_number, sr_number, datecode, actual_stock, days_elapsed, amount_krw
               FROM datecode_inventory
               WHERE status='사용가능' AND days_elapsed BETWEEN 600 AND 730
               ORDER BY days_elapsed DESC
               LIMIT 10"""
        ).fetchall()
        data["near_critical"] = [dict(r) for r in rows]

    return data


@router.get("/report/weekly")
def generate_weekly_report():
    """AI 주간 리포트 생성"""
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 미설정")

    raw = _gather_report_data()

    prompt = f"""아래는 반도체 부품 유통회사 창고의 이번 주 재고 데이터입니다.
이 데이터를 분석하여 경영진 보고용 주간 리포트를 작성해주세요.

## 원시 데이터
{json.dumps(raw, ensure_ascii=False, default=str, indent=2)}

## 리포트 형식 (반드시 이 형식 준수):

[2026년 N월 N주차 자재팀 AI 리포트]

⚠️ 긴급 조치 필요:
- 긴급 재고 상위 항목들에 대해 구체적 품번, datecode, 수량, 경과기간을 명시
- 각 항목에 → 추천: 할인 판매, 폐기 검토, 재발주 등 액션 제안

📈 이번 주 특이사항:
- 출고량 변화 (전주 대비 증감률)
- 특이 거래 패턴, 대량 출고 등
- MOQ 이하 품목 경고

💰 재고 자산 현황:
- 총 재고 금액 (₩ 단위, 억/만 표기)
- 전주 대비 증감
- 노후 재고 비중 (%)
- 벤더별 주요 현황

## 규칙:
- 한국어로 작성
- 숫자는 천단위 콤마, 금액은 ₩ 표기
- 간결하지만 핵심 수치는 빠짐없이
- 데이터가 없는 항목은 "데이터 부족"으로 표시
- 추측하지 말고 데이터 기반으로만 분석"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        report_text = response.content[0].text
        return {"report": report_text, "raw_data": raw}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"리포트 생성 오류: {str(e)}")


@router.get("/report/anomalies")
def detect_anomalies():
    """AI 이상 탐지 — 평소 패턴과 다른 상황 자동 감지"""
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 미설정")

    raw = _gather_anomaly_data()

    prompt = f"""아래는 반도체 부품 유통회사 창고의 이상 탐지용 데이터입니다.
각 카테고리를 분석하여 실제로 주의가 필요한 항목만 골라 경고 메시지를 생성해주세요.

## 원시 데이터
{json.dumps(raw, ensure_ascii=False, default=str, indent=2)}

## 카테고리별 분석 요청:

1. **출고량 급증** (surge_items): 최근 1개월 출고가 이전 3개월 평균 대비 150% 이상인 품목
2. **장기 미출고** (stale_items): 재고가 있지만 6개월간 출고 없는 품목 — 자금 동결 리스크
3. **출고 급증 품목** (spike_outbound): 전주 대비 출고 급증 — 수요 변동 주의
4. **긴급 임박** (near_critical): 경과일수 600~730일 — 곧 2년 초과 긴급으로 전환될 품목

## 출력 형식:
각 이상 항목을 아래 형식으로 출력:

⚠️ [카테고리] 구체적 설명
- 품번, 수량, 금액 등 핵심 수치 포함
- → 권장 조치

## 규칙:
- 한국어, 간결하게
- 데이터가 없는 카테고리는 "✅ 이상 없음"으로 표시
- 실제 데이터 기반으로만 — 추측 금지
- 심각도 높은 순서로 정렬"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis_text = response.content[0].text
        return {"analysis": analysis_text, "raw_data": raw}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"이상 탐지 오류: {str(e)}")
