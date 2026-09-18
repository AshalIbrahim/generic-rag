from pydantic import BaseModel


class LeadCreate(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    status: str = "new"
    budget_min: float | None = None
    budget_max: float | None = None
    preferred_location: str | None = None
    preferences: dict = {}
    notes: str | None = None
    assigned_agent_id: str | None = None


class LeadUpdate(LeadCreate):
    full_name: str | None = None
