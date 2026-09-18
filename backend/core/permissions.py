from typing import Any

from fastapi import HTTPException


MANAGER_ROLES = {"owner", "admin"}


def is_manager(account: dict[str, Any]) -> bool:
    return account.get("role") in MANAGER_ROLES


def require_manager(account: dict[str, Any]) -> None:
    if not is_manager(account):
        raise HTTPException(status_code=403, detail="Manager role required.")
