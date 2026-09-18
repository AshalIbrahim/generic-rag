from pydantic import BaseModel


class PublicSearchRequest(BaseModel):
    query: str


class PublicChatRequest(BaseModel):
    session_id: str
    message: str
    conversation_id: str | None = None
