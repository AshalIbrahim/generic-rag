from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str


class PaginatedResponse(BaseModel):
    items: list
    total: int | None = None
