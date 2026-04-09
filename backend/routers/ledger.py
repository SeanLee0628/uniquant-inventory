"""수불부 — import_ledger(수입내역) 기반
전기이월: 2512월 기말재고 / 출고: shipment_log 월별 분리 / 연도별 금액
"""

from fastapi import APIRouter, Query
from database import get_db
from typing import Optional

router = APIRouter()

YEAR_MONTH = "2026-03"
YEAR_START = "2026-01"


@router.get("/ledger")
def ledger_list(
    search: Optional[str] = None,
    sort_by: str = Query("end_balance", pattern="^(part_number|vender|carry_forward|cum_in_total|cur_in|in_grand|cum_out_total|cur_out|end_balance)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    with get_db() as conn:
        search_cond = ""
        search_params = []
        if search:
            search_cond = "AND (il.part_number LIKE ? OR il.vendor LIKE ?)"
            for _ in range(2):
                search_params.append(f"%{search}%")

        # 입고: import_ledger (2026년 입고만)
        # 전기이월: carry_forward 테이블 (2512월 기말재고)
        # 출고: shipment_log (월별 분리)
        base_sql = f"""
            SELECT il.part_number,
                   MAX(il.vendor) as vender,

                   -- 전기이월 (2512월 기말재고)
                   COALESCE(MAX(cf.qty), 0) as carry_forward,
                   COALESCE(MAX(cf.credit), 0) as carry_forward_credit,

                   -- 전월까지 누적입고 (2026-01 ~ 당월 전)
                   SUM(CASE WHEN il.inbound_date >= ? AND SUBSTR(il.inbound_date,1,7) < ?
                       THEN il.quantity ELSE 0 END) as cum_in_prev,
                   SUM(CASE WHEN il.inbound_date >= ? AND SUBSTR(il.inbound_date,1,7) < ?
                       THEN il.amount_krw ELSE 0 END) as cum_in_prev_credit,

                   -- 당월입고
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,7) = ?
                       THEN il.quantity ELSE 0 END) as cur_in,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,7) = ?
                       THEN il.amount_krw ELSE 0 END) as cur_in_credit,

                   -- 기말재고 (전기이월 + 올해입고 - 올해출고)
                   -- actual_stock은 FIFO 계산된 값
                   SUM(il.actual_stock) as end_balance,
                   SUM(CASE WHEN il.actual_stock > 0 THEN il.actual_stock * il.unit_price_usd * il.exchange_rate ELSE 0 END) as end_balance_credit,

                   -- 평균단가
                   CASE WHEN SUM(il.quantity) > 0 THEN SUM(il.amount_krw) / SUM(il.quantity) ELSE 0 END as avg_price_krw,

                   -- 크레딧 단가
                   COALESCE(MAX(cp.credit_usd), 0) as credit_usd,

                   -- 연도별 입고 금액
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2019' THEN il.amount_krw ELSE 0 END) as yr_2019,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2020' THEN il.amount_krw ELSE 0 END) as yr_2020,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2021' THEN il.amount_krw ELSE 0 END) as yr_2021,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2022' THEN il.amount_krw ELSE 0 END) as yr_2022,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2023' THEN il.amount_krw ELSE 0 END) as yr_2023,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2024' THEN il.amount_krw ELSE 0 END) as yr_2024,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2025' THEN il.amount_krw ELSE 0 END) as yr_2025,
                   SUM(CASE WHEN SUBSTR(il.inbound_date,1,4) = '2026' THEN il.amount_krw ELSE 0 END) as yr_2026

            FROM import_ledger il
            LEFT JOIN carry_forward cf ON il.part_number = cf.part_number
            LEFT JOIN credit_price cp ON il.part_number = cp.part_number
            WHERE 1=1 {search_cond}
            GROUP BY il.part_number
        """
        base_params = [
            YEAR_START, YEAR_MONTH, YEAR_START, YEAR_MONTH,
            YEAR_MONTH, YEAR_MONTH,
        ] + search_params

        count_row = conn.execute(f"SELECT COUNT(*) as cnt FROM ({base_sql})", base_params).fetchone()

        # 출고: shipment_log에서 Part#별 월별 분리
        ship_sql = """
            SELECT part_number,
                   SUM(CASE WHEN SUBSTR(ship_date,1,7) >= ? AND SUBSTR(ship_date,1,7) < ? THEN quantity ELSE 0 END) as cum_out_prev,
                   SUM(CASE WHEN SUBSTR(ship_date,1,7) = ? THEN quantity ELSE 0 END) as cur_out,
                   SUM(quantity) as total_out
            FROM shipment_log WHERE ship_date != ''
            GROUP BY part_number
        """
        ship_rows = conn.execute(ship_sql, [YEAR_START, YEAR_MONTH, YEAR_MONTH]).fetchall()
        ship_map = {}
        for sr in ship_rows:
            ship_map[sr["part_number"]] = {
                "cum_out_prev": sr["cum_out_prev"] or 0,
                "cur_out": sr["cur_out"] or 0,
                "total_out": sr["total_out"] or 0,
            }

        sort_map = {
            "part_number": "il.part_number", "vender": "vender",
            "carry_forward": "carry_forward", "end_balance": "end_balance",
            "cum_in_total": "cum_in_prev", "cur_in": "cur_in",
            "in_grand": "carry_forward",
            "cum_out_total": "end_balance", "cur_out": "end_balance",
        }
        order_col = sort_map.get(sort_by, "end_balance")
        offset = (page - 1) * page_size

        rows = conn.execute(
            f"{base_sql} ORDER BY {order_col} {sort_dir} LIMIT ? OFFSET ?",
            base_params + [page_size, offset],
        ).fetchall()

        items = []
        for r in rows:
            pn = r["part_number"]
            ship = ship_map.get(pn, {"cum_out_prev": 0, "cur_out": 0, "total_out": 0})

            cf = r["carry_forward"] or 0
            cf_c = round(r["carry_forward_credit"] or 0)
            cip = r["cum_in_prev"] or 0
            cip_c = round(r["cum_in_prev_credit"] or 0)
            ci = r["cur_in"] or 0
            ci_c = round(r["cur_in_credit"] or 0)
            cit = cip + ci
            cit_c = cip_c + ci_c
            ig = cf + cit
            ig_c = cf_c + cit_c

            cop = ship["cum_out_prev"]
            co = ship["cur_out"]
            cot = cop + co
            cusd = r["credit_usd"] or 0
            avg = r["avg_price_krw"] or 0
            cop_c = round(cop * avg)
            co_c = round(co * avg)
            cot_c = cop_c + co_c

            eb = r["end_balance"] or 0
            eb_c = round(r["end_balance_credit"] or 0)

            items.append({
                "part_number": pn,
                "family": "",
                "vender": r["vender"] or "",
                "customer": "",
                "credit_usd": round(cusd, 4),
                "carry_forward": cf, "carry_forward_credit": cf_c,
                "carry_forward_deduct": round(cf * cusd) if cusd > 0 else None,
                "cum_in_prev": cip, "cum_in_prev_credit": cip_c,
                "cum_in_prev_deduct": round(cip * cusd) if cusd > 0 else None,
                "cur_in": ci, "cur_in_credit": ci_c,
                "cur_in_deduct": round(ci * cusd) if cusd > 0 else None,
                "cum_in_total": cit, "cum_in_total_credit": cit_c,
                "cum_in_total_deduct": round(cit * cusd) if cusd > 0 else None,
                "in_grand": ig, "in_grand_credit": ig_c,
                "in_grand_deduct": round(ig * cusd) if cusd > 0 else None,
                "avg_price_krw": round(avg),
                "cum_out_prev": cop, "cum_out_prev_credit": cop_c,
                "cum_out_prev_deduct": round(cop * cusd) if cusd > 0 else None,
                "cur_out": co, "cur_out_credit": co_c,
                "cur_out_deduct": round(co * cusd) if cusd > 0 else None,
                "cum_out_total": cot, "cum_out_total_credit": cot_c,
                "cum_out_total_deduct": round(cot * cusd) if cusd > 0 else None,
                "end_balance": eb, "end_balance_credit": eb_c,
                "end_balance_deduct": round(eb * cusd) if cusd > 0 else None,
                "check_ok": (ig - cot) == eb,
                # 연도별
                "yr_2019": round(r["yr_2019"] or 0),
                "yr_2020": round(r["yr_2020"] or 0),
                "yr_2021": round(r["yr_2021"] or 0),
                "yr_2022": round(r["yr_2022"] or 0),
                "yr_2023": round(r["yr_2023"] or 0),
                "yr_2024": round(r["yr_2024"] or 0),
                "yr_2025": round(r["yr_2025"] or 0),
                "yr_2026": round(r["yr_2026"] or 0),
            })

        return {
            "items": items,
            "total": count_row["cnt"],
            "page": page,
            "page_size": page_size,
            "year_month": YEAR_MONTH,
        }
