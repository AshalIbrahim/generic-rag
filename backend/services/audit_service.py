from typing import Any

from supabase import Client


def log_audit(
    db: Client,
    account: dict[str, Any],
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.table("audit_log").insert(
        {
            "tenant_id": account["tenant_id"],
            "actor_account_id": account["id"],
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "metadata": metadata or {},
        }
    ).execute()
