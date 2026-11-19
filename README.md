# Community Washing Bay

A web-based business management and POS application. The repository includes authentication, configurable business settings, worker management, and a minimal worker job/commission ledger; the broader operational POS modules have not been added yet.

## Architecture

- **Backend:** Django 5.2 LTS, Django REST Framework, Simple JWT, django-filter, drf-spectacular, and PostgreSQL through `psycopg`.
- **Authentication:** username/email login, short-lived JWT access tokens, rotating refresh tokens with blacklist-backed logout, self-service password change, and role-restricted account management.
- **Configuration:** environment-driven settings split into shared, development, and production modules. CORS and CSRF trusted origins must be explicitly configured.
- **Frontend:** React, TypeScript, and Vite with Tailwind CSS and shadcn/ui conventions.
- **Client libraries:** React Router, TanStack Query, React Hook Form, Zod, Recharts, Lucide React, and an Axios API client.
- **Backend apps:** reusable foundations live in `backend/apps/core`; configurable vehicle, service, pricing, commission, expense, and inventory settings live in `backend/apps/configuration`; worker records and their job/commission ledger live in `backend/apps/workers`; the custom login user and role permissions live in `backend/apps/users`. Future business apps belong under `backend/apps`.
- **Frontend:** source is grouped under `frontend/src`, with reusable components under `src/components/ui`.

## Requirements

- Python 3.11 or newer
- Node.js 20.19+ or 22.12+
- PostgreSQL 14 or newer

## Backend setup (PowerShell)

Create a PostgreSQL database and user, then configure the backend environment:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` with the PostgreSQL connection values. Generate a Django key with `python -c "import secrets; print(secrets.token_urlsafe(50))"` and put the result in `DJANGO_SECRET_KEY`. Configure `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` with the exact frontend origin(s); do not use a wildcard.

The custom `users.User` model is configured before the first database migration. Create that initial migration before migrating a new database:

```powershell
$env:DJANGO_SETTINGS_MODULE = "config.settings.development"
python manage.py makemigrations users
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The only login roles are `SUPER_ADMIN`, `ADMIN` (business owner), and `MANAGER` (daily operations). Workers are separate records and never receive application login accounts. The workers app includes worker management and a minimal job/commission ledger; broader washing-bay and POS modules remain out of scope. Super admins receive Django and DRF permission bypasses, including permissions added in the future. New regular users default to `MANAGER`; create the initial super admin with `createsuperuser`.

Reusable DRF role gates are in `apps.core.permissions`: `HasBusinessRole`, `IsSuperAdmin`, `IsAdmin`, and `IsManager`. Build future role-restricted permissions on `HasBusinessRole` so the super-admin bypass is retained.

Business entities should inherit `UUIDTimeStampedModel` for UUID primary keys and timezone-aware timestamps. Monetary fields in future business modules must use `DecimalField`; no monetary fields exist in this foundation.

The versioned API lives under `/api/v1/`. Authentication endpoints are `POST /api/v1/auth/token/` (username or email login), `POST /api/v1/auth/token/refresh/`, `POST /api/v1/auth/token/logout/`, `GET /api/v1/auth/me/`, and `POST /api/v1/auth/password/change/`. Account management is at `/api/v1/users/`: Admins manage Managers, while only Super Admins can create or manage Admin accounts. API schema, Swagger UI, and ReDoc are at `/api/v1/schema/`, `/api/v1/docs/`, and `/api/v1/redoc/`.

Business configuration APIs are grouped under `/api/v1/configuration/`: `vehicle-types/`, `services/`, `service-pricing/`, `commission-settings/`, `expense-categories/`, and `inventory-categories/`. Admins and Super Admins can configure records; Managers have read-only access. Lists support search, ordering, field filters, and page-number pagination. Pricing and commission changes are recorded with new effective dates rather than overwriting history. API deletion deactivates records instead of removing them. No vehicle types, service names, prices, or commission rates are seeded.

Worker APIs are grouped under `/api/v1/workers/`; job assignment and lifecycle endpoints are under `/api/v1/jobs/`. Managers, Admins, and Super Admins can manage workers and jobs; only Admins and Super Admins can record commission payments. Inactive workers cannot be assigned to new jobs. Completing an assigned job snapshots the active service price and commission rate effective on its completion date; daily commission is based on completion date, and outstanding commission is accrued commission less recorded payments. Job history, commission summaries, and payment history are available from worker detail endpoints. This ledger is intentionally limited to the data needed by worker management and is not a full POS job module.

Authentication endpoints use scoped rate limits. Refresh tokens rotate and are blacklisted after rotation or logout; changing a password revokes outstanding refresh tokens and invalidates existing access tokens. User API serializers expose an explicit safe field list and never return password hashes or Django privilege flags. DRF defaults to authenticated access; public endpoints must opt in explicitly.

Run the model, configuration, worker, authentication, account-authorization, and API tests with the test-only SQLite settings (normal application settings remain PostgreSQL-only):

```powershell
python manage.py test apps.users.tests apps.authentication.tests apps.core.tests apps.configuration.tests apps.workers.tests --settings=config.settings.test
```

For production, set `DJANGO_SETTINGS_MODULE=config.settings.production`, `DEBUG=False`, a unique secret key, explicit allowed hosts/origins, and production database credentials. If TLS terminates at a trusted reverse proxy, set `DJANGO_TRUST_X_FORWARDED_PROTO=True` only when that proxy strips incoming forwarded-protocol headers and sets its own.

## Frontend setup (PowerShell)

In another terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in `frontend/.env` to the backend API root (default `http://localhost:8000/api`). The API client keeps access and refresh tokens in memory only; it does not persist JWTs in browser storage. The current backend returns tokens in JSON and does not issue HttpOnly cookies, so a full page reload requires signing in again. In production, serve the frontend and API over HTTPS.

Authenticated users can open `/workspace/settings/vehicle-types` to manage or review business configuration and `/workspace/workers` to manage worker records and view job and commission history. Admins and Super Admins can record commission payments; Managers can view the payment ledger but cannot record payments. The role-specific workspaces remain placeholders, and broader POS operations are not included yet.

Available checks:

```powershell
npm run typecheck
npm run build
```

## Project structure

```text
.
├── backend/
│   ├── apps/                 # Add modular Django apps here
│   │   ├── core/             # UUID/timestamp model and reusable permissions
│   │   ├── configuration/   # Effective-dated business configuration and APIs
│   │   ├── workers/         # Worker records, job snapshots, commission summaries/payments
│   │   └── users/            # Custom user, roles, and tests
│   ├── config/
│   │   ├── settings/         # Shared, development, production, and test settings
│   │   ├── api_urls.py       # Versioned auth, configuration, worker, and documentation routes
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── .env.example
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/ui/   # shadcn/ui components
│   │   ├── lib/             # API client and UI utilities
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.example
│   ├── components.json
│   └── package.json
└── .gitignore
```
