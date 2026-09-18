from fastapi import APIRouter, Depends
from supabase import Client

from core.database import get_service_client
from core.permissions import is_manager
from core.security import get_current_account


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def count_rows(query) -> int:
    response = query.execute()
    return response.count or 0


@router.get("")
def dashboard(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    tenant_id = account["tenant_id"]
    prop = db.table("properties").select("id", count="exact").eq("tenant_id", tenant_id)
    leads = db.table("leads").select("id", count="exact").eq("tenant_id", tenant_id).not_.in_("status", ["closed", "lost"])
    sales = db.table("sales").select("id,sold_price", count="exact").eq("tenant_id", tenant_id)
    if not is_manager(account):
        prop = prop.eq("agent_id", account["id"])
        leads = leads.eq("assigned_agent_id", account["id"])
        sales = sales.eq("agent_id", account["id"])
    sales_result = sales.execute()
    return {
        "properties": count_rows(prop),
        "open_leads": count_rows(leads),
        "sales": sales_result.count or 0,
        "volume": sum(float(row.get("sold_price") or 0) for row in (sales_result.data or [])),
    }
