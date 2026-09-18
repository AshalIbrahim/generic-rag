# Plotwise/Zameen Platform Implementation Progress

Last updated: 2026-09-18

## Current direction

The pasted implementation plan is being applied incrementally to the existing codebase. The current repository stack remains the source of truth:

- Backend: FastAPI, Python, MySQL, ChromaDB, SentenceTransformers, boto3/S3, Groq/Google/Hugging Face LLM hooks.
- Frontend: React 18, Vite, JavaScript, MUI.
- Storage: MySQL for relational data, Supabase Storage through its S3-compatible API for listing images, AWS S3 for model/index artifacts.

Do not replace this with Anthropic, Supabase Postgres/Auth/RLS, Tailwind, or a new three-app folder layout unless the owner explicitly requests a larger migration.

## Completed so far

- Added `backend/platform_core.py`
  - Central MySQL connection/cursor helpers.
  - Current-account resolution from `X-Account-Id`, `X-User-Id`, or a numeric bearer token.
  - Manager-role helpers.
  - Generic insert/update/audit helpers.

- Added `backend/platform_routes.py`
  - Mounts CRM API namespace under `/app/v1`.
  - Mounts buyer/public API namespace under `/public/v1`.
  - Adds tenant/account-aware endpoints for:
    - `/app/v1/auth/me`
    - `/app/v1/team`
    - `/app/v1/properties`
    - `/app/v1/leads`
    - `/app/v1/sales`
    - `/app/v1/follow-ups`
    - `/app/v1/shares`
    - `/app/v1/conversations`
    - `/app/v1/dashboard`
    - `/app/v1/audit`
    - `/public/v1/{tenant_slug}/properties`
    - `/public/v1/{tenant_slug}/properties/{property_id}`
    - `/public/v1/{tenant_slug}/search`
    - `/public/v1/{tenant_slug}/chat`
  - Reuses the existing app's current chat handler when mounted.
  - Import fallback supports both `uvicorn app:app` from `backend/` and package imports from repo-root tests.

- Added `Mysql/002_platform_schema.sql`
  - Introduces tenants, accounts, leads, sales, conversations, follow-ups, shares, audit log.
  - Extends `property_data` with `tenant_id`, `agent_id`, `status`, and `updated_at`.
  - Keeps the current MySQL approach instead of switching to Supabase Postgres.

- Added `backend/__init__.py`
  - Makes the backend importable as a normal package when tests/imports need it.

- Added frontend auth/API scaffolding:
  - `frontend/src/lib/api.js`
  - `frontend/src/context/AuthContext.jsx`
  - Login persists the legacy user id and new API calls send `X-User-Id`.

- Added reusable frontend table component:
  - `frontend/src/components/ResourceTable.jsx`

- Added first CRM pages and routes:
  - Dashboard
  - Leads
  - Sales
  - Follow-ups
  - Team
  - Audit log
  - Conversations
  - Existing listings, add-listing, property detail, locations, and chatbot pages remain available.

- Removed the broken `@mui/icons-material` usage from `Chatbot.jsx`
  - The local icon package install was corrupted.
  - The chatbot now uses lightweight text controls and the app builds without the icon package.

## Completed in the latest pass

- Added tenant-aware CRM property detail support:
  - `GET /app/v1/properties/{property_id}`
  - Returns only listings visible to the current account.
  - Includes uploaded image rows with public URLs.

- Added tenant-aware CRM image endpoints:
  - `GET /app/v1/properties/{property_id}/images`
  - `POST /app/v1/properties/{property_id}/images`
  - `POST /app/v1/properties/{property_id}/images/{image_id}/primary`
  - `DELETE /app/v1/properties/{property_id}/images/{image_id}`
  - Validates property visibility before reads/writes.
  - Stores images under `{tenant_id}/{property_id}/{uuid}` paths.
  - Accepts JPEG, PNG, and WebP only.
  - Enforces a 10 MB per-file limit.
  - Re-encodes images with Pillow so EXIF/GPS metadata is stripped.
  - Writes `property_images` rows with tenant, property, uploader, and storage path metadata.

- Updated existing CRM listing screens to use the platform API:
  - `frontend/src/pages/AddListing.jsx` now creates listings through `/app/v1/properties`.
  - New-listing image uploads now go through `/app/v1/properties/{id}/images`.
  - `frontend/src/pages/PropertyDetails.jsx` now reads and updates through `/app/v1/properties/{id}`.
  - Property detail image upload/delete now uses the tenant-aware image endpoints.

- Updated backend dependency declarations:
  - Added `pillow==12.0.0` to `backend/requirements.txt`.
  - Added `python-multipart==0.0.20` to `backend/requirements.txt`.

- Added public property detail support:
  - `GET /public/v1/{tenant_slug}/properties/{property_id}`
  - Only returns rows for the requested active tenant.
  - Hides draft/archived/non-active listings with a 404.

- Added `tests/test_platform_isolation.py`
  - Uses a FastAPI test app and an in-memory fake DB layer so the critical isolation behavior can be tested without a live MySQL database.
  - Covers:
    - Agent cannot read another tenant's lead.
    - Agent cannot read a colleague's lead.
    - Agent can read a lead explicitly shared with them.
    - Owner can read all tenant leads.
    - Client-supplied `tenant_id` is ignored on property creation.
    - Public detail endpoint cannot see draft listings.
    - Public listing endpoint works without auth.

## Verification done

- `python -m py_compile backend\platform_core.py backend\platform_routes.py` passes.
- `python -m py_compile backend\platform_core.py backend\platform_routes.py tests\test_platform_isolation.py` passes.
- `npm.cmd run build` passes for `frontend/`.
- `python -m pytest tests\test_platform_isolation.py -q` could not run because the active Python interpreter does not have `pytest` installed.

## Current blockers / setup needed

1. Install Python test dependencies in the active environment, at minimum `pytest` and `httpx`, then run:
   `python -m pytest tests\test_platform_isolation.py -q`
2. Run or adapt `Mysql/002_platform_schema.sql` against the local MySQL database.
3. Verify whether the local MySQL version supports `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; if not, split those `ALTER` statements manually.

## What remains immediately

1. Smoke-test `/app/v1/auth/me`, `/app/v1/properties`, `/app/v1/leads`, and `/public/v1/demo-agency/properties` against the actual local MySQL database.
2. Run the new isolation tests after test dependencies are installed.
3. Expand tests from mocked route isolation into DB-backed behavior once the platform schema is loaded.
4. Add image reorder support in the CRM UI if manual gallery ordering is needed before pilot use.
5. Refine CRM pages from functional scaffolds into complete workflows.
6. Replace numeric-header auth with a real signed session/JWT when ready.

## Carry-forward approach

Continue incrementally:

1. First make backend compile and `/docs` load.
2. Then run the migration and smoke-test `/app/v1/auth/me`, `/app/v1/properties`, `/app/v1/leads`, and `/public/v1/demo-agency/properties`.
3. Get the isolation tests passing before expanding frontend scope.
4. Build frontend pages using shared table/form components instead of separate one-off CRUD implementations.
5. Keep old `/listings` and `/chat` routes working until the new CRM and buyer flows fully replace them.
6. Once new APIs are stable, refactor old duplicated listing code into reusable services.
