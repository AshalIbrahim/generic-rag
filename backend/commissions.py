"""Pure commission / purpose helpers (no database, no FastAPI).

Kept separate from app2.py so the money maths can be unit-tested on its own.
All money uses Decimal and is rounded to 2 places (half-up) so totals never
drift by a paisa because of float error.

How commission is worked out
----------------------------
* SALE: gross commission = sale_price x rate_pct / 100        (default 2%)
* RENT: gross commission = monthly_rent x rate_pct / 100      (default 100%,
        i.e. one month's rent). In this project a rent listing's `price` is
        the monthly rent, so the same formula works for both.
* The agent's share = gross x agent_split_pct / 100           (default 50%).
  The agency keeps the rest. agency = gross - agent, so the two always add
  up exactly to the gross figure.
"""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

TWO_PLACES = Decimal("0.01")

DEFAULT_SALE_RATE_PCT = Decimal("2.00")
DEFAULT_RENT_RATE_PCT = Decimal("100.00")
DEFAULT_AGENT_SPLIT_PCT = Decimal("50.00")

MAX_SALE_RATE_PCT = Decimal("100")
MAX_RENT_RATE_PCT = Decimal("300")

PURPOSE_SALE = "For Sale"
PURPOSE_RENT = "For Rent"


def to_decimal(value, field="value") -> Decimal:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{field} must be a number")
    if not d.is_finite():
        raise ValueError(f"{field} must be a number")
    return d


def money(value) -> Decimal:
    return to_decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def normalize_purpose(value):
    """Map any spelling ('sale', 'For Sale', 'FOR_SALE', 'rent'...) to the
    canonical strings the database uses ('For Sale' / 'For Rent').
    Returns None when the value is not recognisable."""
    if value is None:
        return None
    text = str(value).strip().lower().replace("_", " ").replace("-", " ")
    if text in ("sale", "for sale", "sell", "buy"):
        return PURPOSE_SALE
    if text in ("rent", "for rent", "rental", "lease", "for lease"):
        return PURPOSE_RENT
    return None


def purpose_kind(purpose):
    """'sale' or 'rent' (None if unrecognised)."""
    canonical = normalize_purpose(purpose)
    if canonical == PURPOSE_SALE:
        return "sale"
    if canonical == PURPOSE_RENT:
        return "rent"
    return None


def compute_commission(price, purpose, rate_pct=None, agent_split_pct=None,
                       sale_rate_pct=None, rent_rate_pct=None) -> dict:
    """Return the full commission breakdown for one deal.

    rate_pct overrides the tenant's default rate for this one deal.
    sale_rate_pct / rent_rate_pct / agent_split_pct are the tenant defaults
    (module defaults are used when they are None).
    Raises ValueError with a readable message on bad input.
    """
    kind = purpose_kind(purpose)
    if kind is None:
        raise ValueError("purpose must be 'For Sale' or 'For Rent'")

    price_d = to_decimal(price, "price")
    if price_d <= 0:
        raise ValueError("price must be greater than zero")

    if rate_pct is None:
        if kind == "sale":
            rate = DEFAULT_SALE_RATE_PCT if sale_rate_pct is None else to_decimal(sale_rate_pct, "rate")
        else:
            rate = DEFAULT_RENT_RATE_PCT if rent_rate_pct is None else to_decimal(rent_rate_pct, "rate")
    else:
        rate = to_decimal(rate_pct, "commission rate")

    max_rate = MAX_SALE_RATE_PCT if kind == "sale" else MAX_RENT_RATE_PCT
    if rate < 0 or rate > max_rate:
        raise ValueError(f"commission rate must be between 0 and {max_rate}")

    split = DEFAULT_AGENT_SPLIT_PCT if agent_split_pct is None else to_decimal(agent_split_pct, "agent split")
    if split < 0 or split > 100:
        raise ValueError("agent split must be between 0 and 100")

    gross = money(price_d * rate / Decimal(100))
    agent_amount = money(gross * split / Decimal(100))
    agency_amount = gross - agent_amount

    return {
        "kind": kind,
        "basis": "sale_price" if kind == "sale" else "monthly_rent",
        "price": money(price_d),
        "rate_pct": rate.quantize(TWO_PLACES, rounding=ROUND_HALF_UP),
        "gross_commission": gross,
        "agent_split_pct": split.quantize(TWO_PLACES, rounding=ROUND_HALF_UP),
        "agent_commission": agent_amount,
        "agency_commission": agency_amount,
    }
