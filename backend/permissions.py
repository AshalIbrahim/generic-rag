"""Pure permission / date helpers (no database, no FastAPI).

`caller` is the dict returned by get_current_account():
    {"id": int, "tenant_id": int, "email": str, "role": "agent"|"owner"|"sysadmin"}
"""
from datetime import date

# Who may edit a listing they did not upload?
#   - the uploading agent: always
#   - other agents: never (they can still VIEW every listing)
#   - the owner of the same agency: yes (flip this to False if you want a
#     strict "only the uploader" rule with no owner override)
#   - sysadmin: yes (support/maintenance)
OWNERS_CAN_EDIT_ALL_IN_TENANT = True
SYSADMIN_CAN_EDIT_ALL = True


def can_edit_listing(caller: dict, property_tenant_id, property_agent_id) -> bool:
    role = caller.get("role")
    if role == "sysadmin":
        return SYSADMIN_CAN_EDIT_ALL
    if role == "owner":
        return OWNERS_CAN_EDIT_ALL_IN_TENANT and caller.get("tenant_id") == property_tenant_id
    if role == "agent":
        # Listings with no agent_id (migrated legacy rows) belong to nobody,
        # so an agent can't edit them; the owner can.
        return property_agent_id is not None and property_agent_id == caller.get("id")
    return False


def days_until_birthday(bday: date, today: date) -> int:
    """Days from `today` to the next occurrence of `bday` (0 = today).
    29 Feb birthdays are celebrated on 28 Feb in non-leap years."""
    def occurrence(year):
        try:
            return date(year, bday.month, bday.day)
        except ValueError:  # 29 Feb in a non-leap year
            return date(year, 2, 28)

    nxt = occurrence(today.year)
    if nxt < today:
        nxt = occurrence(today.year + 1)
    return (nxt - today).days
