from __future__ import annotations

import io
import os
import re
import uuid
from types import SimpleNamespace
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

try:
    from platform_core import (
        audit,
        current_account,
        execute,
        fetch_all,
        fetch_one,
        insert_row,
        is_manager,
        require_manager,
        update_row,
    )
except ImportError:
    from .platform_core import (
        audit,
        current_account,
        execute,
        fetch_all,
        fetch_one,
        insert_row,
        is_manager,
        require_manager,
        update_row,
    )


class LeadPayload(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    status: str = "new"
    budget_min: float | None = None
    budget_max: float | None = None
    preferred_location: str | None = None
    preferences: str | None = None
    notes: str | None = None
    assigned_agent_id: int | None = None


class SalePayload(BaseModel):
    property_id: int
    lead_id: int | None = None
    buyer_name: str
    buyer_email: str | None = None
    buyer_phone: str | None = None
    sold_price: float
    commission_rate: float | None = None
    commission_amount: float | None = None
    closing_date: str | None = None
    notes: str | None = None


class FollowUpPayload(BaseModel):
    lead_id: int
    due_at: str
    title: str
    notes: str | None = None
    status: str = "open"


class SharePayload(BaseModel):
    resource_type: str = Field(pattern="^(lead|property|conversation)$")
    resource_id: int
    shared_with_account_id: int


class PropertyPayload(BaseModel):
    prop_type: str
    purpose: str
    covered_area: float
    price: float
    location: str
    beds: int = 0
    baths: int = 0
    amenities: str = ""
    status: str = "active"
    assigned_agent_id: int | None = None


class PublicSearchPayload(BaseModel):
    query: str


class PublicChatPayload(BaseModel):
    session_id: str
    message: str
    conversation_id: int | None = None


def register_platform_routes(app, chat_handler: Callable[[list[dict[str, str]], str | None], dict[str, Any]] | None = None):
    router = APIRouter(prefix="/app/v1", tags=["crm"])
    public = APIRouter(prefix="/public/v1", tags=["public"])

    @router.get("/auth/me")
    def me(account=Depends(current_account)):
        return account

    @router.get("/team")
    def team(account=Depends(current_account)):
        require_manager(account)
        return fetch_all(
            "SELECT id, full_name, email, role, phone, is_active, last_login_at FROM accounts WHERE tenant_id = %s ORDER BY full_name",
            (account["tenant_id"],),
        )

    @router.post("/team")
    def create_team_member(payload: dict[str, Any], account=Depends(current_account)):
        require_manager(account)
        row = {
            "tenant_id": account["tenant_id"],
            "full_name": payload["full_name"],
            "email": payload["email"],
            "role": payload.get("role", "agent"),
            "phone": payload.get("phone"),
            "is_active": True,
        }
        new_id = insert_row("accounts", row)
        audit(account, "team.create", "account", new_id, {"email": row["email"], "role": row["role"]})
        return {**row, "id": new_id}

    @router.get("/properties")
    def list_properties(account=Depends(current_account)):
        where = "WHERE tenant_id = %s"
        params: list[Any] = [account["tenant_id"]]
        if not is_manager(account):
            where += " AND (agent_id = %s OR EXISTS (SELECT 1 FROM shares s WHERE s.resource_type = 'property' AND s.resource_id = property_data.id AND s.shared_with_account_id = %s))"
            params.extend([account["id"], account["id"]])
        return fetch_all(f"SELECT * FROM property_data {where} ORDER BY id DESC LIMIT 200", tuple(params))

    @router.post("/properties")
    def create_property(payload: PropertyPayload, account=Depends(current_account)):
        data = payload.model_dump()
        data["tenant_id"] = account["tenant_id"]
        data["agent_id"] = payload.assigned_agent_id if is_manager(account) and payload.assigned_agent_id else account["id"]
        data.pop("assigned_agent_id", None)
        new_id = insert_row("property_data", data)
        audit(account, "property.create", "property", new_id, data)
        return {**data, "id": new_id}

    @router.get("/properties/{property_id}")
    def get_property(property_id: int, account=Depends(current_account)):
        row = load_visible_property(property_id, account)
        row["images"] = load_property_images(property_id, account["tenant_id"])
        return row

    @router.put("/properties/{property_id}")
    def update_property(property_id: int, payload: PropertyPayload, account=Depends(current_account)):
        prop = load_visible_property(property_id, account, write=True)
        data = payload.model_dump(exclude_unset=True)
        data["agent_id"] = data.pop("assigned_agent_id", None) or prop.get("agent_id") or account["id"]
        update_row("property_data", property_id, account["tenant_id"], data)
        audit(account, "property.update", "property", property_id, data)
        return fetch_one("SELECT * FROM property_data WHERE id = %s AND tenant_id = %s", (property_id, account["tenant_id"]))

    @router.post("/properties/{property_id}/archive")
    def archive_property(property_id: int, account=Depends(current_account)):
        load_visible_property(property_id, account, write=True)
        execute("UPDATE property_data SET status = 'archived' WHERE id = %s AND tenant_id = %s", (property_id, account["tenant_id"]))
        audit(account, "property.archive", "property", property_id)
        return {"success": True}

    @router.get("/properties/{property_id}/images")
    def list_property_images(property_id: int, account=Depends(current_account)):
        load_visible_property(property_id, account)
        return load_property_images(property_id, account["tenant_id"])

    @router.post("/properties/{property_id}/images")
    async def upload_platform_property_images(property_id: int, files: list[UploadFile] = File(...), account=Depends(current_account)):
        load_visible_property(property_id, account, write=True)
        if not files:
            raise HTTPException(status_code=400, detail="No images were uploaded.")

        uploaded = []
        failed = []
        for file in files:
            try:
                clean = await prepare_image_upload(file)
                ext = clean["extension"]
                storage_path = f"{account['tenant_id']}/{property_id}/{uuid.uuid4().hex}{ext}"
                storage_client().put_object(
                    Bucket=storage_bucket(),
                    Key=storage_path,
                    Body=clean["body"],
                    ContentType=clean["content_type"],
                )
                image_id = insert_row(
                    "property_images",
                    {
                        "property_id": property_id,
                        "tenant_id": account["tenant_id"],
                        "storage_path": storage_path,
                        "is_primary": False,
                        "uploaded_by": account["id"],
                    },
                )
                uploaded.append(
                    {
                        "id": image_id,
                        "property_id": property_id,
                        "storage_path": storage_path,
                        "url": storage_public_url(storage_path),
                    }
                )
            except Exception as exc:
                failed.append({"filename": file.filename, "error": str(exc)})

        if uploaded and len(uploaded) == len(files):
            audit(account, "property.images.upload", "property", property_id, {"count": len(uploaded)})
        return {"success": bool(uploaded), "uploaded": uploaded, "failed": failed}

    @router.post("/properties/{property_id}/images/{image_id}/primary")
    def set_primary_property_image(property_id: int, image_id: int, account=Depends(current_account)):
        load_visible_property(property_id, account, write=True)
        image = load_property_image(image_id, property_id, account["tenant_id"])
        execute(
            "UPDATE property_images SET is_primary = FALSE WHERE property_id = %s AND tenant_id = %s",
            (property_id, account["tenant_id"]),
        )
        execute("UPDATE property_images SET is_primary = TRUE WHERE id = %s", (image["id"],))
        audit(account, "property.images.primary", "property", property_id, {"image_id": image_id})
        return {"success": True}

    @router.delete("/properties/{property_id}/images/{image_id}")
    def delete_platform_property_image(property_id: int, image_id: int, account=Depends(current_account)):
        load_visible_property(property_id, account, write=True)
        image = load_property_image(image_id, property_id, account["tenant_id"])
        try:
            storage_client().delete_object(Bucket=storage_bucket(), Key=image["storage_path"])
        except Exception:
            pass
        execute("DELETE FROM property_images WHERE id = %s AND property_id = %s AND tenant_id = %s", (image_id, property_id, account["tenant_id"]))
        audit(account, "property.images.delete", "property", property_id, {"image_id": image_id})
        return {"success": True}

    @router.get("/leads")
    def list_leads(account=Depends(current_account)):
        return visible_rows("leads", account, "assigned_agent_id")

    @router.post("/leads")
    def create_lead(payload: LeadPayload, account=Depends(current_account)):
        data = payload.model_dump()
        data["tenant_id"] = account["tenant_id"]
        data["assigned_agent_id"] = payload.assigned_agent_id if is_manager(account) and payload.assigned_agent_id else account["id"]
        new_id = insert_row("leads", data)
        audit(account, "lead.create", "lead", new_id, data)
        return {**data, "id": new_id}

    @router.get("/leads/{lead_id}")
    def get_lead(lead_id: int, account=Depends(current_account)):
        return load_visible_row("leads", lead_id, account, "lead", "assigned_agent_id")

    @router.put("/leads/{lead_id}")
    def update_lead(lead_id: int, payload: LeadPayload, account=Depends(current_account)):
        load_visible_row("leads", lead_id, account, "lead", "assigned_agent_id", write=True)
        data = payload.model_dump(exclude_unset=True)
        if not is_manager(account):
            data.pop("assigned_agent_id", None)
        update_row("leads", lead_id, account["tenant_id"], data)
        audit(account, "lead.update", "lead", lead_id, data)
        return load_visible_row("leads", lead_id, account, "lead", "assigned_agent_id")

    @router.get("/sales")
    def list_sales(account=Depends(current_account)):
        return visible_rows("sales", account, "agent_id")

    @router.post("/sales")
    def create_sale(payload: SalePayload, account=Depends(current_account)):
        load_visible_property(payload.property_id, account, write=True)
        data = payload.model_dump()
        data["tenant_id"] = account["tenant_id"]
        data["agent_id"] = account["id"]
        if data.get("commission_amount") is None and data.get("commission_rate") is not None:
            data["commission_amount"] = round(data["sold_price"] * data["commission_rate"] / 100, 2)
        new_id = insert_row("sales", data)
        execute("UPDATE property_data SET status = 'sold' WHERE id = %s AND tenant_id = %s", (payload.property_id, account["tenant_id"]))
        audit(account, "sale.create", "sale", new_id, data)
        return {**data, "id": new_id}

    @router.get("/follow-ups")
    def list_followups(account=Depends(current_account)):
        return visible_rows("follow_ups", account, "assigned_agent_id")

    @router.post("/follow-ups")
    def create_followup(payload: FollowUpPayload, account=Depends(current_account)):
        load_visible_row("leads", payload.lead_id, account, "lead", "assigned_agent_id")
        data = payload.model_dump()
        data["tenant_id"] = account["tenant_id"]
        data["assigned_agent_id"] = account["id"]
        new_id = insert_row("follow_ups", data)
        audit(account, "follow_up.create", "follow_up", new_id, data)
        return {**data, "id": new_id}

    @router.post("/follow-ups/{follow_up_id}/done")
    def complete_followup(follow_up_id: int, account=Depends(current_account)):
        load_visible_row("follow_ups", follow_up_id, account, "follow_up", "assigned_agent_id", write=True)
        execute("UPDATE follow_ups SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = %s AND tenant_id = %s", (follow_up_id, account["tenant_id"]))
        audit(account, "follow_up.done", "follow_up", follow_up_id)
        return {"success": True}

    @router.post("/shares")
    def share(payload: SharePayload, account=Depends(current_account)):
        if payload.resource_type == "lead":
            load_visible_row("leads", payload.resource_id, account, "lead", "assigned_agent_id", write=True)
        elif payload.resource_type == "property":
            load_visible_property(payload.resource_id, account, write=True)
        else:
            load_visible_row("conversations", payload.resource_id, account, "conversation", "assigned_agent_id", write=True)
        recipient = fetch_one("SELECT id FROM accounts WHERE id = %s AND tenant_id = %s", (payload.shared_with_account_id, account["tenant_id"]))
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found in tenant.")
        new_id = insert_row("shares", {**payload.model_dump(), "tenant_id": account["tenant_id"], "shared_by_account_id": account["id"]})
        audit(account, "share.create", payload.resource_type, payload.resource_id, payload.model_dump())
        return {"id": new_id, "success": True}

    @router.get("/conversations")
    def list_conversations(account=Depends(current_account)):
        return visible_rows("conversations", account, "assigned_agent_id")

    @router.get("/conversations/{conversation_id}/messages")
    def conversation_messages(conversation_id: int, account=Depends(current_account)):
        load_visible_row("conversations", conversation_id, account, "conversation", "assigned_agent_id")
        return fetch_all("SELECT * FROM conversation_messages WHERE conversation_id = %s ORDER BY created_at", (conversation_id,))

    @router.get("/dashboard")
    def dashboard(account=Depends(current_account)):
        tenant_id = account["tenant_id"]
        mine = "" if is_manager(account) else " AND agent_id = %s"
        lead_mine = "" if is_manager(account) else " AND assigned_agent_id = %s"
        params = (tenant_id,) if is_manager(account) else (tenant_id, account["id"])
        return {
            "properties": count_query(f"SELECT COUNT(*) AS c FROM property_data WHERE tenant_id = %s{mine}", params),
            "open_leads": count_query(f"SELECT COUNT(*) AS c FROM leads WHERE tenant_id = %s AND status NOT IN ('closed','lost'){lead_mine}", params),
            "sales": count_query(f"SELECT COUNT(*) AS c FROM sales WHERE tenant_id = %s{mine}", params),
            "volume": fetch_one(f"SELECT COALESCE(SUM(sold_price),0) AS total FROM sales WHERE tenant_id = %s{mine}", params)["total"],
        }

    @router.get("/audit")
    def audit_log(account=Depends(current_account)):
        require_manager(account)
        return fetch_all("SELECT * FROM audit_log WHERE tenant_id = %s ORDER BY created_at DESC LIMIT 300", (account["tenant_id"],))

    @public.get("/{tenant_slug}/properties")
    def public_properties(tenant_slug: str, limit: int = 30, location: str | None = None, prop_type: str | None = None, purpose: str | None = None, min_price: float | None = None, max_price: float | None = None, min_beds: int | None = None):
        tenant = tenant_by_slug(tenant_slug)
        sql = "SELECT * FROM property_data WHERE tenant_id = %s AND COALESCE(status, 'active') = 'active'"
        params: list[Any] = [tenant["id"]]
        for field, value in (("location", location), ("prop_type", prop_type), ("purpose", purpose)):
            if value:
                sql += f" AND {field} = %s"
                params.append(value)
        if min_price is not None:
            sql += " AND price >= %s"
            params.append(min_price)
        if max_price is not None:
            sql += " AND price <= %s"
            params.append(max_price)
        if min_beds is not None:
            sql += " AND beds >= %s"
            params.append(min_beds)
        sql += " ORDER BY id DESC LIMIT %s"
        params.append(limit)
        return fetch_all(sql, tuple(params))

    @public.get("/{tenant_slug}/properties/{property_id}")
    def public_property_detail(tenant_slug: str, property_id: int):
        tenant = tenant_by_slug(tenant_slug)
        row = fetch_one(
            """
            SELECT *
            FROM property_data
            WHERE id = %s
              AND tenant_id = %s
              AND COALESCE(status, 'active') = 'active'
            LIMIT 1
            """,
            (property_id, tenant["id"]),
        )
        if not row:
            raise HTTPException(status_code=404, detail="Property not found.")
        row["images"] = load_property_images(property_id, tenant["id"])
        return row

    @public.post("/{tenant_slug}/search")
    def public_search(tenant_slug: str, payload: PublicSearchPayload):
        filters = extract_listing_filters(payload.query)
        return {"filters": filters, "properties": public_properties(tenant_slug, **filters)}

    @public.post("/{tenant_slug}/chat")
    def public_chat(tenant_slug: str, payload: PublicChatPayload):
        tenant = tenant_by_slug(tenant_slug)
        conversation_id = payload.conversation_id or insert_row(
            "conversations",
            {"tenant_id": tenant["id"], "session_id": payload.session_id, "channel": "web_widget"},
        )
        insert_row("conversation_messages", {"conversation_id": conversation_id, "role": "user", "content": payload.message})
        if chat_handler:
            result = chat_handler([SimpleNamespace(role="user", content=payload.message)], None)
            reply = result.get("text") or result.get("response") or "I can help find matching properties."
            properties = result.get("properties", [])
        else:
            reply, properties = "I can help find matching properties.", []
        insert_row("conversation_messages", {"conversation_id": conversation_id, "role": "assistant", "content": reply})
        maybe_capture_lead(tenant["id"], conversation_id, payload.message)
        return {"conversation_id": conversation_id, "reply": reply, "properties": properties}

    app.include_router(router)
    app.include_router(public)


def visible_rows(table: str, account: dict[str, Any], owner_column: str):
    sql = f"SELECT * FROM {table} WHERE tenant_id = %s"
    params: list[Any] = [account["tenant_id"]]
    if not is_manager(account):
        sql += f" AND ({owner_column} = %s OR EXISTS (SELECT 1 FROM shares s WHERE s.resource_type = %s AND s.resource_id = {table}.id AND s.shared_with_account_id = %s))"
        params.extend([account["id"], table[:-1], account["id"]])
    sql += " ORDER BY id DESC LIMIT 300"
    return fetch_all(sql, tuple(params))


def load_visible_row(table: str, row_id: int, account: dict[str, Any], resource_type: str, owner_column: str, write: bool = False):
    sql = f"SELECT * FROM {table} WHERE id = %s AND tenant_id = %s"
    params: list[Any] = [row_id, account["tenant_id"]]
    if not is_manager(account):
        sql += f" AND ({owner_column} = %s"
        params.append(account["id"])
        if not write:
            sql += " OR EXISTS (SELECT 1 FROM shares s WHERE s.resource_type = %s AND s.resource_id = %s AND s.shared_with_account_id = %s)"
            params.extend([resource_type, row_id, account["id"]])
        sql += ")"
    row = fetch_one(sql, tuple(params))
    if not row:
        raise HTTPException(status_code=404, detail=f"{resource_type.title()} not found.")
    return row


def load_visible_property(property_id: int, account: dict[str, Any], write: bool = False):
    return load_visible_row("property_data", property_id, account, "property", "agent_id", write)


def load_property_images(property_id: int, tenant_id: int):
    rows = fetch_all(
        """
        SELECT id, property_id, tenant_id, storage_path, is_primary, sort_order, uploaded_by, uploaded_at
        FROM property_images
        WHERE property_id = %s AND tenant_id = %s
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        """,
        (property_id, tenant_id),
    )
    for row in rows:
        row["url"] = storage_public_url(row["storage_path"])
    return rows


def load_property_image(image_id: int, property_id: int, tenant_id: int):
    image = fetch_one(
        """
        SELECT id, property_id, tenant_id, storage_path, is_primary, sort_order, uploaded_by, uploaded_at
        FROM property_images
        WHERE id = %s AND property_id = %s AND tenant_id = %s
        LIMIT 1
        """,
        (image_id, property_id, tenant_id),
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")
    return image


def count_query(sql: str, params: tuple[Any, ...]) -> int:
    return int(fetch_one(sql, params)["c"])


def tenant_by_slug(slug: str):
    tenant = fetch_one("SELECT * FROM tenants WHERE slug = %s AND status = 'active'", (slug,))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return tenant


def extract_listing_filters(query: str):
    q = query.lower()
    filters: dict[str, Any] = {"limit": 30}
    if "rent" in q:
        filters["purpose"] = "rent"
    elif "sale" in q or "buy" in q:
        filters["purpose"] = "sale"
    for prop_type in ["house", "apartment", "flat", "plot", "commercial"]:
        if prop_type in q:
            filters["prop_type"] = "Flat" if prop_type == "flat" else prop_type.title()
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


def storage_bucket():
    bucket = os.getenv("SUPABASE_BUCKET", "property-images")
    if not bucket:
        raise HTTPException(status_code=500, detail="Image storage bucket is not configured.")
    return bucket


def storage_public_url(storage_path: str):
    project_ref = os.getenv("SUPABASE_PROJECT_REF")
    bucket = storage_bucket()
    if project_ref:
        return f"https://{project_ref}.supabase.co/storage/v1/object/public/{bucket}/{storage_path}"
    return storage_path


def storage_client():
    endpoint = os.getenv("SUPABASE_S3_ENDPOINT")
    access_key = os.getenv("SUPABASE_S3_ACCESS_KEY")
    secret_key = os.getenv("SUPABASE_S3_SECRET_KEY")
    if not endpoint or not access_key or not secret_key:
        raise HTTPException(status_code=500, detail="Image storage credentials are not configured.")
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=os.getenv("SUPABASE_S3_REGION", "ap-northeast-1"),
    )


async def prepare_image_upload(file: UploadFile):
    content_type = file.content_type or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("Only JPEG, PNG, and WebP images are supported.")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise ValueError("Image exceeds the 10 MB limit.")

    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(raw)) as image:
        image = ImageOps.exif_transpose(image)
        output = io.BytesIO()
        if content_type == "image/png":
            image.save(output, format="PNG", optimize=True)
            return {"body": output.getvalue(), "content_type": "image/png", "extension": ".png"}
        if content_type == "image/webp":
            image.save(output, format="WEBP", quality=86, method=6)
            return {"body": output.getvalue(), "content_type": "image/webp", "extension": ".webp"}
        if image.mode not in {"RGB", "L"}:
            image = image.convert("RGB")
        image.save(output, format="JPEG", quality=88, optimize=True)
        return {"body": output.getvalue(), "content_type": "image/jpeg", "extension": ".jpg"}


def maybe_capture_lead(tenant_id: int, conversation_id: int, message: str):
    email = re.search(r"[\w.\-+]+@[\w.\-]+\.\w+", message)
    phone = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", message)
    if not email and not phone:
        return
    conv = fetch_one("SELECT lead_id FROM conversations WHERE id = %s", (conversation_id,))
    if conv and conv.get("lead_id"):
        return
    agent = fetch_one(
        """
        SELECT a.id
        FROM accounts a
        LEFT JOIN leads l ON l.assigned_agent_id = a.id AND l.status NOT IN ('closed','lost')
        WHERE a.tenant_id = %s AND a.role = 'agent' AND a.is_active = TRUE
        GROUP BY a.id
        ORDER BY COUNT(l.id), a.id
        LIMIT 1
        """,
        (tenant_id,),
    )
    lead_id = insert_row(
        "leads",
        {
            "tenant_id": tenant_id,
            "assigned_agent_id": agent["id"] if agent else None,
            "full_name": "Website visitor",
            "email": email.group(0) if email else None,
            "phone": phone.group(0) if phone else None,
            "source_channel": "web_chat",
            "status": "new",
        },
    )
    execute("UPDATE conversations SET lead_id = %s WHERE id = %s", (lead_id, conversation_id))
