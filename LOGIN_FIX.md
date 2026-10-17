# Local Login Fix

## Problem

The frontend sends `POST /auth/login` to the backend at `http://127.0.0.1:8000` by default. The documented local backend command started `app.py`, but the frontend expects the token-based login implemented in `app2.py`.

Even if the credentials were accepted by `app.py`, it returned only an account ID and email. The frontend checks for `data.token` and does not consider login successful without it. Also, `app2.py`'s CORS origin list was missing a comma after the ngrok URL, joining it with the localhost origin into one invalid origin string.

## Changes Made

- Updated the local README command to run `uvicorn app2:app --reload` from the `backend/` directory.
- Corrected the CORS origin list in `backend/app2.py` so `http://localhost:5173` is allowed as a distinct origin. The `http://127.0.0.1:5173` origin is also allowed.
- Added `psycopg2-binary` and `PyJWT` to the root `requirements.txt`, which is the dependency file referenced by the README's local setup instructions. They are also listed in `backend/requirements.txt`.
- Restored the Dockerfile after confirming the workflow is local and not Docker-based.

## Run Locally

Install the root requirements in the Python environment used for the backend, then run:

```powershell
cd backend
uvicorn app2:app --reload
```

Start the Vite frontend separately, normally with `npm run dev` from `frontend/`.

## Remaining Runtime Requirement

`app2.py` connects to PostgreSQL using `SUPABASE_PG_HOST`, `SUPABASE_PG_PORT`, `SUPABASE_PG_USER`, `SUPABASE_PG_PASSWORD`, and `SUPABASE_PG_DATABASE`; it also needs `JWT_SECRET`. Ensure these settings are available to the local backend process and that the database is reachable. The login flow uses the `accounts` table and bcrypt-hashed passwords.

## Validation

Python diagnostics reported no errors in `backend/app2.py`. Static checks confirmed the local launch instruction, app2 dependencies, and CORS origins are configured. The backend itself was not started, so successful database connectivity and login with a particular account were not runtime-tested.
