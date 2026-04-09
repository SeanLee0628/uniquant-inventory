import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "inventory.db"))


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            -- 품목 마스터 (Mar inventory 업로드)
            CREATE TABLE IF NOT EXISTS product_master (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                central TEXT,
                sales_team TEXT,
                vender TEXT,
                sr_code TEXT,
                family TEXT,
                did TEXT,
                part_number TEXT UNIQUE,
                mobis_id TEXT,
                unit TEXT DEFAULT 'EA',
                site TEXT,
                moq INTEGER,
                package TEXT,
                fab TEXT,
                current_qty INTEGER DEFAULT 0,
                sales_person TEXT,
                customer TEXT,
                crd TEXT,
                booking INTEGER DEFAULT 0,
                available_qty INTEGER DEFAULT 0,
                dc_2019 INTEGER DEFAULT 0,
                dc_2020 INTEGER DEFAULT 0,
                dc_2021 INTEGER DEFAULT 0,
                dc_2022 INTEGER DEFAULT 0,
                dc_2023 INTEGER DEFAULT 0,
                dc_2024 INTEGER DEFAULT 0,
                dc_2025 INTEGER DEFAULT 0,
                dc_2026 INTEGER DEFAULT 0,
                total_inbound INTEGER DEFAULT 0,
                total_outbound INTEGER DEFAULT 0,
                prev_month_balance INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 거래 원장 (DATECODE 시트 업로드)
            CREATE TABLE IF NOT EXISTS datecode_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sales_team TEXT NOT NULL,
                inbound_date TEXT,
                sr_number TEXT,
                part_number TEXT,
                quantity INTEGER DEFAULT 0,
                datecode TEXT,
                datecode_date TEXT,
                days_elapsed INTEGER DEFAULT 0,
                sales_person TEXT,
                customer TEXT,
                po_number TEXT,
                remark TEXT,
                actual_stock INTEGER DEFAULT 0,
                outbound_date TEXT,
                out_customer TEXT,
                out_part_number TEXT,
                out_quantity INTEGER DEFAULT 0,
                out_sales TEXT,
                out_remark TEXT,
                status TEXT DEFAULT '사용가능',
                unit_price_usd REAL DEFAULT 0,
                amount_usd REAL DEFAULT 0,
                exchange_rate REAL DEFAULT 0,
                amount_krw REAL DEFAULT 0,
                urgency TEXT DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 출고 로그 (시스템 자동 생성)
            CREATE TABLE IF NOT EXISTS shipment_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ship_date TEXT NOT NULL,
                customer TEXT,
                part_number TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                sales_person TEXT,
                lot_number TEXT,
                datecode TEXT,
                source_datecode_ids TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 일별 입출고 집계
            CREATE TABLE IF NOT EXISTS daily_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                part_number TEXT NOT NULL,
                year_month TEXT NOT NULL,
                day INTEGER NOT NULL,
                inbound_qty INTEGER DEFAULT 0,
                outbound_qty INTEGER DEFAULT 0,
                UNIQUE(part_number, year_month, day)
            );

            -- 월별 수불 스냅샷 (매월 업로드 시 저장)
            CREATE TABLE IF NOT EXISTS monthly_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year_month TEXT NOT NULL,
                part_number TEXT NOT NULL,
                family TEXT,
                vender TEXT,
                customer TEXT,
                prev_balance INTEGER DEFAULT 0,
                month_inbound INTEGER DEFAULT 0,
                month_outbound INTEGER DEFAULT 0,
                end_balance INTEGER DEFAULT 0,
                booking INTEGER DEFAULT 0,
                available_qty INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year_month, part_number)
            );

            CREATE INDEX IF NOT EXISTS idx_monthly_ym ON monthly_ledger(year_month);
            CREATE INDEX IF NOT EXISTS idx_monthly_part ON monthly_ledger(part_number);

            CREATE INDEX IF NOT EXISTS idx_datecode_part ON datecode_inventory(part_number);
            CREATE INDEX IF NOT EXISTS idx_datecode_status ON datecode_inventory(status);
            CREATE INDEX IF NOT EXISTS idx_datecode_urgency ON datecode_inventory(urgency);
            CREATE INDEX IF NOT EXISTS idx_datecode_dc ON datecode_inventory(datecode);
            CREATE INDEX IF NOT EXISTS idx_shipment_date ON shipment_log(ship_date);
            CREATE INDEX IF NOT EXISTS idx_shipment_part ON shipment_log(part_number);
            CREATE INDEX IF NOT EXISTS idx_daily_part ON daily_inventory(part_number, year_month);
            CREATE INDEX IF NOT EXISTS idx_product_part ON product_master(part_number);
            CREATE INDEX IF NOT EXISTS idx_product_vender ON product_master(vender);
            CREATE INDEX IF NOT EXISTS idx_product_family ON product_master(family);
        """)

        # 기존 테이블에 누락 컬럼 추가 (마이그레이션)
        _migrate(conn)


def _migrate(conn):
    """기존 DB에 새 컬럼이 없으면 추가"""
    existing = {r[1] for r in conn.execute("PRAGMA table_info(product_master)").fetchall()}
    migrations = {
        "current_qty": "ALTER TABLE product_master ADD COLUMN current_qty INTEGER DEFAULT 0",
        "available_qty": "ALTER TABLE product_master ADD COLUMN available_qty INTEGER DEFAULT 0",
        "total_inbound": "ALTER TABLE product_master ADD COLUMN total_inbound INTEGER DEFAULT 0",
        "total_outbound": "ALTER TABLE product_master ADD COLUMN total_outbound INTEGER DEFAULT 0",
        "prev_month_balance": "ALTER TABLE product_master ADD COLUMN prev_month_balance INTEGER DEFAULT 0",
        "updated_at": "ALTER TABLE product_master ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    }
    for col, sql in migrations.items():
        if col not in existing:
            try:
                conn.execute(sql)
            except Exception:
                pass

    existing_sl = {r[1] for r in conn.execute("PRAGMA table_info(shipment_log)").fetchall()}
    if "source_datecode_ids" not in existing_sl:
        try:
            conn.execute("ALTER TABLE shipment_log ADD COLUMN source_datecode_ids TEXT")
        except Exception:
            pass
