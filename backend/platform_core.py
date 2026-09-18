import os
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import mysql.connector
from fastapi import Header, HTTPException


MANAGER_ROLES = {"owner", "admin"}


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("HOST"),
        port=int(os.getenv("PORT", 3306)),
        user=os.getenv("USER"),
        password=os.getenv("PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


@contextmanager
def db_cursor(dictionary: bool = True):
    conn = get_connection()
    cursor = conn.cursor(dictionary=dictionary)
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def fetch_one(query: str, params: tuple[Any, ...] = ()):
    with db_cursor() as (_, cursor):
        cursor.execute(query, params)
        return cursor.fetchone()


def fetch_all(query: str, params: tuple[Any, ...] = ()):
    with db_cursor() as (_, cursor):
        cursor.execute(query, params)
        return cursor.fetchall()


def execute(query: str, params: tuple[Any, ...] = ()):
    with db_cursor(dictionary=False) as (conn, cursor):
        cursor.execute(query, params)
        return cursor.lastrowid


def current_account(
    authorization: str | None = Header(default=None),
    x_account_id: int | None = Header(default=None),
    x_user_id: int | None = Header(default=None),
):
    """Resolve the current CRM account.

    The legacy frontend currently stores only a numeric user id after login. The
    new platform APIs accept that through X-User-Id/X-Account-Id while the app is
    migrated toward a proper bearer-token session.
    """
    account_id = x_account_id or x_user_id
    if not account_id and authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].isdigit():
            account_id = int(parts[1])

    if not account_id:
        raise HTTPException(status_code=401, detail="Missing account context.")

    account = fetch_one(
        """
        SELECT a.*, t.slug AS tenant_slug, t.name AS tenant_name
        FROM accounts a
        JOIN tenants t ON t.id = a.tenant_id
        WHERE (a.id = %s OR a.user_id = %s) AND a.is_active = TRUE
        LIMIT 1
        """,
        (account_id, account_id),
    )
    if not account:
        raise HTTPException(status_code=401, detail="Account not found or inactive.")
    return account


def is_manager(account: dict[str, Any]) -> bool:
    return account.get("role") in MANAGER_ROLES


def visible_owner_clause(account: dict[str, Any], owner_column: str = "agent_id"):
    if is_manager(account):
        return "", ()
    return f" AND ({owner_column} = %s OR EXISTS (SELECT 1 FROM shares s WHERE s.resource_type = %s AND s.resource_id = id AND s.shared_with_account_id = %s))", (
        account["id"],
    )


def require_manager(account: dict[str, Any]):
    if not is_manager(account):
        raise HTTPException(status_code=403, detail="Manager role required.")


def audit(account: dict[str, Any], action: str, resource_type: str, resource_id: int | None, metadata: dict[str, Any] | None = None):
    execute(
        """
        INSERT INTO audit_log (tenant_id, actor_account_id, action, resource_type, resource_id, metadata_json, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            account["tenant_id"],
            account["id"],
            action,
            resource_type,
            resource_id,
            json_dumps(metadata or {}),
            datetime.utcnow(),
        ),
    )


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, default=str)


def insert_row(table: str, data: dict[str, Any]) -> int:
    fields = list(data.keys())
    placeholders = ", ".join(["%s"] * len(fields))
    sql = f"INSERT INTO {table} ({', '.join(fields)}) VALUES ({placeholders})"
    return execute(sql, tuple(data[f] for f in fields))


def update_row(table: str, row_id: int, tenant_id: int, data: dict[str, Any]) -> None:
    if not data:
        return
    assignments = ", ".join(f"{field} = %s" for field in data)
    execute(
        f"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND tenant_id = %s",
        tuple(data.values()) + (row_id, tenant_id),
    )

