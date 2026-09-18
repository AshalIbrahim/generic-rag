from fastapi import APIRouter, Depends
from supabase import Client

from core.database import get_service_client
from core.permissions import require_manager
from core.security import get_current_account


router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def audit_log(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    require_manager(account)
    return db.table("audit_log").select("*").eq("tenant_id", account["tenant_id"]).order("created_at", desc=True).limit(300).execute().data or []
