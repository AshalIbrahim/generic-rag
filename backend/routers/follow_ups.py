from pydantic import BaseModel
from fastapi import APIRouter, Depends
from supabase import Client

from core.database import get_service_client
from core.permissions import is_manager
from core.security import get_current_account
from routers.leads import get_visible_lead
from services.audit_service import log_audit


router = APIRouter(prefix="/follow-ups", tags=["follow-ups"])


class FollowUpCreate(BaseModel):
    lead_id: str
    due_at: str
    title: str
    notes: str | None = None
    status: str = "open"


@router.get("")
def list_followups(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    query = db.table("follow_ups").select("*, leads(full_name)").eq("tenant_id", account["tenant_id"])
    if not is_manager(account):
        query = query.eq("assigned_agent_id", account["id"])
    return query.order("due_at").limit(300).execute().data or []


@router.post("")
def create_followup(payload: FollowUpCreate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_lead(db, payload.lead_id, account)
    data = payload.model_dump()
    data["tenant_id"] = account["tenant_id"]
    data["assigned_agent_id"] = account["id"]
    row = db.table("follow_ups").insert(data).execute().data[0]
    log_audit(db, account, "follow_up.create", "follow_up", row["id"], data)
    return row


@router.post("/{follow_up_id}/done")
def complete_followup(follow_up_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    query = db.table("follow_ups").update({"status": "done"}).eq("id", follow_up_id).eq("tenant_id", account["tenant_id"])
    if not is_manager(account):
        query = query.eq("assigned_agent_id", account["id"])
    query.execute()
    log_audit(db, account, "follow_up.done", "follow_up", follow_up_id)
    return {"success": True}
