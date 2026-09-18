import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, Header
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import platform_routes  # noqa: E402


TENANTS = {
    1: {"id": 1, "name": "Demo Agency", "slug": "demo-agency", "status": "active"},
    2: {"id": 2, "name": "Other Agency", "slug": "other-agency", "status": "active"},
}

ACCOUNTS = {
    11: {"id": 11, "tenant_id": 1, "role": "owner", "full_name": "Owner A", "email": "owner-a@example.com"},
    12: {"id": 12, "tenant_id": 1, "role": "agent", "full_name": "Agent A1", "email": "a1@example.com"},
    13: {"id": 13, "tenant_id": 1, "role": "agent", "full_name": "Agent A2", "email": "a2@example.com"},
    21: {"id": 21, "tenant_id": 2, "role": "agent", "full_name": "Agent B1", "email": "b1@example.com"},
}


@pytest.fixture
def fake_store():
    return {
        "leads": {
            101: {"id": 101, "tenant_id": 1, "assigned_agent_id": 12, "full_name": "A1 Lead", "status": "new"},
            102: {"id": 102, "tenant_id": 1, "assigned_agent_id": 13, "full_name": "A2 Lead", "status": "new"},
            201: {"id": 201, "tenant_id": 2, "assigned_agent_id": 21, "full_name": "B1 Lead", "status": "new"},
        },
        "property_data": {
            301: {
                "id": 301,
                "tenant_id": 1,
                "agent_id": 12,
                "prop_type": "House",
                "purpose": "sale",
                "covered_area": 1200,
                "price": 250000,
                "location": "Austin",
                "beds": 3,
                "baths": 2,
                "amenities": "",
                "status": "active",
            },
            302: {
                "id": 302,
                "tenant_id": 1,
                "agent_id": 12,
                "prop_type": "House",
                "purpose": "sale",
                "covered_area": 900,
                "price": 180000,
                "location": "Austin",
                "beds": 2,
                "baths": 1,
                "amenities": "",
                "status": "draft",
            },
        },
        "shares": [],
        "next_ids": {"property_data": 900, "shares": 901},
    }


@pytest.fixture
def client(monkeypatch, fake_store):
    app = FastAPI()
    platform_routes.register_platform_routes(app)

    def account_override(x_account_id: int | None = Header(default=None), x_user_id: int | None = Header(default=None)):
        account_id = x_account_id or x_user_id
        account = ACCOUNTS.get(account_id)
        if not account:
            raise AssertionError(f"Unknown test account: {account_id}")
        return {**account, "tenant_slug": TENANTS[account["tenant_id"]]["slug"], "tenant_name": TENANTS[account["tenant_id"]]["name"]}

    app.dependency_overrides[platform_routes.current_account] = account_override

    def fake_fetch_one(query, params=()):
        compact = " ".join(query.split()).lower()
        if "from tenants" in compact:
            slug = params[0]
            return next((tenant for tenant in TENANTS.values() if tenant["slug"] == slug and tenant["status"] == "active"), None)
        if "from accounts" in compact:
            account_id, tenant_id = params[0], params[1]
            account = ACCOUNTS.get(account_id)
            return {"id": account_id} if account and account["tenant_id"] == tenant_id else None
        if "from property_data" in compact and "count(*)" not in compact:
            row_id = params[0]
            tenant_id = params[1]
            row = fake_store["property_data"].get(row_id)
            if not row or row["tenant_id"] != tenant_id:
                return None
            if "coalesce(status" in compact and row.get("status", "active") != "active":
                return None
            return row
        if "from leads" in compact and "count(*)" not in compact:
            row_id = params[0]
            tenant_id = params[1]
            row = fake_store["leads"].get(row_id)
            if not row or row["tenant_id"] != tenant_id:
                return None
            if "assigned_agent_id = %s" not in compact:
                return row
            owner_id = params[2]
            shared = any(
                s["tenant_id"] == tenant_id
                and s["resource_type"] == "lead"
                and s["resource_id"] == row_id
                and s["shared_with_account_id"] == owner_id
                for s in fake_store["shares"]
            )
            return row if row["assigned_agent_id"] == owner_id or shared else None
        return {"c": 0, "total": 0}

    def fake_fetch_all(query, params=()):
        compact = " ".join(query.split()).lower()
        if "from leads" in compact:
            tenant_id = params[0]
            rows = [row for row in fake_store["leads"].values() if row["tenant_id"] == tenant_id]
            if "assigned_agent_id = %s" in compact:
                owner_id = params[1]
                rows = [
                    row
                    for row in rows
                    if row["assigned_agent_id"] == owner_id
                    or any(
                        s["tenant_id"] == tenant_id
                        and s["resource_type"] == "lead"
                        and s["resource_id"] == row["id"]
                        and s["shared_with_account_id"] == owner_id
                        for s in fake_store["shares"]
                    )
                ]
            return sorted(rows, key=lambda r: r["id"], reverse=True)
        if "from property_data" in compact:
            tenant_id = params[0]
            return [
                row
                for row in fake_store["property_data"].values()
                if row["tenant_id"] == tenant_id and row.get("status", "active") == "active"
            ]
        return []

    def fake_insert_row(table, data):
        next_id = fake_store["next_ids"].setdefault(table, 1000)
        fake_store["next_ids"][table] += 1
        row = {**data, "id": next_id}
        if table == "shares":
            fake_store["shares"].append(row)
        else:
            fake_store.setdefault(table, {})[next_id] = row
        return next_id

    monkeypatch.setattr(platform_routes, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(platform_routes, "fetch_all", fake_fetch_all)
    monkeypatch.setattr(platform_routes, "insert_row", fake_insert_row)
    monkeypatch.setattr(platform_routes, "execute", lambda *args, **kwargs: None)
    monkeypatch.setattr(platform_routes, "audit", lambda *args, **kwargs: None)

    return TestClient(app)


def test_agent_cannot_read_other_tenant_lead(client):
    response = client.get("/app/v1/leads/201", headers={"X-Account-Id": "12"})
    assert response.status_code == 404


def test_agent_cannot_read_colleague_lead(client):
    response = client.get("/app/v1/leads/102", headers={"X-Account-Id": "12"})
    assert response.status_code == 404


def test_agent_can_read_shared_lead(client):
    shared = client.post(
        "/app/v1/shares",
        json={"resource_type": "lead", "resource_id": 102, "shared_with_account_id": 12},
        headers={"X-Account-Id": "13"},
    )
    assert shared.status_code == 200

    response = client.get("/app/v1/leads/102", headers={"X-Account-Id": "12"})
    assert response.status_code == 200
    assert response.json()["id"] == 102


def test_owner_reads_all_tenant_leads(client):
    response = client.get("/app/v1/leads", headers={"X-Account-Id": "11"})
    assert response.status_code == 200
    assert {row["id"] for row in response.json()} == {101, 102}


def test_tenant_id_in_property_payload_is_ignored(client):
    response = client.post(
        "/app/v1/properties",
        json={
            "tenant_id": 2,
            "prop_type": "House",
            "purpose": "sale",
            "covered_area": 1000,
            "price": 100000,
            "location": "Austin",
            "beds": 2,
            "baths": 1,
        },
        headers={"X-Account-Id": "12"},
    )
    assert response.status_code == 200
    assert response.json()["tenant_id"] == 1
    assert response.json()["agent_id"] == 12


def test_public_cannot_see_draft_property(client):
    response = client.get("/public/v1/demo-agency/properties/302")
    assert response.status_code == 404


def test_public_endpoint_requires_no_auth(client):
    response = client.get("/public/v1/demo-agency/properties")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [301]
