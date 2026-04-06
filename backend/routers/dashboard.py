"""대시보드 KPI 및 차트 데이터"""

from fastapi import APIRouter, Query
from database import get_db
from typing import Optional

router = APIRouter()


@router.get("/dashboard/summary")
def dashboard_summary(month: Optional[str] = None):
    """KPI 요약. month=YYYY-MM이면 해당 월 출고 기준, 없으면 이번 달"""
    with get_db() as conn:
        r1 = conn.execute(
            "SELECT COALESCE(SUM(amount_krw), 0) as v FROM datecode_inventory WHERE status = '사용가능' AND actual_stock > 0"
        ).fetchone()
        r5 = conn.execute(
            "SELECT COUNT(*) as v FROM datecode_inventory WHERE urgency = 'critical' AND status = '사용가능' AND actual_stock > 0"
        ).fetchone()
        # 선택 월 출고 (기본: 이번 달)
        target_month = month or ""
        if target_month:
            r6 = conn.execute(
                "SELECT COALESCE(SUM(quantity), 0) as v FROM shipment_log WHERE SUBSTR(ship_date,1,7) = ?",
                (target_month,),
            ).fetchone()
        else:
            r6 = conn.execute(
                "SELECT COALESCE(SUM(quantity), 0) as v FROM shipment_log WHERE SUBSTR(ship_date,1,7) = SUBSTR(date('now'),1,7)"
            ).fetchone()
        # 노후 재고 금액
        r7 = conn.execute(
            "SELECT COALESCE(SUM(amount_krw), 0) as v FROM datecode_inventory WHERE urgency = 'critical' AND status = '사용가능' AND actual_stock > 0"
        ).fetchone()
        # 사용 가능한 월 목록
        months = conn.execute(
            "SELECT DISTINCT SUBSTR(ship_date,1,7) as m FROM shipment_log WHERE ship_date != '' ORDER BY m DESC LIMIT 24"
        ).fetchall()

        return {
            "total_amount_krw": r1["v"],
            "urgent_count": r5["v"],
            "monthly_outbound": r6["v"],
            "urgent_amount_krw": r7["v"],
            "selected_month": target_month or "",
            "available_months": [r["m"] for r in months],
        }


@router.get("/dashboard/vendor-value")
def vendor_value():
    """SR# 기준 벤더별 재고 금액 — 상위 5개 + 기타"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT COALESCE(sr_number, '미분류') as vender,
                      SUM(amount_krw) as amount_krw
               FROM datecode_inventory
               WHERE status = '사용가능' AND actual_stock > 0
               GROUP BY sr_number
               ORDER BY amount_krw DESC"""
        ).fetchall()
        all_items = [{"vender": r["vender"] or "미분류", "amount_krw": r["amount_krw"] or 0} for r in rows]
        if len(all_items) <= 5:
            return all_items
        top5 = all_items[:5]
        etc_krw = sum(v["amount_krw"] for v in all_items[5:])
        top5.append({"vender": "기타", "amount_krw": etc_krw})
        return top5


@router.get("/dashboard/availability")
def family_availability():
    """FAMILY별 재고수량 비교"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT family, SUM(current_qty) as total_qty,
                      SUM(available_qty) as avail_qty, SUM(booking) as booking
               FROM product_master
               WHERE family IS NOT NULL AND family != ''
               GROUP BY family
               ORDER BY total_qty DESC"""
        ).fetchall()
        return [
            {
                "family": r["family"],
                "total_qty": r["total_qty"] or 0,
                "available_qty": r["avail_qty"] or 0,
                "booking": r["booking"] or 0,
            }
            for r in rows
        ]


@router.get("/dashboard/trend")
def monthly_trend(months: int = Query(6, ge=3, le=24)):
    """최근 N개월 출고 추이"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT SUBSTR(ship_date, 1, 7) as month, SUM(quantity) as qty
               FROM shipment_log
               WHERE ship_date != '' AND ship_date IS NOT NULL
               GROUP BY month ORDER BY month DESC
               LIMIT ?""",
            (months,),
        ).fetchall()
        return [
            {"month": r["month"], "outbound": r["qty"] or 0}
            for r in reversed(rows)
        ]


@router.get("/dashboard/datecode-dist")
def datecode_distribution():
    """현재 보유 재고의 DATECODE 연도별 분포"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT SUBSTR(datecode, 1, 4) as year,
                      SUM(actual_stock) as quantity
               FROM datecode_inventory
               WHERE status = '사용가능' AND actual_stock > 0 AND datecode != '' AND datecode IS NOT NULL
               GROUP BY year ORDER BY year ASC"""
        ).fetchall()
        return [{"year": r["year"], "quantity": r["quantity"] or 0} for r in rows]
