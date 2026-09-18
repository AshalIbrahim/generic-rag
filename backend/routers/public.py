import re

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from core.database import get_service_client
from core.storage import public_image_url
from models.conversation import PublicChatRequest, PublicSearchRequest


router = APIRouter(prefix="/public/v1", tags=["public"])


def tenant_by_slug(db: Client, slug: str):
    tenant = db.table("tenants").select("*").eq("slug", slug).eq("status", "active").maybe_single().execute().data
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return tenant


def extract_filters(query: str) -> dict:
    q = query.lower()
    filters: dict = {"limit": 30}
    if "rent" in q:
        filters["purpose"] = "For Rent"
    elif "sale" in q or "buy" in q:
        filters["purpose"] = "For Sale"
    for prop_type in ["house", "apartment", "condo", "townhouse", "land", "commercial"]:
        if prop_type in q:
            filters["prop_type"] = prop_type.title()
            break
    beds = re.search(r"(\d+)\s*(bed|beds|bedroom)", q)
    if beds:
        filters["min_beds"] = int(beds.group(1))
    price = re.search(r"(?:under|below|max|less than)\s*(\d+(?:\.\d+)?)\s*(k|m|million|crore|lac|lakh)?", q)
    if price:
        amount = float(price.group(1))
        unit = price.group(2) or ""
        multiplier = {"k": 1_000, "m": 1_000_000, "million": 1_000_000, "lac": 100_000, "lakh": 100_000, "crore": 10_000_000}.get(unit, 1)
        filters["max_price"] = amount * multiplier
    return filters


def property_query(db: Client, tenant_id: str, filters: dict):
    query = (
        db.table("properties")
        .select("*, locations(*), property_images(*)")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
    )
    for key in ("location_id", "prop_type", "purpose"):
        if filters.get(key):
            query = query.eq(key, filters[key])
    if filters.get("min_price") is not None:
        query = query.gte("price", filters["min_price"])
    if filters.get("max_price") is not None:
        query = query.lte("price", filters["max_price"])
    if filters.get("min_beds") is not None:
        query = query.gte("beds", filters["min_beds"])
    return query.order("created_at", desc=True).limit(filters.get("limit", 30))


def with_image_urls(db: Client, rows: list[dict]) -> list[dict]:
    for row in rows:
        for image in row.get("property_images") or []:
            image["url"] = public_image_url(db, image["storage_path"])
    return rows


@router.get("/{tenant_slug}/properties")
def list_public_properties(
    tenant_slug: str,
    limit: int = 30,
    prop_type: str | None = None,
    purpose: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_beds: int | None = None,
    db: Client = Depends(get_service_client),
):
    tenant = tenant_by_slug(db, tenant_slug)
    filters = {
        "limit": limit,
        "prop_type": prop_type,
        "purpose": purpose,
        "min_price": min_price,
        "max_price": max_price,
        "min_beds": min_beds,
    }
    return with_image_urls(db, property_query(db, tenant["id"], filters).execute().data or [])


@router.get("/{tenant_slug}/properties/{property_id}")
def public_property_detail(tenant_slug: str, property_id: str, db: Client = Depends(get_service_client)):
    tenant = tenant_by_slug(db, tenant_slug)
    row = (
        db.table("properties")
        .select("*, locations(*), property_images(*), property_amenities(amenities(*)), location_sentiments(*)")
        .eq("id", property_id)
        .eq("tenant_id", tenant["id"])
        .eq("status", "active")
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    return with_image_urls(db, [row])[0]


@router.post("/{tenant_slug}/search")
def public_search(tenant_slug: str, payload: PublicSearchRequest, db: Client = Depends(get_service_client)):
    tenant = tenant_by_slug(db, tenant_slug)
    filters = extract_filters(payload.query)
    rows = property_query(db, tenant["id"], filters).execute().data or []
    return {"filters": filters, "properties": with_image_urls(db, rows)}


@router.post("/{tenant_slug}/chat")
def public_chat(tenant_slug: str, payload: PublicChatRequest, db: Client = Depends(get_service_client)):
    tenant = tenant_by_slug(db, tenant_slug)
    if payload.conversation_id:
        conversation = db.table("conversations").select("*").eq("id", payload.conversation_id).eq("tenant_id", tenant["id"]).maybe_single().execute().data
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found.")
    else:
        conversation = (
            db.table("conversations")
            .insert({"tenant_id": tenant["id"], "session_id": payload.session_id, "channel": "web_widget"})
            .execute()
            .data[0]
        )
    db.table("conversation_messages").insert({"conversation_id": conversation["id"], "role": "user", "content": payload.message}).execute()
    filters = extract_filters(payload.message)
    rows = with_image_urls(db, property_query(db, tenant["id"], filters).limit(5).execute().data or [])
    if rows:
        reply = "I found a few matching listings. You can open any of these, or tell me what to narrow down next."
    else:
        reply = "I could not find an exact match. Try widening the budget, beds, or property type."
    db.table("conversation_messages").insert(
        {"conversation_id": conversation["id"], "role": "assistant", "content": reply, "shown_properties": [row["id"] for row in rows]}
    ).execute()
    maybe_capture_lead(db, tenant["id"], conversation["id"], payload.message)
    return {"conversation_id": conversation["id"], "reply": reply, "properties": rows}


def maybe_capture_lead(db: Client, tenant_id: str, conversation_id: str, message: str) -> None:
    email = re.search(r"[\w.\-+]+@[\w.\-]+\.\w+", message)
    phone = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", message)
    if not email and not phone:
        return
    conv = db.table("conversations").select("lead_id").eq("id", conversation_id).maybe_single().execute().data
    if conv and conv.get("lead_id"):
        return
    agents = db.table("accounts").select("id").eq("tenant_id", tenant_id).eq("role", "agent").eq("is_active", True).limit(1).execute().data or []
    lead = (
        db.table("leads")
        .insert(
            {
                "tenant_id": tenant_id,
                "assigned_agent_id": agents[0]["id"] if agents else None,
                "full_name": "Website visitor",
                "email": email.group(0) if email else None,
                "phone": phone.group(0) if phone else None,
                "source_channel": "web_chat",
                "status": "new",
            }
        )
        .execute()
        .data[0]
    )
    db.table("conversations").update({"lead_id": lead["id"]}).eq("id", conversation_id).execute()
