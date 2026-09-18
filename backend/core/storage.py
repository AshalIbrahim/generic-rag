import hashlib
import io
import uuid

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps
from supabase import Client

from .config import get_settings


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


async def prepare_image(file: UploadFile) -> dict:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are supported.")

    raw = await file.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds the 10 MB limit.")

    with Image.open(io.BytesIO(raw)) as image:
        image = ImageOps.exif_transpose(image)
        output = io.BytesIO()
        if content_type == "image/png":
            image.save(output, format="PNG", optimize=True)
            clean_type, extension = "image/png", ".png"
        elif content_type == "image/webp":
            image.save(output, format="WEBP", quality=86, method=6)
            clean_type, extension = "image/webp", ".webp"
        else:
            if image.mode not in {"RGB", "L"}:
                image = image.convert("RGB")
            image.save(output, format="JPEG", quality=88, optimize=True)
            clean_type, extension = "image/jpeg", ".jpg"

    body = output.getvalue()
    return {
        "body": body,
        "content_type": clean_type,
        "extension": extension,
        "checksum": hashlib.sha256(body).hexdigest(),
        "file_size_bytes": len(body),
    }


def upload_property_image(db: Client, tenant_id: str, property_id: str, image: dict) -> str:
    settings = get_settings()
    path = f"{tenant_id}/{property_id}/{uuid.uuid4().hex}{image['extension']}"
    db.storage.from_(settings.SUPABASE_BUCKET).upload(
        path,
        image["body"],
        {"content-type": image["content_type"], "upsert": "false"},
    )
    return path


def public_image_url(db: Client, storage_path: str) -> str:
    settings = get_settings()
    return db.storage.from_(settings.SUPABASE_BUCKET).get_public_url(storage_path)
