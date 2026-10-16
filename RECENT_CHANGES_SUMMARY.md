# Recent Changes Summary

## Overview

Authentication and account-creation support was added for creating agents, owners, and sysadmins. The backend issues JWT access tokens at login and checks the caller's current role and tenant against the database before allowing account creation.

## Changes

### Backend — `backend/app2.py`

- The login endpoint normalizes the email to lowercase before looking it up.
- A successful login response now includes the user's role, tenant ID, and a JWT access token.
- Added token authentication that reads the account ID from the token and fetches the account's current role and tenant from the database for each authenticated request.
- Added `GET /auth/me` to return the authenticated account's ID, email, role, and tenant ID.
- Added `POST /agents/add` with these permission rules:
  - Owners can create owner or agent accounts only in their own tenant.
  - Sysadmins can create sysadmin, owner, or agent accounts.
  - Sysadmins choose a tenant when creating an owner or agent.
  - New sysadmins are assigned to the creating sysadmin's tenant (intended to be the devTeam tenant).
  - Agents cannot create accounts.
- The endpoint hashes passwords with bcrypt, applies email and password-length checks, handles duplicate emails, and does not return the password hash.
- JWT configuration expects a `JWT_SECRET` environment variable. No secret value should be committed or shared.

### Frontend

- Added `frontend/src/pages/AddAgent.jsx`, which checks `/auth/me`, shows an account-creation form only to owners and sysadmins, and submits to `/agents/add`.
- Added the Add Agent route in `frontend/src/App.jsx` and its navigation link in `frontend/src/components/NavBar.jsx`.
- Updated `frontend/src/pages/Login.jsx` to save the returned token in `localStorage` under `token`. It displays an error if a successful login response lacks a token.

## Running the Backend

The traceback showed the bare `uvicorn` command loading Uvicorn from `F:\mlops2\.venv`, while `python` and the installed PyJWT package are from `F:\generic-rag\.venv`. From `F:\generic-rag\backend`, run Uvicorn through the verified project interpreter:

```powershell
python -m uvicorn app2:app --reload
```

`app2:app` means “import the `app` object from `app2.py`.” `--reload` is optional and restarts the server after code changes; it is useful during development. The original error was caused by the wrong Uvicorn/Python environment being used, so that process could not import `jwt`.

PyJWT was installed in the project virtual environment. It is not currently listed in `backend/requirements.txt`; add it there if the dependency should be installed consistently on other machines.

## Verification Status / Follow-ups

- The developer reported that 24 permission and token checks passed against a stand-in database. Those checks did not use the real Supabase database.
- The backend endpoints have not been verified against the real database, and the frontend has not been verified in a browser.
- Confirm that `JWT_SECRET` is configured in the backend environment before using token authentication.
- Verify the database schema and the intended tenant ID for new sysadmins.
- Consider adding a logout flow that removes `token` from `localStorage`, if logout is added to the app.
