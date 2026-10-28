"""Sales, commissions, leads, follow-ups and agent performance.

Everything here is additive: app2.py only calls build_router(...) once at the
bottom of the file. All routes require a logged-in account (JWT) and every query
is scoped to the caller's tenant — tenant_id/agent_id never come from the request
body, except where a sysadmin or owner explicitly picks an agent in their own tenant.
"""
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from commissions import (
    DEFAULT_AGENT_SPLIT_PCT,
    DEFAULT_RENT_RATE_PCT,
    DEFAULT_SALE_RATE_PCT,
    compute_commission,
    normalize_purpose,
    purpose_kind,
)
from permissions import days_until_birthday

LEAD_STATUSES = ["new", "contacted", "viewing", "negotiation", "won", "lost"]
SALE_STATUSES = ["pending", "paid", "cancelled"]
FOLLOW_UP_CHANNELS = ["call", "whatsapp", "sms", "email", "meeting"]


# ---------------------------------------------------------------- request models
class SaleCreate(BaseModel):
    property_id: int
    sale_price: Optional[float] = None          # defaults to the listing price
    lead_id: Optional[int] = None
    commission_rate_pct: Optional[float] = None  # overrides the agency default for this deal
    agent_id: Optional[int] = None               # owners only: credit another agent
    closed_at: Optional[date] = None
    notes: Optional[str] = None


class SaleStatusUpdate(BaseModel):
    status: str


class CommissionSettingsUpdate(BaseModel):
    sale_rate_pct: float
    rent_rate_pct: float
    agent_split_pct: float
    tenant_id: Optional[int] = None  # sysadmin only


class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    bday: Optional[date] = None
    income: Optional[float] = None
    is_investor: bool = False
    status: str = "new"
    assigned_agent_id: Optional[int] = None  # owners only


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    bday: Optional[date] = None
    income: Optional[float] = None
    is_investor: Optional[bool] = None
    status: Optional[str] = None
    assigned_agent_id: Optional[int] = None  # owners only


class FollowUpCreate(BaseModel):
    due_at: datetime
    note: Optional[str] = None
    channel: Optional[str] = None


class FollowUpComplete(BaseModel):
    outcome: Optional[str] = None


def build_router(get_connection, get_current_account) -> APIRouter:
    router = APIRouter()

    # ------------------------------------------------------------ small helpers
    @contextmanager
    def db():
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            yield conn, cur
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()

    def need_role(caller, *roles):
        if caller["role"] not in roles:
            raise HTTPException(status_code=403, detail="You don't have permission to do this.")

    def scope_tenant(caller, requested_tenant_id=None):
        """Tenant to filter by. Sysadmins may choose (None = every tenant);
        everyone else is locked to their own."""
        if caller["role"] == "sysadmin":
            return requested_tenant_id
        return caller["tenant_id"]

    def tenant_settings(cur, tenant_id):
        cur.execute("SELECT sale_rate_pct, rent_rate_pct, agent_split_pct FROM commission_settings WHERE tenant_id = %s", (tenant_id,))
        row = cur.fetchone()
        if row:
            return row
        return {
            "sale_rate_pct": DEFAULT_SALE_RATE_PCT,
            "rent_rate_pct": DEFAULT_RENT_RATE_PCT,
            "agent_split_pct": DEFAULT_AGENT_SPLIT_PCT,
        }

    def agent_in_tenant(cur, agent_id, tenant_id):
        cur.execute(
            "SELECT id FROM accounts WHERE id = %s AND tenant_id = %s AND role IN ('agent','owner')",
            (agent_id, tenant_id),
        )
        return cur.fetchone() is not None

    def set_property_status(cur, property_id, status):
        """Best-effort: the status column may have a CHECK constraint we can't see.
        A savepoint means a rejected value never aborts the real transaction."""
        cur.execute("SAVEPOINT prop_status")
        try:
            cur.execute("UPDATE property_data SET status = %s WHERE id = %s", (status, property_id))
            cur.execute("RELEASE SAVEPOINT prop_status")
            return True
        except psycopg2.Error:
            cur.execute("ROLLBACK TO SAVEPOINT prop_status")
            return False

    # ================================================================ COMMISSIONS
    @router.get("/commissions/settings")
    def get_commission_settings(tenant_id: Optional[int] = None, caller: dict = Depends(get_current_account)):
        need_role(caller, "owner", "sysadmin")  # ADDED: agents can't read the commission settings
        tid = scope_tenant(caller, tenant_id) or caller["tenant_id"]
        with db() as (conn, cur):
            return {"tenant_id": tid, **tenant_settings(cur, tid)}

    @router.put("/commissions/settings")
    def update_commission_settings(body: CommissionSettingsUpdate, caller: dict = Depends(get_current_account)):
        need_role(caller, "owner", "sysadmin")
        tid = body.tenant_id if caller["role"] == "sysadmin" and body.tenant_id else caller["tenant_id"]
        # Validate with the same rules the calculator uses.
        try:
            compute_commission(1, "For Sale", rate_pct=body.sale_rate_pct, agent_split_pct=body.agent_split_pct)
            compute_commission(1, "For Rent", rate_pct=body.rent_rate_pct, agent_split_pct=body.agent_split_pct)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        with db() as (conn, cur):
            cur.execute(
                """
                INSERT INTO commission_settings (tenant_id, sale_rate_pct, rent_rate_pct, agent_split_pct, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (tenant_id) DO UPDATE SET
                    sale_rate_pct = EXCLUDED.sale_rate_pct,
                    rent_rate_pct = EXCLUDED.rent_rate_pct,
                    agent_split_pct = EXCLUDED.agent_split_pct,
                    updated_at = now()
                RETURNING tenant_id, sale_rate_pct, rent_rate_pct, agent_split_pct
                """,
                (tid, body.sale_rate_pct, body.rent_rate_pct, body.agent_split_pct),
            )
            row = cur.fetchone()
            conn.commit()
            return row

    @router.get("/commissions/calculate")
    def calculate_commission(
        price: float,
        purpose: str,
        rate_pct: Optional[float] = None,
        agent_split_pct: Optional[float] = None,
        caller: dict = Depends(get_current_account),
    ):
        """Preview only — nothing is saved. Uses the agency's defaults unless overridden."""
        with db() as (conn, cur):
            s = tenant_settings(cur, caller["tenant_id"])
        try:
            return compute_commission(
                price, purpose, rate_pct=rate_pct,
                agent_split_pct=s["agent_split_pct"] if agent_split_pct is None else agent_split_pct,
                sale_rate_pct=s["sale_rate_pct"], rent_rate_pct=s["rent_rate_pct"],
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.get("/commissions/summary")
    def commission_summary(
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        tenant_id: Optional[int] = None,
        caller: dict = Depends(get_current_account),
    ):
        """Per-agent totals. Agents see only their own row; owners see their agency."""
        tid = scope_tenant(caller, tenant_id)
        where, params = ["s.status <> 'cancelled'"], []
        if tid is not None:
            where.append("s.tenant_id = %s")
            params.append(tid)
        if caller["role"] == "agent":
            where.append("s.agent_id = %s")
            params.append(caller["id"])
        if date_from:
            where.append("s.closed_at >= %s")
            params.append(date_from)
        if date_to:
            where.append("s.closed_at <= %s")
            params.append(date_to)
        with db() as (conn, cur):
            cur.execute(
                f"""
                SELECT s.agent_id, a.name AS agent_name, a.email AS agent_email,
                       COUNT(*) FILTER (WHERE s.kind = 'sale')                         AS sales_count,
                       COUNT(*) FILTER (WHERE s.kind = 'rent')                         AS rentals_count,
                       COALESCE(SUM(s.sale_price) FILTER (WHERE s.kind = 'sale'), 0)   AS sales_volume,
                       COALESCE(SUM(s.gross_commission), 0)                            AS gross_commission,
                       COALESCE(SUM(s.agent_commission), 0)                            AS agent_commission,
                       COALESCE(SUM(s.agency_commission), 0)                           AS agency_commission,
                       COALESCE(SUM(s.agent_commission) FILTER (WHERE s.status = 'pending'), 0) AS agent_commission_pending,
                       COALESCE(SUM(s.agent_commission) FILTER (WHERE s.status = 'paid'), 0)    AS agent_commission_paid
                FROM sales s
                JOIN accounts a ON a.id = s.agent_id
                WHERE {' AND '.join(where)}
                GROUP BY s.agent_id, a.name, a.email
                ORDER BY agent_commission DESC
                """,
                tuple(params),
            )
            agents = cur.fetchall()
        keys = ["sales_count", "rentals_count", "sales_volume", "gross_commission", "agent_commission",
                "agency_commission", "agent_commission_pending", "agent_commission_paid"]
        totals = {k: sum((a[k] or 0) for a in agents) for k in keys}
        return {"agents": agents, "totals": totals}

    # ===================================================================== SALES
    @router.post("/sales")
    def record_sale(body: SaleCreate, caller: dict = Depends(get_current_account)):
        """Record a closed sale/rental and calculate its commission."""
        need_role(caller, "agent", "owner")
        # ADDED: the commission rate comes from the agency settings; only the owner may change it for a deal
        if caller["role"] == "agent" and body.commission_rate_pct is not None:
            raise HTTPException(status_code=403, detail="Only the owner can change the commission rate.")
        with db() as (conn, cur):
            cur.execute(
                "SELECT id, tenant_id, agent_id, price, purpose FROM property_data WHERE id = %s FOR UPDATE",
                (body.property_id,),
            )
            prop = cur.fetchone()
            if not prop or prop["tenant_id"] != caller["tenant_id"]:
                # Listings of other agencies are viewable but can't be sold by you.
                raise HTTPException(status_code=404, detail="Property not found in your agency.")

            # Who gets credited?
            if caller["role"] == "agent":
                if body.agent_id not in (None, caller["id"]):
                    raise HTTPException(status_code=403, detail="Agents can only record their own deals.")
                credited = caller["id"]
            else:  # owner
                credited = body.agent_id or prop["agent_id"] or caller["id"]
                if not agent_in_tenant(cur, credited, caller["tenant_id"]):
                    raise HTTPException(status_code=400, detail="That agent is not in your agency.")

            price = body.sale_price if body.sale_price is not None else prop["price"]
            s = tenant_settings(cur, caller["tenant_id"])
            try:
                calc = compute_commission(
                    price, prop["purpose"], rate_pct=body.commission_rate_pct,
                    agent_split_pct=s["agent_split_pct"],
                    sale_rate_pct=s["sale_rate_pct"], rent_rate_pct=s["rent_rate_pct"],
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            if body.lead_id is not None:
                cur.execute("SELECT id FROM leads WHERE id = %s AND tenant_id = %s", (body.lead_id, caller["tenant_id"]))
                if not cur.fetchone():
                    raise HTTPException(status_code=400, detail="Lead not found in your agency.")

            try:
                cur.execute(
                    """
                    INSERT INTO sales (tenant_id, property_id, agent_id, lead_id, kind, sale_price,
                                       commission_rate_pct, gross_commission, agent_split_pct,
                                       agent_commission, agency_commission, closed_at, notes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s, CURRENT_DATE),%s)
                    RETURNING id
                    """,
                    (caller["tenant_id"], prop["id"], credited, body.lead_id, calc["kind"], calc["price"],
                     calc["rate_pct"], calc["gross_commission"], calc["agent_split_pct"],
                     calc["agent_commission"], calc["agency_commission"], body.closed_at, body.notes),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(status_code=409, detail="This property already has a recorded deal. Cancel it first to record a new one.")
            sale_id = cur.fetchone()["id"]

            marked = set_property_status(cur, prop["id"], "sold" if calc["kind"] == "sale" else "rented")
            if body.lead_id is not None:
                cur.execute("UPDATE leads SET status = 'won' WHERE id = %s", (body.lead_id,))
            conn.commit()
            return {"success": True, "id": sale_id, "commission": calc, "agent_id": credited,
                    "property_status_updated": marked}

    @router.get("/sales")
    def list_sales(
        status: Optional[str] = None,
        agent_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        tenant_id: Optional[int] = None,
        limit: int = 100,
        caller: dict = Depends(get_current_account),
    ):
        tid = scope_tenant(caller, tenant_id)
        where, params = ["1=1"], []
        if tid is not None:
            where.append("s.tenant_id = %s")
            params.append(tid)
        if caller["role"] == "agent":
            where.append("s.agent_id = %s")  # agents only see their own deals
            params.append(caller["id"])
        elif agent_id:
            where.append("s.agent_id = %s")
            params.append(agent_id)
        if status:
            if status not in SALE_STATUSES:
                raise HTTPException(status_code=400, detail=f"status must be one of {SALE_STATUSES}")
            where.append("s.status = %s")
            params.append(status)
        if date_from:
            where.append("s.closed_at >= %s")
            params.append(date_from)
        if date_to:
            where.append("s.closed_at <= %s")
            params.append(date_to)
        params.append(max(1, min(limit, 500)))
        with db() as (conn, cur):
            cur.execute(
                f"""
                SELECT s.id, s.property_id, s.agent_id, a.name AS agent_name, a.email AS agent_email,
                       s.lead_id, s.kind, s.sale_price, s.commission_rate_pct, s.gross_commission,
                       s.agent_split_pct, s.agent_commission, s.agency_commission, s.status,
                       s.closed_at, s.paid_at, s.notes,
                       p.prop_type, l.raw_text AS location
                FROM sales s
                JOIN accounts a ON a.id = s.agent_id
                JOIN property_data p ON p.id = s.property_id
                LEFT JOIN locations l ON l.id = p.location_id
                WHERE {' AND '.join(where)}
                ORDER BY s.closed_at DESC, s.id DESC
                LIMIT %s
                """,
                tuple(params),
            )
            return cur.fetchall()

    @router.patch("/sales/{sale_id}/status")
    def update_sale_status(sale_id: int, body: SaleStatusUpdate, caller: dict = Depends(get_current_account)):
        """Owner marks a commission paid / pending, or cancels the deal."""
        need_role(caller, "owner", "sysadmin")
        if body.status not in SALE_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {SALE_STATUSES}")
        with db() as (conn, cur):
            cur.execute("SELECT id, tenant_id, property_id, status FROM sales WHERE id = %s FOR UPDATE", (sale_id,))
            sale = cur.fetchone()
            if not sale or (caller["role"] == "owner" and sale["tenant_id"] != caller["tenant_id"]):
                raise HTTPException(status_code=404, detail="Sale not found.")
            if sale["status"] == "cancelled":
                raise HTTPException(status_code=409, detail="A cancelled deal can't be changed. Record a new one instead.")
            cur.execute(
                """
                UPDATE sales SET status = %s,
                       paid_at = CASE WHEN %s = 'paid' THEN now() ELSE NULL END
                WHERE id = %s
                """,
                (body.status, body.status, sale_id),
            )
            if body.status == "cancelled":
                set_property_status(cur, sale["property_id"], "active")  # relist the property
            conn.commit()
            return {"success": True, "id": sale_id, "status": body.status}

    # ===================================================================== LEADS
    def lead_visible_clause(caller, where, params):
        tid = scope_tenant(caller)
        if tid is not None:
            where.append("l.tenant_id = %s")
            params.append(tid)
        if caller["role"] == "agent":
            where.append("l.assigned_agent_id = %s")
            params.append(caller["id"])

    @router.post("/leads")
    def create_lead(body: LeadCreate, caller: dict = Depends(get_current_account)):
        need_role(caller, "agent", "owner")
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Lead name is required.")
        if body.status not in LEAD_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {LEAD_STATUSES}")
        with db() as (conn, cur):
            if caller["role"] == "agent":
                assigned = caller["id"]
            else:
                assigned = body.assigned_agent_id or caller["id"]
                if not agent_in_tenant(cur, assigned, caller["tenant_id"]):
                    raise HTTPException(status_code=400, detail="That agent is not in your agency.")
            cur.execute(
                """
                INSERT INTO leads (tenant_id, assigned_agent_id, name, phone, email, notes, bday, income, is_investor, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
                """,
                (caller["tenant_id"], assigned, body.name.strip(), body.phone, body.email, body.notes,
                 body.bday, body.income, body.is_investor, body.status),
            )
            new_id = cur.fetchone()["id"]
            conn.commit()
            return {"success": True, "id": new_id}

    @router.get("/leads")
    def list_leads(status: Optional[str] = None, q: Optional[str] = None, limit: int = 200,
                   caller: dict = Depends(get_current_account)):
        where, params = ["1=1"], []
        lead_visible_clause(caller, where, params)
        if status:
            where.append("l.status = %s")
            params.append(status)
        if q:
            where.append("(l.name ILIKE %s OR l.phone ILIKE %s OR l.email ILIKE %s)")
            params.extend([f"%{q}%"] * 3)
        params.append(max(1, min(limit, 500)))
        with db() as (conn, cur):
            cur.execute(
                f"""
                SELECT l.id, l.name, l.phone, l.email, l.status, l.notes, l.bday, l.income, l.is_investor,
                       l.assigned_agent_id, a.name AS agent_name, l.created_at,
                       (SELECT MIN(f.due_at) FROM follow_ups f WHERE f.lead_id = l.id AND f.status = 'pending') AS next_follow_up
                FROM leads l
                LEFT JOIN accounts a ON a.id = l.assigned_agent_id
                WHERE {' AND '.join(where)}
                ORDER BY l.created_at DESC NULLS LAST, l.id DESC
                LIMIT %s
                """,
                tuple(params),
            )
            return cur.fetchall()

    @router.put("/leads/{lead_id}")
    def update_lead(lead_id: int, body: LeadUpdate, caller: dict = Depends(get_current_account)):
        need_role(caller, "agent", "owner")
        fields = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else body.dict(exclude_unset=True)
        if "status" in fields and fields["status"] not in LEAD_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {LEAD_STATUSES}")
        with db() as (conn, cur):
            cur.execute("SELECT id, tenant_id, assigned_agent_id FROM leads WHERE id = %s", (lead_id,))
            lead = cur.fetchone()
            if not lead or lead["tenant_id"] != caller["tenant_id"]:
                raise HTTPException(status_code=404, detail="Lead not found.")
            if caller["role"] == "agent" and lead["assigned_agent_id"] != caller["id"]:
                raise HTTPException(status_code=403, detail="This lead is assigned to another agent.")
            if "assigned_agent_id" in fields:
                if caller["role"] != "owner":
                    raise HTTPException(status_code=403, detail="Only the owner can reassign leads.")
                if not agent_in_tenant(cur, fields["assigned_agent_id"], caller["tenant_id"]):
                    raise HTTPException(status_code=400, detail="That agent is not in your agency.")
            if not fields:
                raise HTTPException(status_code=400, detail="Nothing to update.")
            allowed = {"name", "phone", "email", "notes", "bday", "income", "is_investor", "status", "assigned_agent_id"}
            cols = [c for c in fields if c in allowed]
            cur.execute(
                f"UPDATE leads SET {', '.join(c + ' = %s' for c in cols)} WHERE id = %s",
                tuple(fields[c] for c in cols) + (lead_id,),
            )
            conn.commit()
            return {"success": True}

    @router.get("/leads/birthdays")
    def upcoming_birthdays(days: int = 14, caller: dict = Depends(get_current_account)):
        """Leads whose birthday falls in the next `days` days — handy for personal follow-ups."""
        where, params = ["l.bday IS NOT NULL"], []
        lead_visible_clause(caller, where, params)
        with db() as (conn, cur):
            cur.execute(
                f"SELECT l.id, l.name, l.phone, l.bday, l.is_investor FROM leads l WHERE {' AND '.join(where)}",
                tuple(params),
            )
            rows = cur.fetchall()
        today = date.today()
        result = []
        for r in rows:
            d = days_until_birthday(r["bday"], today)
            if d <= max(0, min(days, 366)):
                result.append({**r, "days_until": d})
        return sorted(result, key=lambda r: r["days_until"])

    # ================================================================ FOLLOW-UPS
    @router.post("/leads/{lead_id}/follow-ups")
    def add_follow_up(lead_id: int, body: FollowUpCreate, caller: dict = Depends(get_current_account)):
        need_role(caller, "agent", "owner")
        if body.channel and body.channel not in FOLLOW_UP_CHANNELS:
            raise HTTPException(status_code=400, detail=f"channel must be one of {FOLLOW_UP_CHANNELS}")
        with db() as (conn, cur):
            cur.execute("SELECT id, tenant_id, assigned_agent_id FROM leads WHERE id = %s", (lead_id,))
            lead = cur.fetchone()
            if not lead or lead["tenant_id"] != caller["tenant_id"]:
                raise HTTPException(status_code=404, detail="Lead not found.")
            if caller["role"] == "agent" and lead["assigned_agent_id"] != caller["id"]:
                raise HTTPException(status_code=403, detail="This lead is assigned to another agent.")
            cur.execute(
                """
                INSERT INTO follow_ups (tenant_id, lead_id, agent_id, due_at, channel, note, status)
                VALUES (%s,%s,%s,%s,%s,%s,'pending') RETURNING id
                """,
                (caller["tenant_id"], lead_id, lead["assigned_agent_id"] or caller["id"], body.due_at, body.channel, body.note),
            )
            new_id = cur.fetchone()["id"]
            conn.commit()
            return {"success": True, "id": new_id}

    @router.get("/follow-ups")
    def list_follow_ups(view: str = "pending", agent_id: Optional[int] = None, limit: int = 200,
                        caller: dict = Depends(get_current_account)):
        """view: pending | overdue | today | done | all"""
        if view not in ("pending", "overdue", "today", "done", "all"):
            raise HTTPException(status_code=400, detail="view must be pending, overdue, today, done or all")
        where, params = ["1=1"], []
        tid = scope_tenant(caller)
        if tid is not None:
            where.append("f.tenant_id = %s")
            params.append(tid)
        if caller["role"] == "agent":
            where.append("f.agent_id = %s")
            params.append(caller["id"])
        elif agent_id:
            where.append("f.agent_id = %s")
            params.append(agent_id)
        if view == "pending":
            where.append("f.status = 'pending'")
        elif view == "overdue":
            where.append("f.status = 'pending' AND f.due_at < now()")
        elif view == "today":
            where.append("f.status = 'pending' AND f.due_at::date = CURRENT_DATE")
        elif view == "done":
            where.append("f.status = 'done'")
        params.append(max(1, min(limit, 500)))
        with db() as (conn, cur):
            cur.execute(
                f"""
                SELECT f.id, f.lead_id, l.name AS lead_name, l.phone AS lead_phone, f.agent_id,
                       a.name AS agent_name, f.due_at, f.channel, f.note, f.status, f.completed_at, f.outcome,
                       (f.status = 'pending' AND f.due_at < now()) AS is_overdue
                FROM follow_ups f
                JOIN leads l ON l.id = f.lead_id
                LEFT JOIN accounts a ON a.id = f.agent_id
                WHERE {' AND '.join(where)}
                ORDER BY f.due_at ASC
                LIMIT %s
                """,
                tuple(params),
            )
            return cur.fetchall()

    @router.patch("/follow-ups/{follow_up_id}/complete")
    def complete_follow_up(follow_up_id: int, body: FollowUpComplete, caller: dict = Depends(get_current_account)):
        need_role(caller, "agent", "owner")
        with db() as (conn, cur):
            cur.execute("SELECT id, tenant_id, agent_id, status FROM follow_ups WHERE id = %s", (follow_up_id,))
            f = cur.fetchone()
            if not f or f["tenant_id"] != caller["tenant_id"]:
                raise HTTPException(status_code=404, detail="Follow-up not found.")
            if caller["role"] == "agent" and f["agent_id"] != caller["id"]:
                raise HTTPException(status_code=403, detail="This follow-up belongs to another agent.")
            if f["status"] == "done":
                return {"success": True, "already_done": True}
            cur.execute(
                "UPDATE follow_ups SET status = 'done', completed_at = now(), outcome = %s WHERE id = %s",
                (body.outcome, follow_up_id),
            )
            conn.commit()
            return {"success": True}

    # ========================================================= AGENT PERFORMANCE
    @router.get("/agents/performance")
    def agent_performance(date_from: Optional[date] = None, date_to: Optional[date] = None,
                          tenant_id: Optional[int] = None, caller: dict = Depends(get_current_account)):
        """One row per agent: pipeline, follow-up discipline, closed deals, commission.
        Agents see only themselves; owners see their agency."""
        tid = scope_tenant(caller, tenant_id)
        where, params = ["a.role IN ('agent','owner')"], []
        if tid is not None:
            where.append("a.tenant_id = %s")
            params.append(tid)
        if caller["role"] == "agent":
            where.append("a.id = %s")
            params.append(caller["id"])
        sale_date, sale_params = "", []
        if date_from:
            sale_date += " AND s.closed_at >= %s"
            sale_params.append(date_from)
        if date_to:
            sale_date += " AND s.closed_at <= %s"
            sale_params.append(date_to)
        with db() as (conn, cur):
            cur.execute(
                f"""
                SELECT a.id AS agent_id, a.name, a.email, a.role,
                  (SELECT COUNT(*) FROM property_data p WHERE p.agent_id = a.id)                                   AS listings,
                  (SELECT COUNT(*) FROM leads l WHERE l.assigned_agent_id = a.id)                                  AS leads_assigned,
                  (SELECT COUNT(*) FROM leads l WHERE l.assigned_agent_id = a.id AND l.status = 'won')             AS leads_won,
                  (SELECT COUNT(*) FROM follow_ups f WHERE f.agent_id = a.id AND f.status = 'done')                AS follow_ups_done,
                  (SELECT COUNT(*) FROM follow_ups f WHERE f.agent_id = a.id AND f.status = 'pending')             AS follow_ups_pending,
                  (SELECT COUNT(*) FROM follow_ups f WHERE f.agent_id = a.id AND f.status = 'pending' AND f.due_at < now()) AS follow_ups_overdue,
                  (SELECT COUNT(*) FROM sales s WHERE s.agent_id = a.id AND s.status <> 'cancelled' {sale_date})   AS deals_closed,
                  (SELECT COALESCE(SUM(s.sale_price),0) FROM sales s WHERE s.agent_id = a.id AND s.status <> 'cancelled' AND s.kind = 'sale' {sale_date}) AS sales_volume,
                  (SELECT COALESCE(SUM(s.agent_commission),0) FROM sales s WHERE s.agent_id = a.id AND s.status <> 'cancelled' {sale_date}) AS agent_commission
                FROM accounts a
                WHERE {' AND '.join(where)}
                ORDER BY agent_commission DESC, a.id
                """,
                tuple(sale_params * 3 + params),
            )
            rows = cur.fetchall()
        for r in rows:
            assigned = r["leads_assigned"] or 0
            r["conversion_rate_pct"] = round(100.0 * (r["leads_won"] or 0) / assigned, 1) if assigned else 0.0
        return rows

    return router