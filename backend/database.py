"""PostgreSQL 데이터베이스 연결 및 초기화 — SQLite 호환 래퍼 포함"""

import os
import re
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get("DATABASE_URL", "")


# ─── SQLite 호환 래퍼 ───

class PgCursorWrapper:
    """sqlite3.Cursor와 호환되는 래퍼"""
    def __init__(self, cursor):
        self._cursor = cursor
        self.lastrowid = None

    def fetchall(self):
        try:
            return self._cursor.fetchall()
        except psycopg2.ProgrammingError:
            return []

    def fetchone(self):
        try:
            return self._cursor.fetchone()
        except psycopg2.ProgrammingError:
            return None


def _convert_sql(sql, params=None):
    """SQLite SQL → PostgreSQL 변환"""
    if params is not None and isinstance(params, dict):
        # :name → %(name)s
        sql = re.sub(r':(\w+)', r'%(\1)s', sql)
    elif params is not None:
        # ? → %s
        sql = sql.replace('?', '%s')
    # date('now') → CURRENT_DATE
    sql = sql.replace("date('now')", "CURRENT_DATE")
    return sql


class PgConnectionWrapper:
    """sqlite3.Connection과 호환되는 래퍼"""
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        sql = _convert_sql(sql, params)
        cur = self._conn.cursor(cursor_factory=RealDictCursor)

        # INSERT ... RETURNING id 자동 추가 (ON CONFLICT 제외)
        stripped = sql.strip().upper()
        needs_returning = (
            stripped.startswith('INSERT')
            and 'RETURNING' not in stripped
            and 'ON CONFLICT' not in stripped
        )
        if needs_returning:
            sql = sql.rstrip().rstrip(';') + ' RETURNING id'

        cur.execute(sql, params if params else None)

        wrapper = PgCursorWrapper(cur)
        if needs_returning:
            try:
                row = cur.fetchone()
                wrapper.lastrowid = row['id'] if row else None
            except Exception:
                wrapper.lastrowid = None
        return wrapper

    def executescript(self, sql):
        """executescript 호환 — 여러 문장 실행"""
        cur = self._conn.cursor()
        cur.execute(sql)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


# ─── 연결 관리 ───

def get_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return PgConnectionWrapper(conn)


@contextmanager
def get_db():
    wrapper = get_connection()
    try:
        yield wrapper
        wrapper.commit()
    except Exception:
        wrapper.rollback()
        raise
    finally:
        wrapper.close()


# ─── 테이블 초기화 ───

def init_db():
    with get_db() as conn:
        conn.executescript("""
            -- 품목 마스터
            CREATE TABLE IF NOT EXISTS product_master (
                id SERIAL PRIMARY KEY,
                central TEXT,
                sales_team TEXT,
                vender TEXT,
                sr_code TEXT,
                family TEXT,
                did TEXT,
                part_number TEXT,
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

            -- 거래 원장
            CREATE TABLE IF NOT EXISTS datecode_inventory (
                id SERIAL PRIMARY KEY,
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
                unit_price_usd DOUBLE PRECISION DEFAULT 0,
                amount_usd DOUBLE PRECISION DEFAULT 0,
                exchange_rate DOUBLE PRECISION DEFAULT 0,
                amount_krw DOUBLE PRECISION DEFAULT 0,
                urgency TEXT DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 출고 로그
            CREATE TABLE IF NOT EXISTS shipment_log (
                id SERIAL PRIMARY KEY,
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
                id SERIAL PRIMARY KEY,
                part_number TEXT NOT NULL,
                year_month TEXT NOT NULL,
                day INTEGER NOT NULL,
                inbound_qty INTEGER DEFAULT 0,
                outbound_qty INTEGER DEFAULT 0,
                UNIQUE(part_number, year_month, day)
            );

            -- 월별 수불 스냅샷
            CREATE TABLE IF NOT EXISTS monthly_ledger (
                id SERIAL PRIMARY KEY,
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
