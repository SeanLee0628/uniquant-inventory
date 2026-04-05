"""AI 자연어 재고 질의 — Claude API + SQL 실행"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import get_db
import anthropic
import os
import json
import re
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

router = APIRouter()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

DB_SCHEMA = """
## 테이블 스키마

### product_master — 품목 마스터 (522개 품목, Mar inventory에서 업로드)
- part_number: TEXT UNIQUE ★ 전체 시스템 조인 키
- central: TEXT (본부: '영업1본부')
- sales_team: TEXT (실: '영업1실', '영업2실')
- vender: TEXT (벤더: 'MICRON', 'ublox', 'Others')
- sr_code: TEXT (공급업체 약칭: 'HM', 'AJN', 'ATM')
- family: TEXT (제품군 24종: 'DDR3', 'DDR4 SDRAM', 'NAND FLASH', 'NOR FLASH', 'LPDDR4', 'LPDDR5', 'SLC', 'eMMC', 'MCP', 'SSD', 'PARALLEL NOR' 등)
- did: TEXT (DID#)
- mobis_id: TEXT (모비스 관리번호)
- unit: TEXT (단위, 대부분 'EA')
- site: TEXT (보관위치: 'MM', '공용-0')
- moq: INTEGER (최소주문수량)
- package: TEXT (포장: 'TRAY', 'T&Reel')
- fab: TEXT (제조공장)
- current_qty: INTEGER ★ 현재고 (Q'ty)
- sales_person: TEXT (담당 SALES)
- customer: TEXT (고객사: 'HYUNDAI MOBIS')
- crd: TEXT (고객 요구 납기)
- booking: INTEGER (예약/확정주문 수량)
- available_qty: INTEGER ★ 가용재고 = current_qty - booking
- dc_2019~dc_2026: INTEGER (연도별 DATECODE 보유수량)
- total_inbound: INTEGER (당월 총입고)
- total_outbound: INTEGER (당월 총출고)
- prev_month_balance: INTEGER (전월이월)

### datecode_inventory — 거래 원장 (DATECODE 시트, 영업1실 ~33000건 + 영업2실 ~4500건)
- sales_team: TEXT ('영업1실' or '영업2실')
- inbound_date: TEXT (입고일)
- sr_number: TEXT (SR# 벤더코드, 예: '45AM250923-06')
- part_number: TEXT ★ product_master FK
- quantity: INTEGER (입고수량)
- datecode: TEXT (YYYYWW 제조주차, 예: '202317')
- datecode_date: TEXT (DATECODE→날짜 변환)
- days_elapsed: INTEGER (경과일수)
- actual_stock: INTEGER ★ 실재고 (핵심 수량 필드)
- status: TEXT ('완료', '사용가능', '대기')
- unit_price_usd: REAL (외화단가 USD)
- amount_usd: REAL (금액 USD = actual_stock × unit_price_usd)
- exchange_rate: REAL (환율)
- amount_krw: REAL (금액 KRW = amount_usd × exchange_rate)
- urgency: TEXT ('normal'=1년미만, 'warning'=1~2년, 'critical'=2년초과)
- sales_person, customer, po_number, remark 등

### shipment_log — 출고 로그 (시스템 자동 생성)
- ship_date: TEXT (출고일 YYYY-MM-DD)
- customer: TEXT (출고 고객)
- part_number: TEXT ★ FK
- quantity: INTEGER (출고수량)
- sales_person: TEXT (담당)
- lot_number: TEXT, datecode: TEXT
- source_datecode_ids: TEXT (FIFO 차감된 lot ID JSON)

### daily_inventory — 일별 입출고 집계
- part_number: TEXT
- year_month: TEXT (YYYY-MM)
- day: INTEGER (1~31)
- inbound_qty: INTEGER
- outbound_qty: INTEGER

## 주요 관계
- datecode_inventory.part_number ↔ product_master.part_number 로 JOIN
- status='사용가능'인 행만 현재 가용재고
- 가용재고 = actual_stock 합계 (status='사용가능')
- 가용재고(booking 제외) = actual_stock - product_master.booking
- 오늘 날짜: 쿼리 시 date('now') 사용
"""

SYSTEM_PROMPT = f"""당신은 반도체 부품 유통회사의 창고 재고관리 AI 비서입니다.
자재팀 담당자가 한국어로 재고 관련 질문을 하면, SQLite DB를 조회하여 정확하게 답변합니다.

{DB_SCHEMA}

## 규칙
1. 질문을 분석하여 필요한 SQL 쿼리를 생성하고 query_database 도구로 실행하세요.
2. 여러 쿼리가 필요하면 순서대로 실행하세요.
3. 결과를 한국어로 자연스럽게, 숫자는 천단위 콤마로, 금액은 ₩ 표기로 답변하세요.
4. 재고 수량은 actual_stock 필드를 SUM하세요 (status='사용가능' 조건).
5. 벤더/패밀리 정보는 product_master와 JOIN하세��.
6. 불확실한 정보는 추측하지 말고, 데이터가 없으면 솔직히 말하세요.
7. 답변은 간결하지만 핵심 수치는 빠짐없이 포함하세요.
8. SELECT 쿼리만 사용하세요. INSERT/UPDATE/DELETE는 절대 금지입니다.
"""

# Claude API 도구 정의
tools = [
    {
        "name": "query_database",
        "description": "SQLite 재고 데이터베이스에 SELECT 쿼리를 실행합니다. 반드시 SELECT문만 사용해야 합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "실행할 SELECT SQL 쿼리"
                },
                "description": {
                    "type": "string",
                    "description": "이 쿼리가 무엇을 조회하는지 한국어 설명"
                }
            },
            "required": ["sql"]
        }
    }
]


def execute_safe_query(sql: str) -> list[dict]:
    """SELECT 쿼리만 허용하여 실행"""
    cleaned = sql.strip().rstrip(";").strip()
    # SELECT만 허용
    if not cleaned.upper().startswith("SELECT"):
        raise ValueError("SELECT 쿼리만 실행할 수 있습니다.")
    # 위험한 키워드 차단
    dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "REPLACE", "ATTACH", "DETACH"]
    upper = cleaned.upper()
    for kw in dangerous:
        if re.search(rf'\b{kw}\b', upper):
            raise ValueError(f"금지된 키워드: {kw}")

    with get_db() as conn:
        try:
            rows = conn.execute(cleaned).fetchall()
            result = [dict(r) for r in rows[:200]]  # 최대 200행
            return result
        except Exception as e:
            return [{"error": str(e)}]


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # [{"role": "user"/"assistant", "content": "..."}]


class ChatResponse(BaseModel):
    answer: str
    queries_executed: list[dict] = []


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

    # 대화 이력 구성
    messages = []
    for h in req.history[-10:]:  # 최근 10턴까지
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})

    queries_executed = []

    # Claude API 호출 + 도구 루프
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        )

        # 도구 호출 루프 (최대 5회)
        loop_count = 0
        while response.stop_reason == "tool_use" and loop_count < 5:
            loop_count += 1
            tool_results = []

            for block in response.content:
                if block.type == "tool_use":
                    sql = block.input.get("sql", "")
                    desc = block.input.get("description", "")
                    try:
                        result = execute_safe_query(sql)
                        queries_executed.append({
                            "sql": sql,
                            "description": desc,
                            "row_count": len(result),
                        })
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, ensure_ascii=False, default=str),
                        })
                    except ValueError as e:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps({"error": str(e)}, ensure_ascii=False),
                            "is_error": True,
                        })

            # 도구 결과로 다시 호출
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=tools,
                messages=messages,
            )

        # 최종 텍스트 응답 추출
        answer = ""
        for block in response.content:
            if hasattr(block, "text"):
                answer += block.text

        if not answer:
            answer = "죄송합니다. 질문을 처리할 수 없었습니다. 다시 시도해주세요."

        return ChatResponse(answer=answer, queries_executed=queries_executed)

    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API 오류: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"처리 중 오류: {str(e)}")
