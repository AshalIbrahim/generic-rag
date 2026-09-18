from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from core.database import get_service_client
from core.security import get_current_account
from routers.leads import get_visible_lead
from routers.properties import get_visible_property
from services.audit_service import log_audit


router = APIRouter(prefix="/shares", tags=["sharing"])


class ShareCreate(BaseModel):
    resource_type: str = Field(pattern="^(lead|property|conversation)$")
    resource_id: str
    shared_with_account_id: str


@router.post("")
def create_share(payload: ShareCreate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    if payload.resource_type == "lead":
        get_visible_lead(db, payload.resource_id, account, write=True)
    elif payload.resource_type == "property":
        get_visible_property(db, payload.resource_id, account, write=True)

    recipient = (
        db.table("accounts")
        .select("id")
        .eq("id", payload.shared_with_account_id)
        .eq("tenant_id", account["tenant_id"])
        .maybe_single()
        .execute()
        .data
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found in tenant.")
    row = db.table("shares").insert({**payload.model_dump(), "tenant_id": account["tenant_id"], "shared_by_account_id": account["id"]}).execute().data[0]
    log_audit(db, account, "share.create", payload.resource_type, payload.resource_id, payload.model_dump())
    return row
