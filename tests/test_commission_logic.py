"""Pure-logic tests (no database). Run from the repo root:  python -m pytest tests/test_commission_logic.py"""
import os
import sys
from datetime import date
from decimal import Decimal

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from commissions import compute_commission, normalize_purpose, purpose_kind  # noqa: E402
from permissions import can_edit_listing, days_until_birthday  # noqa: E402


def test_sale_defaults_two_percent_half_split():
    c = compute_commission(10_000_000, "For Sale")
    assert (c["gross_commission"], c["agent_commission"], c["agency_commission"]) == (
        Decimal("200000.00"), Decimal("100000.00"), Decimal("100000.00"))


def test_rent_is_one_month_by_default():
    c = compute_commission(150_000, "rent")
    assert c["gross_commission"] == Decimal("150000.00") and c["basis"] == "monthly_rent"


def test_shares_always_add_up_to_gross():
    c = compute_commission(1_234_567.89, "sale", rate_pct=1.75, agent_split_pct=33.33)
    assert c["agent_commission"] + c["agency_commission"] == c["gross_commission"]


@pytest.mark.parametrize("bad", [
    dict(price=0, purpose="sale"), dict(price=-5, purpose="sale"), dict(price="abc", purpose="sale"),
    dict(price=100, purpose="banana"), dict(price=100, purpose="sale", rate_pct=101),
    dict(price=100, purpose="sale", rate_pct=-1), dict(price=100, purpose="sale", agent_split_pct=120)])
def test_bad_input_rejected(bad):
    with pytest.raises(ValueError):
        compute_commission(**bad)


def test_purpose_normalisation():
    assert normalize_purpose(" SALE ") == "For Sale" and normalize_purpose("for_rent") == "For Rent"
    assert normalize_purpose("x") is None and purpose_kind("For Rent") == "rent"


def test_can_edit_listing():
    agent = {"id": 5, "tenant_id": 1, "role": "agent"}
    assert can_edit_listing(agent, 1, 5)
    assert not can_edit_listing(agent, 1, 6)
    assert not can_edit_listing(agent, 1, None)
    assert can_edit_listing({"id": 9, "tenant_id": 1, "role": "owner"}, 1, 6)
    assert not can_edit_listing({"id": 9, "tenant_id": 2, "role": "owner"}, 1, 6)


def test_birthdays():
    assert days_until_birthday(date(1990, 10, 17), date(2026, 10, 17)) == 0
    assert days_until_birthday(date(1990, 10, 16), date(2026, 10, 17)) == 364
    assert days_until_birthday(date(1992, 2, 29), date(2027, 2, 1)) == 27  # 28 Feb in non-leap year
