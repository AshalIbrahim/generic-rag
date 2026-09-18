from fastapi import APIRouter, Depends
from supabase import Client

from core.database import get_service_client
from core.permissions import is_manager
from core.security import get_current_account
from models.sale import SaleCreate
from routers.properties import get_visible_property
from services.audit_service import log_audit


router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("")
def list_sales(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    query = db.table("sales").select("*, properties(title, price)").eq("tenant_id", account["tenant_id"])
    if not is_manager(account):
        query = query.eq("agent_id", account["id"])
    return query.order("created_at", desc=True).limit(300).execute().data or []


@router.post("")
def create_sale(payload: SaleCreate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_property(db, payload.property_id, account, write=True)
    data = payload.model_dump()
    data["tenant_id"] = account["tenant_id"]
    data["agent_id"] = account["id"]
    if data.get("commission_amount") is None and data.get("commission_rate") is not None:
        data["commission_amount"] = round(data["sold_price"] * data["commission_rate"] / 100, 2)
    row = db.table("sales").insert(data).execute().data[0]
    db.table("properties").update({"status": "sold"}).eq("id", payload.property_id).eq("tenant_id", account["tenant_id"]).execute()
    log_audit(db, account, "sale.create", "sale", row["id"], data)
    return row
