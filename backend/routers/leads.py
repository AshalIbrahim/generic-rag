from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from core.database import get_service_client
from core.permissions import is_manager
from core.security import get_current_account
from models.lead import LeadCreate, LeadUpdate
from services.audit_service import log_audit


router = APIRouter(prefix="/leads", tags=["leads"])


def lead_query(db: Client, account: dict):
    query = db.table("leads").select("*").eq("tenant_id", account["tenant_id"])
    if is_manager(account):
        return query
    return query.or_(
        f"assigned_agent_id.eq.{account['id']},id.in.(select resource_id from shares where resource_type = 'lead' and shared_with_account_id = '{account['id']}')"
    )


def get_visible_lead(db: Client, lead_id: str, account: dict, write: bool = False):
    query = db.table("leads").select("*").eq("id", lead_id).eq("tenant_id", account["tenant_id"])
    if not is_manager(account):
        if write:
            query = query.eq("assigned_agent_id", account["id"])
        else:
            query = query.or_(
                f"assigned_agent_id.eq.{account['id']},id.in.(select resource_id from shares where resource_type = 'lead' and shared_with_account_id = '{account['id']}')"
            )
    row = query.maybe_single().execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found.")
    return row


@router.get("")
def list_leads(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    return lead_query(db, account).order("created_at", desc=True).limit(300).execute().data or []


@router.post("")
def create_lead(payload: LeadCreate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    data = payload.model_dump()
    data["tenant_id"] = account["tenant_id"]
    data["assigned_agent_id"] = payload.assigned_agent_id if is_manager(account) and payload.assigned_agent_id else account["id"]
    row = db.table("leads").insert(data).execute().data[0]
    log_audit(db, account, "lead.create", "lead", row["id"], data)
    return row


@router.get("/{lead_id}")
def get_lead(lead_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    return get_visible_lead(db, lead_id, account)


@router.put("/{lead_id}")
def update_lead(lead_id: str, payload: LeadUpdate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_lead(db, lead_id, account, write=True)
    data = payload.model_dump(exclude_unset=True)
    if not is_manager(account):
        data.pop("assigned_agent_id", None)
    row = db.table("leads").update(data).eq("id", lead_id).eq("tenant_id", account["tenant_id"]).execute().data[0]
    log_audit(db, account, "lead.update", "lead", lead_id, data)
    return row
