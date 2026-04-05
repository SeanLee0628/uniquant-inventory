"""재고 현황 조회 및 긴급 재고 필터"""

from fastapi import APIRouter, Query
from database import get_db
from typing import Optional

router = APIRouter()


def row_to_dict(r) -> dict:
    return {
        "id": r["id"],
        "sales_team": r["sales_team"] or "",
        "inbound_date": r["inbound_date"] or "",
        "sr_number": r["sr_number"] or "",
        "part_number": r["part_number"] or "",
        "quantity": r["quantity"] or 0,
        "datecode": r["datecode"] or "",
        "datecode_date": r["datecode_date"] or "",
        "days_elapsed": r["days_elapsed"] or 0,
        "sales_person": r["sales_person"] or "",
        "customer": r["customer"] or "",
        "actual_stock": r["actual_stock"] or 0,
        "outbound_date": r["outbound_date"] or "",
        "out_customer": r["out_customer"] or "",
        "out_quantity": r["out_quantity"] or 0,
        "status": r["status"] or "사용가능",
        "unit_price_usd": r["unit_price_usd"] or 0,
        "amount_usd": r["amount_usd"] or 0,
        "exchange_rate": r["exchange_rate"] or 0,
        "amount_krw": r["amount_krw"] or 0,
        "urgency": r["urgency"] or "normal",
        # product_master JOIN 필드
        "family": r["family"] or "",
        "vender": r["vender"] or "",
        "mobis_id": r["mobis_id"] or "",
        "moq": r["moq"] or 0,
        "unit": r["unit"] or "",
        "site": r["site"] or "",
        "package": r["package"] or "",
        "fab": r["fab"] or "",
        "total_inbound": r["total_inbound"] or 0,
        "total_outbound": r["total_outbound"] or 0,
        "prev_month_balance": r["prev_month_balance"] or 0,
    }


BASE_SELECT = """
    SELECT di.*,
           pm.family, pm.vender, pm.mobis_id, pm.moq,
           pm.unit, pm.site, pm.package, pm.fab,
           pm.total_inbound, pm.total_outbound, pm.prev_month_balance
    FROM datecode_inventory di
    LEFT JOIN product_master pm ON di.part_number = pm.part_number
"""


@router.get("/inventory")
def list_inventory(
    sales_team: Optional[str] = None,
    part_number: Optional[str] = None,
    status: Optional[str] = None,
    urgency: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("di.id", pattern="^(di\\.id|di\\.part_number|di\\.datecode|di\\.days_elapsed|di\\.actual_stock|di\\.amount_krw|di\\.status|di\\.urgency|di\\.inbound_date)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    conditions = []
    params = []

    if sales_team:
        conditions.append("di.sales_team = ?")
        params.append(sales_team)
    if part_number:
        conditions.append("di.part_number LIKE ?")
        params.append(f"%{part_number}%")
    if status:
        conditions.append("di.status = ?")
        params.append(status)
    if urgency:
        conditions.append("di.urgency = ?")
        params.append(urgency)
    if search:
        conditions.append(
            "(di.part_number LIKE ? OR di.sr_number LIKE ? OR di.customer LIKE ? OR di.sales_person LIKE ? OR pm.family LIKE ? OR pm.vender LIKE ?)"
        )
        for _ in range(6):
            params.append(f"%{search}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    offset = (page - 1) * page_size

    with get_db() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) as cnt FROM datecode_inventory di LEFT JOIN product_master pm ON di.part_number = pm.part_number WHERE {where}",
            params,
        ).fetchone()

        rows = conn.execute(
            f"""{BASE_SELECT} WHERE {where}
                ORDER BY {sort_by} {sort_dir}
                LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()

        return {
            "items": [row_to_dict(r) for r in rows],
            "total": total_row["cnt"],
            "page": page,
            "page_size": page_size,
        }


@router.get("/inventory/urgent")
def list_urgent(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """긴급 재고만 조회 (2년 초과)"""
    offset = (page - 1) * page_size
    with get_db() as conn:
        total_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM datecode_inventory WHERE urgency = 'critical' AND status = '사용가능'"
        ).fetchone()
        rows = conn.execute(
            f"""{BASE_SELECT}
                WHERE di.urgency = 'critical' AND di.status = '사용가능'
                ORDER BY di.days_elapsed DESC
                LIMIT ? OFFSET ?""",
            (page_size, offset),
        ).fetchall()
        return {
            "items": [row_to_dict(r) for r in rows],
            "total": total_row["cnt"],
            "page": page,
            "page_size": page_size,
        }


@router.get("/inventory/daily/{part_number}")
def get_daily_inventory(part_number: str, year_month: Optional[str] = None):
    """Part#의 일별 입출고 조회"""
    with get_db() as conn:
        if not year_month:
            r = conn.execute(
                "SELECT year_month FROM daily_inventory WHERE part_number = ? ORDER BY year_month DESC LIMIT 1",
                (part_number,),
            ).fetchone()
            year_month = r["year_month"] if r else ""

        if not year_month:
            return {"part_number": part_number, "year_month": "", "days": []}

        rows = conn.execute(
            "SELECT day, inbound_qty, outbound_qty FROM daily_inventory WHERE part_number = ? AND year_month = ? ORDER BY day",
            (part_number, year_month),
        ).fetchall()

        available_months = conn.execute(
            "SELECT DISTINCT year_month FROM daily_inventory WHERE part_number = ? ORDER BY year_month DESC",
            (part_number,),
        ).fetchall()

        return {
            "part_number": part_number,
            "year_month": year_month,
            "available_months": [r["year_month"] for r in available_months],
            "days": [{"day": r["day"], "inbound": r["inbound_qty"] or 0, "outbound": r["outbound_qty"] or 0} for r in rows],
        }


@router.get("/inventory/moq-alerts")
def moq_alerts():
    """가용재고 <= MOQ인 품목 경고"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT part_number, family, vender, moq, booking, available_qty
               FROM product_master
               WHERE moq > 0 AND available_qty <= moq"""
        ).fetchall()
        return [
            {
                "part_number": r["part_number"],
                "family": r["family"],
                "vender": r["vender"],
                "moq": r["moq"],
                "available_qty": r["available_qty"] or 0,
                "deficit": (r["moq"] or 0) - (r["available_qty"] or 0),
            }
            for r in rows
        ]


@router.get("/inventory/{part_number}")
def get_part_detail(part_number: str):
    """품목 상세: 마스터 + 거래이력 + 출고이력"""
    with get_db() as conn:
        pm = conn.execute("SELECT * FROM product_master WHERE part_number = ?", (part_number,)).fetchone()
        master = dict(pm) if pm else None

        dc_rows = conn.execute(
            """SELECT * FROM datecode_inventory WHERE part_number = ?
               ORDER BY datecode ASC""",
            (part_number,),
        ).fetchall()

        ship_rows = conn.execute(
            """SELECT * FROM shipment_log WHERE part_number = ?
               ORDER BY ship_date DESC LIMIT 20""",
            (part_number,),
        ).fetchall()

        last_ship = conn.execute(
            "SELECT ship_date, customer FROM shipment_log WHERE part_number = ? ORDER BY ship_date DESC LIMIT 1",
            (part_number,),
        ).fetchone()

        return {
            "master": master,
            "datecode_lots": [dict(r) for r in dc_rows],
            "shipment_history": [dict(r) for r in ship_rows],
            "last_shipment": dict(last_ship) if last_ship else None,
        }
