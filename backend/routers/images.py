from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from supabase import Client

from core.database import get_service_client
from core.security import get_current_account
from core.storage import prepare_image, public_image_url, upload_property_image
from routers.properties import get_visible_property
from services.audit_service import log_audit


router = APIRouter(prefix="/properties/{property_id}/images", tags=["images"])


@router.get("")
def list_images(property_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_property(db, property_id, account)
    rows = (
        db.table("property_images")
        .select("*")
        .eq("property_id", property_id)
        .eq("tenant_id", account["tenant_id"])
        .order("is_primary", desc=True)
        .order("sort_order")
        .execute()
        .data
        or []
    )
    for row in rows:
        row["url"] = public_image_url(db, row["storage_path"])
    return rows


@router.post("")
async def upload_images(property_id: str, files: list[UploadFile] = File(...), account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_property(db, property_id, account, write=True)
    uploaded, failed = [], []
    for file in files:
        try:
            image = await prepare_image(file)
            path = upload_property_image(db, account["tenant_id"], property_id, image)
            row = (
                db.table("property_images")
                .insert(
                    {
                        "property_id": property_id,
                        "tenant_id": account["tenant_id"],
                        "storage_path": path,
                        "file_size_bytes": image["file_size_bytes"],
                        "checksum": image["checksum"],
                        "uploaded_by": account["id"],
                    }
                )
                .execute()
                .data[0]
            )
            row["url"] = public_image_url(db, path)
            uploaded.append(row)
        except Exception as exc:
            failed.append({"filename": file.filename, "error": str(exc)})
    if uploaded:
        log_audit(db, account, "property.images.upload", "property", property_id, {"count": len(uploaded)})
    return {"success": bool(uploaded), "uploaded": uploaded, "failed": failed}


@router.post("/{image_id}/primary")
def set_primary(property_id: str, image_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_property(db, property_id, account, write=True)
    image = db.table("property_images").select("*").eq("id", image_id).eq("property_id", property_id).eq("tenant_id", account["tenant_id"]).maybe_single().execute().data
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")
    db.table("property_images").update({"is_primary": False}).eq("property_id", property_id).eq("tenant_id", account["tenant_id"]).execute()
    db.table("property_images").update({"is_primary": True}).eq("id", image_id).execute()
    log_audit(db, account, "property.images.primary", "property", property_id, {"image_id": image_id})
    return {"success": True}


@router.delete("/{image_id}")
def delete_image(property_id: str, image_id: str, account=Depends(get_current_account), db: Client = Depends(get_service_client)):
    get_visible_property(db, property_id, account, write=True)
    image = db.table("property_images").select("*").eq("id", image_id).eq("property_id", property_id).eq("tenant_id", account["tenant_id"]).maybe_single().execute().data
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")
    db.storage.from_("property-images").remove([image["storage_path"]])
    db.table("property_images").delete().eq("id", image_id).execute()
    log_audit(db, account, "property.images.delete", "property", property_id, {"image_id": image_id})
    return {"success": True}
