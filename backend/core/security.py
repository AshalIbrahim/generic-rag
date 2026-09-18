from typing import Any

from fastapi import Depends, Header, HTTPException
from supabase import Client

from .database import get_service_client


def bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")
    return token


def get_current_account(token: str = Depends(bearer_token), db: Client = Depends(get_service_client)) -> dict[str, Any]:
    try:
        user = db.auth.get_user(token).user
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session.") from exc

    response = (
        db.table("accounts")
        .select("*, tenants(slug,name,status)")
        .eq("id", user.id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    account = response.data
    if not account:
        raise HTTPException(status_code=401, detail="Account not found or inactive.")
    tenant = account.pop("tenants", None) or {}
    if tenant.get("status") != "active":
        raise HTTPException(status_code=403, detail="Tenant is not active.")
    account["tenant_slug"] = tenant.get("slug")
    account["tenant_name"] = tenant.get("name")
    return account
