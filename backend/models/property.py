from pydantic import BaseModel, Field


class PropertyCreate(BaseModel):
    title: str = "Untitled listing"
    description: str | None = None
    prop_type: str
    purpose: str
    price: float = Field(gt=0)
    covered_area: float = Field(gt=0)
    area_unit: str = "sqft"
    beds: int = Field(default=0, ge=0)
    baths: int = Field(default=0, ge=0)
    year_built: int | None = None
    parking_spaces: int = Field(default=0, ge=0)
    address_line: str | None = None
    zip_code: str | None = None
    status: str = "active"
    is_featured: bool = False
    location_id: str | None = None
    agent_id: str | None = None
    amenities: list[int] = []


class PropertyUpdate(PropertyCreate):
    title: str | None = None
    prop_type: str | None = None
    purpose: str | None = None
    price: float | None = Field(default=None, gt=0)
    covered_area: float | None = Field(default=None, gt=0)
