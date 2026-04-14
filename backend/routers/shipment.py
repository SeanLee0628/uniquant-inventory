"""출고 입력 — FIFO 자동배정 + product_master 동기화 + DC 연도별 재집계"""

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from database import get_db
from typing import Optional
import json

router = APIRouter()


@router.get("/parts/search")
def search_parts(q: str = Query("", min_length=1)):
    """Part# 자동완성 검색"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT DISTINCT part_number FROM datecode_inventory
               WHERE part_number LIKE ? AND status != '완료'
               ORDER BY part_number LIMIT 20""",
            (f"%{q}%",),
        ).fetchall()
        return [r["part_number"] for r in rows]


@router.get("/parts/stock")
def get_part_stock(part_number: str):
    """Part# 가용재고 + 품목 상세 정보"""
    with get_db() as conn:
        # datecode_inventory에서 가용재고
        row = conn.execute(
            """SELECT COALESCE(SUM(actual_stock), 0) as total_stock
               FROM datecode_inventory
               WHERE part_number = ? AND status = '사용가능'""",
            (part_number,),
        ).fetchone()

        # product_master에서 상세 정보
        pm = conn.execute(
            """SELECT family, vender, moq, booking, current_qty, available_qty, customer, site
               FROM product_master WHERE part_number = ?""",
            (part_number,),
        ).fetchone()

        result = {
            "part_number": part_number,
            "available_stock": row["total_stock"],
        }
        if pm:
            result.update({
                "family": pm["family"] or "",
                "vender": pm["vender"] or "",
                "moq": pm["moq"] or 0,
                "booking": pm["booking"] or 0,
                "current_qty": pm["current_qty"] or 0,
                "available_qty": pm["available_qty"] or 0,
                "customer": pm["customer"] or "",
                "site": pm["site"] or "",
            })
        return result


def _recalculate_dc_yearly(conn, part_number: str):
    """datecode_inventory에서 해당 Part#의 사용가능 로트를 연도별 재집계"""
    for year in range(2019, 2027):
        r = conn.execute(
            """SELECT COALESCE(SUM(actual_stock), 0) as qty
               FROM datecode_inventory
               WHERE part_number = ? AND status != '완료'
               AND datecode LIKE ?""",
            (part_number, f"{year}%"),
        ).fetchone()
        conn.execute(
            f"UPDATE product_master SET dc_{year} = ? WHERE part_number = ?",
            (r["qty"], part_number),
        )


@router.get("/parts/lots")
def get_part_lots_for_shipment(part_number: str):
    """출고용 DATECODE별 가용재고 (같은 DC는 합산)"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT datecode, SUM(actual_stock) as total_stock, COUNT(*) as lot_count
               FROM datecode_inventory
               WHERE part_number = ? AND status = '사용가능' AND actual_stock > 0
               GROUP BY datecode
               ORDER BY datecode ASC""",
            (part_number,),
        ).fetchall()
        return [
            {"datecode": r["datecode"] or "", "total_stock": r["total_stock"],
             "lot_count": r["lot_count"]}
            for r in rows
        ]


@router.get("/parts/sr-lots")
def get_part_sr_lots(part_number: str):
    """출고용 SR#별 가용재고"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT sr_number, SUM(actual_stock) as total_stock, COUNT(*) as lot_count
               FROM datecode_inventory
               WHERE part_number = ? AND status = '사용가능' AND actual_stock > 0
               GROUP BY sr_number
               ORDER BY sr_number ASC""",
            (part_number,),
        ).fetchall()
        return [
            {"sr_number": r["sr_number"] or "", "total_stock": r["total_stock"],
             "lot_count": r["lot_count"]}
            for r in rows
        ]


@router.post("/shipment")
def create_shipment(data: dict):
    """출고 입력 + FIFO 자동배정 또는 DATECODE 명시 + product_master 동기화"""
    ship_date = data.get("ship_date", "")
    customer = data.get("customer", "")
    part_number = data.get("part_number", "")
    quantity = int(data.get("quantity", 0))
    sales_person = data.get("sales_person", "")
    lot_number = data.get("lot_number", "")
    datecode_input = data.get("datecode", "")
    alloc_mode = data.get("alloc_mode", "fifo")  # "fifo", "manual", "sr"
    manual_datecode = data.get("manual_datecode", None)  # 수동 선택 시 DATECODE
    manual_sr = data.get("manual_sr", None)  # SR# 명시 시

    if quantity <= 0:
        raise HTTPException(400, "수량은 1 이상이어야 합니다.")

    with get_db() as conn:
        # 1. 가용재고 확인
        if alloc_mode == "manual" and manual_datecode:
            stock_row = conn.execute(
                """SELECT COALESCE(SUM(actual_stock), 0) as avail
                   FROM datecode_inventory
                   WHERE part_number = ? AND datecode = ? AND status = '사용가능' AND actual_stock > 0""",
                (part_number, manual_datecode),
            ).fetchone()
            available = stock_row["avail"]
            if available == 0:
                raise HTTPException(400, f"DATECODE {manual_datecode}의 가용재고가 없습니다.")
        elif alloc_mode == "sr" and manual_sr:
            stock_row = conn.execute(
                """SELECT COALESCE(SUM(actual_stock), 0) as avail
                   FROM datecode_inventory
                   WHERE part_number = ? AND sr_number = ? AND status = '사용가능' AND actual_stock > 0""",
                (part_number, manual_sr),
            ).fetchone()
            available = stock_row["avail"]
            if available == 0:
                raise HTTPException(400, f"SR# {manual_sr}의 가용재고가 없습니다.")
        else:
            stock_row = conn.execute(
                """SELECT COALESCE(SUM(actual_stock), 0) as avail
                   FROM datecode_inventory
                   WHERE part_number = ? AND status = '사용가능' AND actual_stock > 0""",
                (part_number,),
            ).fetchone()
            available = stock_row["avail"]

        if quantity > available:
            raise HTTPException(400, f"출고수량({quantity})이 가용재고({available})를 초과합니다.")

        # 2. 로트 선택
        if alloc_mode == "manual" and manual_datecode:
            lots = conn.execute(
                """SELECT id, datecode, actual_stock, unit_price_usd, exchange_rate
                   FROM datecode_inventory
                   WHERE part_number = ? AND datecode = ? AND status = '사용가능' AND actual_stock > 0
                   ORDER BY id ASC""",
                (part_number, manual_datecode),
            ).fetchall()
        elif alloc_mode == "sr" and manual_sr:
            lots = conn.execute(
                """SELECT id, datecode, actual_stock, unit_price_usd, exchange_rate
                   FROM datecode_inventory
                   WHERE part_number = ? AND sr_number = ? AND status = '사용가능' AND actual_stock > 0
                   ORDER BY datecode ASC, id ASC""",
                (part_number, manual_sr),
            ).fetchall()
        else:
            lots = conn.execute(
                """SELECT id, datecode, actual_stock, unit_price_usd, exchange_rate
                   FROM datecode_inventory
                   WHERE part_number = ? AND status = '사용가능' AND actual_stock > 0
                   ORDER BY datecode ASC, id ASC""",
                (part_number,),
            ).fetchall()

        remaining = quantity
        allocations = []
        source_ids = []

        for lot in lots:
            if remaining <= 0:
                break
            alloc = min(remaining, lot["actual_stock"])
            new_stock = lot["actual_stock"] - alloc
            new_status = "완료" if new_stock == 0 else "사용가능"

            unit_usd = lot["unit_price_usd"] or 0
            exrate = lot["exchange_rate"] or 0
            new_amt_usd = new_stock * unit_usd
            new_amt_krw = new_amt_usd * exrate

            conn.execute(
                """UPDATE datecode_inventory
                   SET actual_stock = ?, status = ?,
                       amount_usd = ?, amount_krw = ?,
                       outbound_date = ?, out_customer = ?,
                       out_quantity = COALESCE(datecode_inventory.out_quantity, 0) + ?,
                       out_sales = ?
                   WHERE id = ?""",
                (new_stock, new_status, new_amt_usd, new_amt_krw,
                 ship_date, customer, alloc, sales_person, lot["id"]),
            )
            allocations.append({
                "datecode_id": lot["id"],
                "datecode": lot["datecode"],
                "allocated_qty": alloc,
                "remaining_stock": new_stock,
            })
            source_ids.append(lot["id"])
            remaining -= alloc

        # 3. product_master 업데이트
        conn.execute(
            """UPDATE product_master
               SET current_qty = current_qty - ?,
                   available_qty = current_qty - ? - COALESCE(booking, 0),
                   total_outbound = total_outbound + ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE part_number = ?""",
            (quantity, quantity, quantity, part_number),
        )

        # 4. Datecode 연도별 수량 재집계
        _recalculate_dc_yearly(conn, part_number)

        # 5. daily_inventory 출고 갱신
        try:
            d = datetime.strptime(ship_date, "%Y-%m-%d")
            ym = d.strftime("%Y-%m")
            day = d.day
            conn.execute(
                """INSERT INTO daily_inventory (part_number, year_month, day, outbound_qty)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(part_number, year_month, day)
                   DO UPDATE SET outbound_qty = daily_inventory.outbound_qty + excluded.outbound_qty""",
                (part_number, ym, day, quantity),
            )
        except ValueError:
            pass

        # 6. shipment_log 기록
        cursor = conn.execute(
            """INSERT INTO shipment_log
               (ship_date, customer, part_number, quantity, sales_person, lot_number, datecode, source_datecode_ids)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (ship_date, customer, part_number, quantity, sales_person, lot_number,
             datecode_input or (allocations[0]["datecode"] if allocations else ""),
             json.dumps(source_ids)),
        )

        return {
            "shipment": {
                "id": cursor.lastrowid,
                "ship_date": ship_date,
                "customer": customer,
                "part_number": part_number,
                "quantity": quantity,
                "sales_person": sales_person,
                "lot_number": lot_number,
                "datecode": datecode_input or "",
                "created_at": datetime.now().isoformat(),
            },
            "allocations": allocations,
        }


@router.get("/shipments")
def list_shipments(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    customer: Optional[str] = None,
    part_number: Optional[str] = None,
    sales_person: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    conditions = []
    params = []
    if start_date:
        conditions.append("ship_date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("ship_date <= ?")
        params.append(end_date)
    if customer:
        conditions.append("customer LIKE ?")
        params.append(f"%{customer}%")
    if part_number:
        conditions.append("part_number LIKE ?")
        params.append(f"%{part_number}%")
    if sales_person:
        conditions.append("sales_person LIKE ?")
        params.append(f"%{sales_person}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    offset = (page - 1) * page_size

    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT * FROM shipment_log WHERE {where}
                ORDER BY ship_date DESC, id DESC LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/shipments/count")
def count_shipments(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    customer: Optional[str] = None,
    part_number: Optional[str] = None,
    sales_person: Optional[str] = None,
):
    conditions = []
    params = []
    if start_date:
        conditions.append("ship_date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("ship_date <= ?")
        params.append(end_date)
    if customer:
        conditions.append("customer LIKE ?")
        params.append(f"%{customer}%")
    if part_number:
        conditions.append("part_number LIKE ?")
        params.append(f"%{part_number}%")
    if sales_person:
        conditions.append("sales_person LIKE ?")
        params.append(f"%{sales_person}%")
    where = " AND ".join(conditions) if conditions else "1=1"

    with get_db() as conn:
        row = conn.execute(f"SELECT COUNT(*) as cnt FROM shipment_log WHERE {where}", params).fetchone()
        return {"count": row["cnt"]}


@router.delete("/shipments/{shipment_id}")
def cancel_shipment(shipment_id: int):
    """출고 취소 — FIFO 역순 복원 + product_master 복원 + daily_inventory 차감"""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipment_log WHERE id = ?", (shipment_id,)).fetchone()
        if not row:
            raise HTTPException(404, "해당 출고 이력을 찾을 수 없습니다.")

        part_number = row["part_number"]
        quantity = row["quantity"]
        ship_date = row["ship_date"]
        source_ids_json = row["source_datecode_ids"]

        restored = []

        # 1. datecode_inventory 실재고 복원
        if source_ids_json:
            try:
                source_ids = json.loads(source_ids_json)
            except (json.JSONDecodeError, TypeError):
                source_ids = []

            if source_ids:
                # source_datecode_ids가 있으면 정확히 해당 로트들 복원
                remaining = quantity
                for dc_id in source_ids:
                    if remaining <= 0:
                        break
                    dc_row = conn.execute(
                        "SELECT id, actual_stock, quantity, status, unit_price_usd, exchange_rate FROM datecode_inventory WHERE id = ?",
                        (dc_id,),
                    ).fetchone()
                    if not dc_row:
                        continue
                    # 이 로트에서 차감된 양 = min(remaining, 원래입고 - 현재실재고)
                    max_restore = dc_row["quantity"] - dc_row["actual_stock"]
                    restore_qty = min(remaining, max_restore) if max_restore > 0 else 0
                    if restore_qty <= 0:
                        continue
                    new_stock = dc_row["actual_stock"] + restore_qty
                    unit_usd = dc_row["unit_price_usd"] or 0
                    exrate = dc_row["exchange_rate"] or 0
                    new_amt_usd = new_stock * unit_usd
                    new_amt_krw = new_amt_usd * exrate
                    new_out_qty = max(0, (dc_row["actual_stock"] + restore_qty) - new_stock + restore_qty)
                    conn.execute(
                        """UPDATE datecode_inventory
                           SET actual_stock = ?, status = '사용가능',
                               amount_usd = ?, amount_krw = ?,
                               out_quantity = MAX(0, COALESCE(datecode_inventory.out_quantity, 0) - ?),
                               outbound_date = CASE WHEN COALESCE(datecode_inventory.out_quantity, 0) - ? <= 0 THEN '' ELSE outbound_date END,
                               out_customer = CASE WHEN COALESCE(datecode_inventory.out_quantity, 0) - ? <= 0 THEN '' ELSE out_customer END,
                               out_sales = CASE WHEN COALESCE(datecode_inventory.out_quantity, 0) - ? <= 0 THEN '' ELSE out_sales END
                           WHERE id = ?""",
                        (new_stock, new_amt_usd, new_amt_krw, restore_qty, restore_qty, restore_qty, restore_qty, dc_id),
                    )
                    restored.append({"datecode_id": dc_id, "restored_qty": restore_qty})
                    remaining -= restore_qty

        if not restored:
            # source_ids가 없는 경우 (과거 임포트 데이터 등) — Part# 기준으로 가장 최근 완료 로트부터 복원
            remaining = quantity
            lots = conn.execute(
                """SELECT id, actual_stock, quantity, unit_price_usd, exchange_rate
                   FROM datecode_inventory
                   WHERE part_number = ? AND actual_stock < quantity
                   ORDER BY datecode DESC, id DESC""",
                (part_number,),
            ).fetchall()
            for lot in lots:
                if remaining <= 0:
                    break
                max_restore = lot["quantity"] - lot["actual_stock"]
                restore_qty = min(remaining, max_restore)
                if restore_qty <= 0:
                    continue
                new_stock = lot["actual_stock"] + restore_qty
                unit_usd = lot["unit_price_usd"] or 0
                exrate = lot["exchange_rate"] or 0
                conn.execute(
                    """UPDATE datecode_inventory
                       SET actual_stock = ?, status = '사용가능',
                           amount_usd = ?, amount_krw = ?,
                           out_quantity = MAX(0, COALESCE(datecode_inventory.out_quantity, 0) - ?),
                           outbound_date = CASE WHEN COALESCE(datecode_inventory.out_quantity, 0) - ? <= 0 THEN '' ELSE outbound_date END,
                           out_customer = CASE WHEN COALESCE(datecode_inventory.out_quantity, 0) - ? <= 0 THEN '' ELSE out_customer END,
                           out_sales = CASE WHEN COALESCE(datecode_inventory.out_quantity, 0) - ? <= 0 THEN '' ELSE out_sales END
                       WHERE id = ?""",
                    (new_stock, new_stock * unit_usd, new_stock * unit_usd * exrate, restore_qty, restore_qty, restore_qty, restore_qty, lot["id"]),
                )
                restored.append({"datecode_id": lot["id"], "restored_qty": restore_qty})
                remaining -= restore_qty

        # 2. product_master 복원
        conn.execute(
            """UPDATE product_master
               SET current_qty = current_qty + ?,
                   available_qty = current_qty + ? - COALESCE(booking, 0),
                   total_outbound = MAX(0, total_outbound - ?),
                   updated_at = CURRENT_TIMESTAMP
               WHERE part_number = ?""",
            (quantity, quantity, quantity, part_number),
        )

        # 3. DC 연도별 재집계
        _recalculate_dc_yearly(conn, part_number)

        # 4. daily_inventory 출고 차감
        if ship_date:
            try:
                d = datetime.strptime(ship_date, "%Y-%m-%d")
                ym = d.strftime("%Y-%m")
                day = d.day
                conn.execute(
                    """UPDATE daily_inventory
                       SET outbound_qty = MAX(0, outbound_qty - ?)
                       WHERE part_number = ? AND year_month = ? AND day = ?""",
                    (quantity, part_number, ym, day),
                )
            except ValueError:
                pass

        # 5. shipment_log 삭제
        conn.execute("DELETE FROM shipment_log WHERE id = ?", (shipment_id,))

        return {
            "cancelled_id": shipment_id,
            "part_number": part_number,
            "quantity": quantity,
            "restored_lots": restored,
        }
