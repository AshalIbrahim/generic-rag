from supabase import Client, create_client

from .config import get_settings


def get_service_client() -> Client:
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_anon_client() -> Client:
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
