"""재고 현황 조회 및 긴급 재고 필터"""

from fastapi import APIRouter, Query, HTTPException
from database import get_db
from typing import Optional
from datetime import date, timedelta
import re

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
        "customer": r["pm_customer"] or r["customer"] or "",
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
           pm.total_inbound, pm.total_outbound, pm.prev_month_balance,
           pm.customer as pm_customer
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


@router.get("/inventory/grouped")
def list_inventory_grouped(
    sales_team: Optional[str] = None,
    status: Optional[str] = None,
    urgency: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("total_stock", pattern="^(part_number|total_stock|lot_count|max_days|total_krw|worst_urgency)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """Part# 단위로 그룹핑된 재고 목록"""
    conditions = []
    params = []

    if sales_team:
        conditions.append("di.sales_team = ?")
        params.append(sales_team)
    if status:
        conditions.append("di.status = ?")
        params.append(status)
    if urgency:
        conditions.append("di.urgency = ?")
        params.append(urgency)
    if search:
        conditions.append(
            "(di.part_number LIKE ? OR di.sr_number LIKE ? OR di.customer LIKE ? OR di.sales_person LIKE ? OR pm.family LIKE ? OR pm.vender LIKE ? OR pm.customer LIKE ?)"
        )
        for _ in range(7):
            params.append(f"%{search}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    offset = (page - 1) * page_size

    # urgency 정렬용 CASE
    urgency_order = "CASE WHEN di.urgency='critical' THEN 3 WHEN di.urgency='warning' THEN 2 ELSE 1 END"

    sort_map = {
        "part_number": "di.part_number",
        "total_stock": "total_stock",
        "lot_count": "lot_count",
        "max_days": "max_days",
        "total_krw": "total_krw",
        "worst_urgency": "worst_urgency",
    }
    order_col = sort_map.get(sort_by, "total_stock")

    with get_db() as conn:
        count_row = conn.execute(
            f"""SELECT COUNT(DISTINCT di.part_number) as cnt
                FROM datecode_inventory di
                LEFT JOIN product_master pm ON di.part_number = pm.part_number
                WHERE {where}""",
            params,
        ).fetchone()

        rows = conn.execute(
            f"""SELECT di.part_number,
                       SUM(di.actual_stock) as total_stock,
                       SUM(di.out_quantity) as total_out_qty,
                       COUNT(*) as lot_count,
                       MAX(di.days_elapsed) as max_days,
                       SUM(di.amount_krw) as total_krw,
                       MAX({urgency_order}) as worst_urgency,
                       pm.family, pm.vender, pm.customer as pm_customer, pm.mobis_id, pm.moq, pm.site
                FROM datecode_inventory di
                LEFT JOIN product_master pm ON di.part_number = pm.part_number
                WHERE {where}
                GROUP BY di.part_number
                ORDER BY {order_col} {sort_dir}
                LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()

        items = []
        for r in rows:
            wu = r["worst_urgency"]
            urgency_str = "critical" if wu == 3 else ("warning" if wu == 2 else "normal")
            items.append({
                "part_number": r["part_number"],
                "total_stock": r["total_stock"] or 0,
                "total_out_qty": r["total_out_qty"] or 0,
                "lot_count": r["lot_count"],
                "max_days": r["max_days"] or 0,
                "total_krw": r["total_krw"] or 0,
                "worst_urgency": urgency_str,
                "family": r["family"] or "",
                "vender": r["vender"] or "",
                "customer": r["pm_customer"] or "",
                "mobis_id": r["mobis_id"] or "",
                "moq": r["moq"] or 0,
                "site": r["site"] or "",
            })

        return {
            "items": items,
            "total": count_row["cnt"],
            "page": page,
            "page_size": page_size,
        }


@router.get("/inventory/lots/{part_number}")
def get_part_lots(
    part_number: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    """특정 Part#의 DATECODE 로트 목록 (페이징, 실재고 내림차순)"""
    offset = (page - 1) * page_size
    with get_db() as conn:
        total_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM datecode_inventory WHERE part_number = ?",
            (part_number,),
        ).fetchone()
        rows = conn.execute(
            f"""{BASE_SELECT} WHERE di.part_number = ?
                ORDER BY di.actual_stock DESC
                LIMIT ? OFFSET ?""",
            (part_number, page_size, offset),
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


def _datecode_to_date(dc: str):
    if not dc or not re.match(r"^\d{6}$", str(dc).strip()):
        return None
    s = str(dc).strip()
    year = int(s[:4])
    week = int(s[4:6])
    if week < 1 or week > 53 or year < 2000 or year > 2100:
        return None
    return date(year, 1, 1) + timedelta(days=(week - 1) * 7)


def _calc_urgency(days_elapsed: int) -> str:
    if days_elapsed < 365:
        return "normal"
    elif days_elapsed <= 730:
        return "warning"
    return "critical"


@router.post("/inventory/inbound")
def add_inbound(data: dict):
    """수동 입고 추가 — DATECODE 원장에 1건 추가 + product_master 동기화"""
    sales_team = data.get("sales_team", "")
    inbound_date = data.get("inbound_date", "")
    sr_number = data.get("sr_number", "")
    part_number = data.get("part_number", "")
    quantity = int(data.get("quantity", 0))
    datecode = data.get("datecode", "")
    sales_person = data.get("sales_person", "")
    customer = data.get("customer", "")
    po_number = data.get("po_number", "")
    remark = data.get("remark", "")
    unit_price_usd = float(data.get("unit_price_usd", 0))
    exchange_rate = float(data.get("exchange_rate", 0))

    if not part_number:
        raise HTTPException(400, "Part#는 필수입니다.")
    if quantity <= 0:
        raise HTTPException(400, "수량은 1 이상이어야 합니다.")
    if not sales_team:
        raise HTTPException(400, "영업실을 선택해주세요.")

    dc_date = _datecode_to_date(datecode)
    days_elapsed = (date.today() - dc_date).days if dc_date else 0
    urgency = _calc_urgency(days_elapsed)
    amount_usd = quantity * unit_price_usd
    amount_krw = amount_usd * exchange_rate

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO datecode_inventory (
                sales_team, inbound_date, sr_number, part_number, quantity,
                datecode, datecode_date, days_elapsed, sales_person, customer,
                po_number, remark, actual_stock, status,
                unit_price_usd, amount_usd, exchange_rate, amount_krw, urgency
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '사용가능', ?, ?, ?, ?, ?)""",
            (sales_team, inbound_date, sr_number, part_number, quantity,
             datecode, dc_date.isoformat() if dc_date else "", days_elapsed,
             sales_person, customer, po_number, remark, quantity,
             unit_price_usd, amount_usd, exchange_rate, amount_krw, urgency),
        )

        # product_master 업데이트 (있으면 현재고 증가, 없으면 새로 생성)
        pm = conn.execute("SELECT id FROM product_master WHERE part_number = ?", (part_number,)).fetchone()
        if pm:
            conn.execute(
                """UPDATE product_master SET
                    current_qty = current_qty + ?,
                    available_qty = current_qty + ? - COALESCE(booking, 0),
                    total_inbound = total_inbound + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE part_number = ?""",
                (quantity, quantity, quantity, part_number),
            )
        else:
            conn.execute(
                """INSERT INTO product_master (part_number, sales_team, sr_code, customer,
                    current_qty, available_qty, total_inbound)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (part_number, sales_team, sr_number, customer, quantity, quantity, quantity),
            )

        # daily_inventory 반영
        if inbound_date:
            try:
                from datetime import datetime
                d = datetime.strptime(inbound_date, "%Y-%m-%d")
                ym = d.strftime("%Y-%m")
                day = d.day
                conn.execute(
                    """INSERT INTO daily_inventory (part_number, year_month, day, inbound_qty)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(part_number, year_month, day)
                       DO UPDATE SET inbound_qty = inbound_qty + excluded.inbound_qty""",
                    (part_number, ym, day, quantity),
                )
            except ValueError:
                pass

        return {
            "id": cursor.lastrowid,
            "part_number": part_number,
            "quantity": quantity,
            "datecode": datecode,
            "status": "사용가능",
        }
