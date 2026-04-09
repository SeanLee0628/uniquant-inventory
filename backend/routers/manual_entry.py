"""Datecode 수동 입력 API"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, timedelta, datetime
from database import get_db
import re

router = APIRouter()


def datecode_to_date(dc: str) -> date | None:
    if not dc or not re.match(r"^\d{6}$", str(dc).strip()):
        return None
    s = str(dc).strip()
    year = int(s[:4])
    week = int(s[4:6])
    if week < 1 or week > 53 or year < 2000 or year > 2100:
        return None
    return date(year, 1, 1) + timedelta(days=(week - 1) * 7)


def calc_urgency(days_elapsed: int) -> str:
    if days_elapsed < 365:
        return "normal"
    elif days_elapsed <= 730:
        return "warning"
    else:
        return "critical"


class ManualDatecodeEntry(BaseModel):
    inbound_date: str
    sr_number: str = ""
    part_number: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0)
    datecode: str = ""
    sales_person: str = ""
    customer: str = ""


class ManualEntryResponse(BaseModel):
    id: int
    message: str


@router.post("/manual-entry", response_model=ManualEntryResponse)
def create_manual_entry(entry: ManualDatecodeEntry):
    """Datecode 수동 입력"""
    dc_str = entry.datecode.strip()
    dc_date = datecode_to_date(dc_str)
    days_elapsed = (date.today() - dc_date).days if dc_date else 0
    urgency = calc_urgency(days_elapsed)

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO datecode_inventory (
                sales_team, inbound_date, sr_number, part_number, quantity,
                datecode, datecode_date, days_elapsed, sales_person, customer,
                po_number, remark, actual_stock, outbound_date, out_customer,
                out_part_number, out_quantity, out_sales, out_remark, status,
                unit_price_usd, amount_usd, exchange_rate, amount_krw, urgency
            ) VALUES (
                '수동입력', :inbound_date, :sr_number, :part_number, :quantity,
                :datecode, :datecode_date, :days_elapsed, :sales_person, :customer,
                '', '', :quantity, '', '',
                '', 0, '', '', '사용가능',
                0, 0, 0, 0, :urgency
            )""",
            {
                "inbound_date": entry.inbound_date,
                "sr_number": entry.sr_number,
                "part_number": entry.part_number,
                "quantity": entry.quantity,
                "datecode": dc_str,
                "datecode_date": dc_date.isoformat() if dc_date else "",
                "days_elapsed": days_elapsed,
                "sales_person": entry.sales_person,
                "customer": entry.customer,
                "urgency": urgency,
            },
        )
        new_id = cursor.lastrowid

        # daily_inventory에 입고 반영
        if entry.inbound_date:
            try:
                d = datetime.strptime(entry.inbound_date, "%Y-%m-%d")
                ym = d.strftime("%Y-%m")
                day = d.day
                conn.execute(
                    """INSERT INTO daily_inventory (part_number, year_month, day, inbound_qty)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(part_number, year_month, day)
                       DO UPDATE SET inbound_qty = inbound_qty + excluded.inbound_qty""",
                    (entry.part_number, ym, day, entry.quantity),
                )
            except (ValueError, TypeError):
                pass

    return ManualEntryResponse(id=new_id, message="입고 등록 완료")


@router.get("/manual-entry/recent")
def get_recent_entries(limit: int = 20):
    """최근 수동 입력 내역 조회"""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, inbound_date, sr_number, part_number, quantity,
                      datecode, sales_person, customer, created_at
               FROM datecode_inventory
               ORDER BY id DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/manual-entry/today")
def get_today_entries():
    """오늘 입고 내역 조회"""
    today = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, inbound_date, sr_number, part_number, quantity,
                      datecode, sales_person, customer, created_at
               FROM datecode_inventory
               WHERE inbound_date = ?
               ORDER BY id DESC""",
            (today,),
        ).fetchall()
        return [dict(r) for r in rows]
