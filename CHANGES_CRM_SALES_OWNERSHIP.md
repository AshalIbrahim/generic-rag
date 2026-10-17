# Changes: listing ownership, data fixes, sales & commissions, CRM

All additions are marked `# ==== ADDED ... ====` (Python) or `{/* ==== ADDED ==== */}` / `// ==== ADDED` (JSX).
Existing lines that had to change are marked `CHANGED` — the full list is at the bottom.

## 1. Run this first (database)
Run `backend/sql/plotwise_crm_sales.sql` once in the Supabase SQL editor. It is transactional and safe to re-run.
It creates `commission_settings` and `sales`, and adds any missing columns to your existing `leads` and `follow_ups` tables
(it never drops or alters existing columns). If it errors on a foreign key, send me `\d leads` and `\d accounts` output.

## 2. Listing ownership
- A listing's `agent_id` is now the logged-in agent who added it (single add **and** bulk upload); `tenant_id` comes from their token, not the hard-coded constant.
- **Everyone can view every listing.** Only the uploading agent can edit it or add/delete its photos (HTTP 403 otherwise).
- Owner of the same agency and sysadmins can also edit (switch off in `backend/permissions.py` via `OWNERS_CAN_EDIT_ALL_IN_TENANT` / `SYSADMIN_CAN_EDIT_ALL`).
- Migrated legacy listings have no agent: only owners/sysadmins can edit those.
- Sysadmins can't add listings (they belong to the dev tenant); agents and owners can.
- New `GET /listings/{id}/permissions` powers the UI: Edit button and photo controls hide for non-owners, with a "Listed by …" chip.
- All write endpoints now require login; the frontend sends the JWT.

## 3. Data correctness
- `purpose` is normalised to `For Sale` / `For Rent` on add, edit and bulk upload; anything else is rejected. `/listings?purpose=sale|rent|For Sale` all work.
- `/listings` now has `ORDER BY id DESC` (newest first, stable paging).
- Bulk upload skips duplicates (same agency + location + type + purpose + area + price + beds + baths), including repeats inside one file, and reports `rows_duplicates_skipped`.

## 4. Sales & commissions (`/sales`, `/commissions/*`, page: Sales)
- Sale commission = sale price × rate (default **2%**). Rental commission = **one month's rent** × rate (default **100%**).
- Agent share defaults to **50%**; agency keeps the rest (agent + agency always equals gross, to the paisa — uses Decimal).
- Owners set the three defaults per agency (Sales page → Commission settings); any deal can override the rate.
- Recording a deal: agents record their own; owners can credit any agent in the agency. Linking a lead marks it **won**.
- One live deal per property (a second returns 409; cancel the first to re-record). Owner can mark paid / pending / cancelled.
- Agents see only their own deals and totals; owners see the whole agency.
- The listing's `status` is set to `sold`/`rented` when allowed; if your `status` column has a CHECK that rejects those values the deal is still saved and the response says `property_status_updated: false`.

## 5. CRM (`/leads`, `/follow-ups`, `/agents/performance`; pages: Leads, Performance)
- Leads: add, search, change status (new → contacted → viewing → negotiation → won/lost). Agents see only leads assigned to them; owners see all and can reassign.
- Follow-ups: schedule (call/WhatsApp/SMS/email/meeting), due today / overdue views, mark done with an outcome.
- Birthdays: leads with a birthday in the next 30 days (uses the existing `bday` column).
- Performance: per agent — listings, leads, won, conversion %, follow-ups done/pending/overdue, deals, sales volume, commission.

## 6. Verified
- 9 end-to-end tests ran the real `app2.py` routes (real JWT login, bcrypt, SQL) against a throwaway PostgreSQL 16: ownership, tenant isolation, role checks, purpose handling, dedup, commission maths, settings, cancel, leads, follow-ups, performance.
- 13 pure-logic unit tests: `python -m pytest tests/test_commission_logic.py`.
- `vite build` succeeds with all new pages.
- **Not verified:** against your real Supabase data, and in a browser by a human. Only the heavy ML libraries (Chroma, sentence-transformers, Groq, Gemini) were stubbed, so `/chat` was not exercised.

## 7. Things to know / do
- `backend/requirements.txt` is saved as UTF-16 so I didn't edit it. Add `pyjwt` (and `python-multipart` if missing).
- Still open from your handoff, untouched on purpose: the `print("API key:", ...)` line in `app2.py` (it logs your Groq key — remove it and rotate the key), CORS still allows only the old ngrok origin, Chroma isn't re-indexed for new listings, `DEFAULT_TENANT_ID` still used elsewhere.
- Refreshing the page logs you out (App.jsx keeps `user` only in React state) — pre-existing.

## Existing lines changed (`CHANGED` markers)
`backend/app2.py`: `add_listing`, `update_listing`, `upload_property_images`, `delete_property_image`, `bulk_upload_listings` (signatures gained `caller`, inserts use `caller` instead of `DEFAULT_TENANT_ID`/`NULL`, purpose normalised), `validate_property_row` (purpose), `get_listings` (purpose filter + ORDER BY), bulk response (`rows_failed` excludes duplicates).
`frontend`: `AddListing.jsx` (3 calls send the token; duplicate count shown), `PropertyDetails.jsx` (3 calls send the token; Edit/photo controls gated), `App.jsx` and `NavBar.jsx` (routes/links).
