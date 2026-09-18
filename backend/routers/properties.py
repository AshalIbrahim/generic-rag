from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from core.database import get_service_client
from core.permissions import is_manager
from core.security import get_current_account
from models.property import PropertyCreate, PropertyUpdate
from services.audit_service import log_audit


router = APIRouter(prefix="/properties", tags=["properties"])


def property_query(db: Client, account: dict[str, Any]):
    query = db.table("properties").select("*, locations(*), property_images(*)").eq("tenant_id", account["tenant_id"])
    if is_manager(account):
        return query
    return query.or_(
        f"agent_id.eq.{account['id']},id.in.(select resource_id from shares where resource_type = 'property' and shared_with_account_id = '{account['id']}')"
    )


def get_visible_property(db: Client, property_id: str, account: dict[str, Any], write: bool = False) -> dict[str, Any]:
    query = db.table("properties").select("*, locations(*), property_images(*)").eq("id", property_id).eq("tenant_id", account["tenant_id"])
    if not is_manager(account):
        if write:
            query = query.eq("agent_id", account["id"])
        else:
            query = query.or_(
                f"agent_id.eq.{account['id']},id.in.(select resource_id from shares where resource_type = 'property' and shared_with_account_id = '{account['id']}')"
            )
    response = query.maybe_single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Property not found.")
    return response.data


@router.get("")
def list_properties(account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    return property_query(db, account).order("created_at", desc=True).limit(200).execute().data or []


@router.post("")
def create_property(payload: PropertyCreate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    data = payload.model_dump(exclude={"amenities"})
    data["tenant_id"] = account["tenant_id"]
    data["agent_id"] = payload.agent_id if is_manager(account) and payload.agent_id else account["id"]
    created = db.table("properties").insert(data).execute().data[0]
    if payload.amenities:
        db.table("property_amenities").insert(
            [{"property_id": created["id"], "amenity_id": amenity_id} for amenity_id in payload.amenities]
        ).execute()
    log_audit(db, account, "property.create", "property", created["id"], data)
    return created


@router.get("/{property_id}")
def get_property(property_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    return get_visible_property(db, property_id, account)


@router.put("/{property_id}")
def update_property(property_id: str, payload: PropertyUpdate, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    current = get_visible_property(db, property_id, account, write=True)
    data = payload.model_dump(exclude_unset=True, exclude={"amenities"})
    if "agent_id" in data and not is_manager(account):
        data.pop("agent_id")
    if not data.get("agent_id"):
        data["agent_id"] = current.get("agent_id") or account["id"]
    updated = db.table("properties").update(data).eq("id", property_id).eq("tenant_id", account["tenant_id"]).execute().data[0]
    if payload.amenities is not None:
        db.table("property_amenities").delete().eq("property_id", property_id).execute()
        if payload.amenities:
            db.table("property_amenities").insert(
                [{"property_id": property_id, "amenity_id": amenity_id} for amenity_id in payload.amenities]
            ).execute()
    log_audit(db, account, "property.update", "property", property_id, data)
    return updated


@router.post("/{property_id}/archive")
def archive_property(property_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_property(db, property_id, account, write=True)
    db.table("properties").update({"status": "archived"}).eq("id", property_id).eq("tenant_id", account["tenant_id"]).execute()
    log_audit(db, account, "property.archive", "property", property_id)
    return {"success": True}
