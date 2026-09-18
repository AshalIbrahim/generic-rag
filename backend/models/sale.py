from pydantic import BaseModel, Field


class SaleCreate(BaseModel):
    property_id: str
    lead_id: str | None = None
    buyer_name: str
    buyer_email: str | None = None
    buyer_phone: str | None = None
    sold_price: float = Field(gt=0)
    deposit_amount: float | None = None
    commission_rate: float | None = None
    commission_amount: float | None = None
    payment_status: str | None = None
    financing_type: str | None = None
    offer_date: str | None = None
    contract_date: str | None = None
    closing_date: str | None = None
    possession_date: str | None = None
    notes: str | None = None
