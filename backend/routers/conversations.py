from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from core.database import get_service_client
from core.permissions import is_manager
from core.security import get_current_account


router = APIRouter(prefix="/conversations", tags=["conversations"])


def conversation_query(db: Client, account: dict):
    query = db.table("conversations").select("*, leads(full_name,email,phone)").eq("tenant_id", account["tenant_id"])
    if is_manager(account):
        return query
    return query.or_(
        f"assigned_agent_id.eq.{account['id']},id.in.(select resource_id from shares where resource_type = 'conversation' and shared_with_account_id = '{account['id']}')"
    )


@router.get("")
def list_conversations(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    return conversation_query(db, account).order("updated_at", desc=True).limit(300).execute().data or []


@router.get("/{conversation_id}/messages")
def get_messages(conversation_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    conv = conversation_query(db, account).eq("id", conversation_id).maybe_single().execute().data
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return db.table("conversation_messages").select("*").eq("conversation_id", conversation_id).order("created_at").execute().data or []
