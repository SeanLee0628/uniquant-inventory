"""엑셀 내보내기 및 CSV 다운로드"""

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from database import get_db
from typing import Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io
import csv

router = APIRouter()


@router.get("/export/inventory")
def export_inventory_excel(year_month: Optional[str] = None):
    """Mar inventory 92열 양식 그대로 엑셀 다운로드
    A~S 마스터 + T~AA DC연도 + AB~AD 총입고/총출고/전월 + AE~BI 입고1~31 + BJ~CN 출고1~31
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Mar inventory"

    # ─── 스타일 ───
    hdr_fill = PatternFill(start_color="2B5797", end_color="2B5797", fill_type="solid")
    hdr_font = Font(color="FFFFFF", bold=True, size=9)
    thin = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    # ─── 헤더 구성 (92열) ───
    # 행1: 빈 행 (원본과 동일)
    # 행2: 헤더
    master_headers = [
        "Central", "Sales team", "VENDER", "SR#", "FAMILY", "DID#", "Part#",
        "MOBIS ID", "unit", "site", "MOQ", "Package", "FAB",
        "Q'ty", "SALES", "CUSTOMER", "CRD", "booking", "available Q'ty",
    ]  # A~S (19열)
    dc_headers = [f"Datecode\n{y}" for y in range(2019, 2027)]  # T~AA (8열)
    summary_headers = ["총입고", "총출고", "전월"]  # AB~AD (3열)
    in_headers = [f"입고{d}" for d in range(1, 32)]   # AE~BI (31열)
    out_headers = [f"출고{d}" for d in range(1, 32)]  # BJ~CN (31열)

    all_headers = master_headers + dc_headers + summary_headers + in_headers + out_headers
    # 총 19 + 8 + 3 + 31 + 31 = 92열

    for col, h in enumerate(all_headers, 1):
        cell = ws.cell(row=2, column=col, value=h)
        cell.fill = hdr_fill
        cell.font = hdr_font
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin

    # ─── 데이터 ───
    # 자동 감지: year_month 없으면 가장 최근 월
    with get_db() as conn:
        if not year_month:
            r = conn.execute(
                "SELECT year_month FROM daily_inventory ORDER BY year_month DESC LIMIT 1"
            ).fetchone()
            year_month = r["year_month"] if r else ""

        masters = conn.execute(
            "SELECT * FROM product_master ORDER BY part_number"
        ).fetchall()

        for i, pm in enumerate(masters, 3):  # 데이터는 3행부터
            # A~S: 마스터
            row_data = [
                pm["central"], pm["sales_team"], pm["vender"], pm["sr_code"],
                pm["family"], pm["did"], pm["part_number"], pm["mobis_id"],
                pm["unit"], pm["site"], pm["moq"], pm["package"], pm["fab"],
                pm["current_qty"], pm["sales_person"], pm["customer"],
                pm["crd"], pm["booking"], pm["available_qty"],
            ]
            # T~AA: DC 연도별
            for y in range(2019, 2027):
                row_data.append(pm[f"dc_{y}"] or 0)
            # AB~AD: 총입고, 총출고, 전월
            row_data.append(pm["total_inbound"] or 0)
            row_data.append(pm["total_outbound"] or 0)
            row_data.append(pm["prev_month_balance"] or 0)

            # AE~BI: 입고 1~31일
            pn = pm["part_number"]
            daily = {}
            if year_month:
                daily_rows = conn.execute(
                    "SELECT day, inbound_qty, outbound_qty FROM daily_inventory WHERE part_number = ? AND year_month = ?",
                    (pn, year_month),
                ).fetchall()
                for dr in daily_rows:
                    daily[dr["day"]] = (dr["inbound_qty"] or 0, dr["outbound_qty"] or 0)

            for d in range(1, 32):
                inb, _ = daily.get(d, (0, 0))
                row_data.append(inb if inb else "")
            # BJ~CN: 출고 1~31일
            for d in range(1, 32):
                _, outb = daily.get(d, (0, 0))
                row_data.append(outb if outb else "")

            for col, val in enumerate(row_data, 1):
                cell = ws.cell(row=i, column=col, value=val)
                cell.border = thin
                if col <= 19:
                    cell.font = Font(size=9)

    # 열 너비
    widths = {1: 10, 2: 10, 3: 10, 4: 8, 5: 15, 6: 8, 7: 30, 8: 18,
              9: 5, 10: 8, 11: 8, 12: 10, 13: 5, 14: 10, 15: 8, 16: 18,
              17: 8, 18: 8, 19: 10}
    for c, w in widths.items():
        ws.column_dimensions[get_column_letter(c)].width = w
    # DC~출고 열은 좁게
    for c in range(20, 93):
        ws.column_dimensions[get_column_letter(c)].width = 7

    # 틀 고정 (G열까지 + 헤더 2행)
    ws.freeze_panes = "H3"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Mar_inventory_{year_month or 'all'}.xlsx"},
    )


@router.get("/export/shipments-csv")
def export_shipments_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    customer: Optional[str] = None,
    part_number: Optional[str] = None,
):
    """출고 이력 CSV 다운로드"""
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

    where = " AND ".join(conditions) if conditions else "1=1"

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["DATE", "CUSTOMER", "PART#", "Q'ty", "SALES", "lot number", "DATECODE"])

    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM shipment_log WHERE {where} ORDER BY ship_date DESC",
            params,
        ).fetchall()
        for r in rows:
            writer.writerow([
                r["ship_date"], r["customer"], r["part_number"],
                r["quantity"], r["sales_person"], r["lot_number"], r["datecode"],
            ])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=shipping_management.csv"},
    )
