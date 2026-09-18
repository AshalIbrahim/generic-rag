from fastapi import APIRouter, Depends

from core.security import get_current_account


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(account=Depends(get_current_account)):
    return account
