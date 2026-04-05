from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date


class UploadResult(BaseModel):
    total: int = 0
    available: int = 0
    completed: int = 0
    waiting: int = 0
    errors: int = 0
    sales_team: str = ""


class ShipmentCreate(BaseModel):
    ship_date: str
    customer: str
    part_number: str
    quantity: int = Field(..., gt=0)
    sales_person: str = ""
    lot_number: str = ""
    datecode: str = ""


class ShipmentOut(BaseModel):
    id: int
    ship_date: str
    customer: str
    part_number: str
    quantity: int
    sales_person: str
    lot_number: str
    datecode: str
    created_at: str


class FifoAllocation(BaseModel):
    datecode_id: int
    datecode: str
    allocated_qty: int
    remaining_stock: int


class ShipmentResponse(BaseModel):
    shipment: ShipmentOut
    allocations: List[FifoAllocation]


class InventoryRow(BaseModel):
    id: int
    sales_team: str
    inbound_date: Optional[str]
    sr_number: Optional[str]
    part_number: Optional[str]
    quantity: int
    datecode: Optional[str]
    datecode_date: Optional[str]
    days_elapsed: int
    sales_person: Optional[str]
    customer: Optional[str]
    po_number: Optional[str]
    remark: Optional[str]
    actual_stock: int
    outbound_date: Optional[str]
    out_customer: Optional[str]
    out_quantity: int
    out_sales: Optional[str]
    status: str
    unit_price_usd: float
    amount_usd: float
    exchange_rate: float
    amount_krw: float
    urgency: str


class InventoryListResponse(BaseModel):
    items: List[InventoryRow]
    total: int
    page: int
    page_size: int


class DashboardSummary(BaseModel):
    total_amount_krw: float
    total_sku_count: int
    availability_rate: float
    urgent_count: int


class VendorValue(BaseModel):
    vender: str
    amount_krw: float


class FamilyAvailability(BaseModel):
    family: str
    total_qty: int
    available_qty: int
    rate: float


class MonthlyTrend(BaseModel):
    month: str
    inbound: int
    outbound: int


class DatecodeDist(BaseModel):
    year: str
    quantity: int


class ProductMasterRow(BaseModel):
    id: int
    central: Optional[str]
    sales_team: Optional[str]
    vender: Optional[str]
    sr_code: Optional[str]
    family: Optional[str]
    part_number: str
    moq: int
    current_qty: int
    booking: int
    available_qty: int


class MoqAlert(BaseModel):
    part_number: str
    family: Optional[str]
    vender: Optional[str]
    moq: int
    available_qty: int
    deficit: int
