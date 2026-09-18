from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from routers import audit, auth, conversations, dashboard, follow_ups, images, leads, properties, public, sales, sharing


settings = get_settings()
app = FastAPI(title="Plotwise Supabase API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "database": "supabase"}


app.include_router(auth.router, prefix="/app/v1")
app.include_router(properties.router, prefix="/app/v1")
app.include_router(images.router, prefix="/app/v1")
app.include_router(leads.router, prefix="/app/v1")
app.include_router(sales.router, prefix="/app/v1")
app.include_router(follow_ups.router, prefix="/app/v1")
app.include_router(sharing.router, prefix="/app/v1")
app.include_router(conversations.router, prefix="/app/v1")
app.include_router(dashboard.router, prefix="/app/v1")
app.include_router(audit.router, prefix="/app/v1")
app.include_router(public.router)
