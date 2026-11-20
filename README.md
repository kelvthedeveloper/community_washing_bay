# Community Washing Bay

A web-based business management and POS application. The repository includes authentication, configurable business settings, worker management, and vehicle washing jobs with payment and commission tracking.

## Architecture

- **Backend:** Django 5.2 LTS, Django REST Framework, Simple JWT, django-filter, drf-spectacular, and PostgreSQL through `psycopg`.
- **Authentication:** username/email login, short-lived JWT access tokens, rotating refresh tokens with blacklist-backed logout, self-service password change, and role-restricted account management.
- **Configuration:** environment-driven settings split into shared, development, and production modules. CORS and CSRF trusted origins must be explicitly configured.
- **Frontend:** React, TypeScript, and Vite with Tailwind CSS and shadcn/ui conventions.
- **Client libraries:** React Router, TanStack Query, React Hook Form, Zod, Recharts, Lucide React, and an Axios API client.
- **Backend apps:** reusable foundations live in `backend/apps/core`; configurable vehicle, service, pricing, commission, expense, and inventory settings live in `backend/apps/configuration`; worker records, commission payments, and the immutable commission ledger live in `backend/apps/workers`; vehicle washing jobs, service/commission snapshots, and customer payments live in `backend/apps/jobs`; the custom login user and role permissions live in `backend/apps/users`. Future business apps belong under `backend/apps`.
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
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and set `DATABASE_URL` to the PostgreSQL connection URI from your provider. URL-encode reserved characters in the username or password, and quote the full value if it contains shell-special characters such as `&`. Generate a Django key with `python -c "import secrets; print(secrets.token_urlsafe(50))"` and put the result in `DJANGO_SECRET_KEY`. Configure `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` with the exact frontend origin(s); do not use a wildcard.

The custom `users.User` model is configured before the first database migration. Create that initial migration before migrating a new database:

```powershell
$env:DJANGO_SETTINGS_MODULE = "config.settings.development"
python manage.py makemigrations users
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The only login roles are `SUPER_ADMIN`, `ADMIN` (business owner), and `MANAGER` (daily operations). Workers are separate records and never receive application login accounts. Super admins receive Django and DRF permission bypasses, including permissions added in the future. New regular users default to `MANAGER`; create the initial super admin with `createsuperuser`.

Reusable DRF role gates are in `apps.core.permissions`: `HasBusinessRole`, `IsSuperAdmin`, `IsAdmin`, and `IsManager`. Build future role-restricted permissions on `HasBusinessRole` so the super-admin bypass is retained.

Business entities inherit `UUIDTimeStampedModel` for UUID primary keys and timezone-aware timestamps. Monetary values use `DecimalField` and are denominated in Ghana cedis (GHS). The frontend displays amounts with the Ghana cedi symbol and identifies monetary input fields as GHS; owner CSV and PDF reports identify amounts as GHS. Currency formatting does not change stored values or financial calculations.

The versioned API lives under `/api/v1/`. Authentication endpoints are `POST /api/v1/auth/token/` (username or email login), `POST /api/v1/auth/token/refresh/`, `POST /api/v1/auth/token/logout/`, `GET /api/v1/auth/me/`, and `POST /api/v1/auth/password/change/`. Account management is at `/api/v1/users/`: Admins manage Managers, while only Super Admins can create or manage Admin accounts. API schema, Swagger UI, and ReDoc are at `/api/v1/schema/`, `/api/v1/docs/`, and `/api/v1/redoc/`.

Business configuration APIs are grouped under `/api/v1/configuration/`: `vehicle-types/`, `services/`, `service-pricing/`, `commission-settings/`, `expense-categories/`, and `inventory-categories/`. Admins and Super Admins can configure records; Managers have read-only access. Lists support search, ordering, field filters, and page-number pagination. Pricing and commission changes are recorded with new effective dates rather than overwriting history. API deletion deactivates records instead of removing them. No vehicle types, service names, prices, or commission rates are seeded.

Worker APIs are grouped under `/api/v1/workers/`; vehicle search is `/api/v1/vehicles/?search=<number-plate>`. Worker commission summaries support `period=daily`, `weekly`, or `monthly` with an optional reference `date`. The read-only commission ledger is available at `/api/v1/workers/<worker-id>/commission-ledger/`; Admins and Super Admins can append signed adjustments or full reversals, while Managers can view entries. Reversals never alter payments and any resulting negative balance carries forward against future earnings. POS sales are created atomically at `/api/v1/pos/sales/` and require a UUID `Idempotency-Key` header. The server resolves current effective prices, creates a vehicle record when needed, applies authorized discounts, creates the job, and optionally records an initial payment in one transaction. Repeating the same key and payload returns the original sale; reusing a key for different data returns HTTP 409.

The POS supports cash, mobile money, card, and bank transfer. Payments may be partial or full; further payments are recorded at `/api/v1/jobs/<job-id>/payments/` with their own `Idempotency-Key`. Retried payment requests do not change balances twice. Sale prices and service-level discounts are snapshotted; later configuration changes do not affect historical sales. Only Admin and Super Admin can apply percentage or fixed discounts. The effective-dated commission setting explicitly stores the `EQUAL_SPLIT` worker allocation policy. Commission is calculated from discounted service snapshots, split evenly across assigned washers using deterministic cent-level remainder allocation, and recorded once per assignment in the append-only ledger. Managers, Admins, and Super Admins can manage workers and jobs; only Admins and Super Admins can record worker commission payouts or ledger corrections. Inactive workers cannot be assigned to new jobs, and cancelled jobs do not accrue commission. Receipts are available from `/api/v1/jobs/<job-id>/receipt/`.

Inventory APIs are grouped under `/api/v1/inventory/`: `products/`, `suppliers/`, `purchases/`, `movements/`, and `reports/`. Managers can view products and suppliers and record purchases and stock usage; Admins can also manage product and supplier records and make stock adjustments. Stock is derived exclusively from append-only purchase, usage, and adjustment movements, and transactions cannot reduce quantity below zero. Valuation uses moving weighted-average cost, with costs and quantities snapshotted on movements. The valuation and movement reports support date-based inventory review. Inventory products use the database-configured inventory categories; no supplies, suppliers, or opening quantities are seeded. The inventory interface is available at `/workspace/inventory`.

Expense records are available at `/api/v1/expenses/`. Managers can record and view expenses; Admins and Super Admins can also edit or cancel them. Deletion is disabled for financial records: each create, edit, and cancellation appends an immutable audit event, and cancelled expenses remain visible but are excluded from totals. Filter the ledger by category, payment method, date, amount, description, or cancellation status. Daily summaries use `/api/v1/expenses/reports/daily/?date=YYYY-MM-DD`; monthly summaries use `/api/v1/expenses/reports/monthly/?month=YYYY-MM`. Receipts accept PDF, PNG, JPEG, or WebP files up to 10 MB and are downloaded through an authenticated API endpoint. Categories reuse the database-configured expense categories; payment methods match the POS options. The expense interface is available at `/workspace/expenses`.

Refunds are immutable, dated records against an individual POS payment. Admins and Super Admins can create them at `/api/v1/jobs/<job-id>/refunds/` with an `Idempotency-Key`; all job roles can view refund history. A refund cannot exceed the remaining amount of its payment. Net job payments and outstanding balances reflect refunds, while the original payment and historical sale prices remain unchanged. Receipts show both payment and refund history.

Owner reports are restricted to Admin and Super Admin accounts. `GET /api/v1/reports/summary/` accepts `start_date`, `end_date`, and `group_by=daily|weekly|monthly`; matching CSV and PDF exports are available at `/api/v1/reports/exports/csv/` and `/api/v1/reports/exports/pdf/`. Completed-job revenue is attributed to completion date, after discounts, and reduced by refunds on those completed jobs. Cancelled jobs are excluded from sales; payments remain cash until refunded. Cash collected is payments received in the period less refunds paid in the period. Outstanding balances are calculated as of the report end date, with unrefunded cash held for cancelled jobs shown separately. Gross profit estimate is net revenue less net commission-ledger cost and inventory usage cost; net operating result subtracts active expenses. Inventory purchases and commission payouts are shown as cash outflows and are not deducted a second time from profit. The interface is available at `/workspace/reports`.

Authentication endpoints use scoped rate limits. Refresh tokens rotate and are blacklisted after rotation or logout; changing a password revokes outstanding refresh tokens and invalidates existing access tokens. User API serializers expose an explicit safe field list and never return password hashes or Django privilege flags. DRF defaults to authenticated access; public endpoints must opt in explicitly.

Run the model, configuration, worker, expense, reporting, inventory, authentication, account-authorization, and API tests with the test-only SQLite settings (normal application settings remain PostgreSQL-only):

```powershell
python manage.py test --settings=config.settings.test
```

## Ubuntu VPS deployment

The examples below assume Ubuntu 22.04/24.04, a DNS name such as `washing-bay.example.com`, an unprivileged `www-data` application process, and this repository installed at `/srv/community-washing-bay`. Adjust the hostname and paths before use. Keep the PostgreSQL server bound to localhost or a private network; never expose its port publicly.

### Install system packages and PostgreSQL

```bash
sudo apt update
sudo apt install -y python3-venv python3-dev build-essential libpq-dev postgresql nginx certbot
```

Use Ubuntu's existing `www-data` account. Create a Supabase project and choose PostgreSQL connection details from the project's **Connect** panel. Use the **Session pooler** connection for Windows machines or IPv4-only networks; Supabase's direct database hostname can resolve only to IPv6. A direct connection is fine when the host has working IPv6 or an IPv4 add-on. Do not use the transaction pooler (normally port `6543`) with this deployment's persistent Django connections and database-backed session behavior. Copy the selected host, port, database, and username exactly as Supabase provides them; pooler usernames may include the project reference. Require SSL. Keep database access restricted to the VPS where practical.

Install the application in a directory readable by `www-data`. Use your deployment method to populate the repository and frontend dependencies; do not make the application source writable by the web process. Verify Python is 3.11 or newer before creating the virtual environment; Ubuntu 22.04 may require installing Python 3.11 from an approved package source. Install Node.js 20.19+ or 22.12+ from an approved source. Then, from the deployed repository:

```bash
cd /srv/community-washing-bay/backend
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

cd /srv/community-washing-bay/frontend
npm ci
VITE_API_BASE_URL=https://washing-bay.example.com/api npm run build
```

Deploy the generated `frontend/dist` directory. Do not copy frontend development environment files containing local URLs into the production build.

### Configure production environment and database

Create `/etc/community-washing-bay/app.env`, owned by `root:www-data` with mode `0640`. Use a cryptographically generated Django secret (at least 50 characters), the connection URI from Supabase's **Connect** panel, and exact public origins. Use the direct endpoint or Session Pooler endpoint; do not use the transaction pooler. Put the complete connection URI on one quoted line and percent-encode reserved characters in the username/password:

```ini
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_DEBUG=False
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_TRUST_X_FORWARDED_PROTO=True
DJANGO_ALLOWED_HOSTS=washing-bay.example.com
CORS_ALLOWED_ORIGINS=https://washing-bay.example.com
CSRF_TRUSTED_ORIGINS=https://washing-bay.example.com
DATABASE_URL='postgresql://postgres.<project-ref>:<percent-encoded-password>@<supabase-host>:5432/postgres?sslmode=require&conn_max_age=60'
DJANGO_TIME_ZONE=UTC
```

Replace the example database URL with the URI Supabase provides (including its actual database name, username, host, and port). Keep `sslmode=require`; production settings enforce this when no SSL mode is present in the URL. Generate the Django secret rather than reusing the example. Keep the env file out of source control and backups accessible to ordinary users. Use a dedicated least-privilege Supabase database role where possible, granting the schema privileges Django migrations require; never put a Supabase `service_role` API key in Django's database settings or the frontend. `DJANGO_TRUST_X_FORWARDED_PROTO=True` is appropriate here because Nginx is the only proxy to the Unix socket and overwrites `X-Forwarded-Proto`. Never enable it behind a proxy that passes client-supplied forwarding headers through.

Create private runtime directories and make only receipt storage writable by Django:

```bash
sudo install -d -o root -g www-data -m 0750 /etc/community-washing-bay
sudo chown root:www-data /etc/community-washing-bay/app.env
sudo chmod 0640 /etc/community-washing-bay/app.env
sudo install -d -o www-data -g www-data -m 0750 /srv/community-washing-bay/backend/private_media
sudo install -d -o www-data -g www-data -m 0755 /srv/community-washing-bay/backend/staticfiles
```

Load the protected env file for one-time management commands, then apply migrations, collect static files, and create the initial Super Admin. The quoted `DATABASE_URL` line is shell-compatible; percent-encode reserved characters in the URL credentials:

```bash
sudo -u www-data bash -c '
  set -a
  . /etc/community-washing-bay/app.env
  set +a
  cd /srv/community-washing-bay/backend
  .venv/bin/python manage.py check --deploy
  .venv/bin/python manage.py migrate
  .venv/bin/python manage.py collectstatic --noinput
  .venv/bin/python manage.py createsuperuser
'
```

### Gunicorn and systemd

Install the supplied unit and enable the service:

```bash
sudo cp /srv/community-washing-bay/deploy/community-washing-bay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now community-washing-bay
sudo systemctl status community-washing-bay
```

The unit runs Gunicorn as `www-data`, creates the shared database cache table before startup (needed so throttles work across worker processes), writes logs to journald, and restricts filesystem writes to receipt storage and the runtime directory. Apply code and migrations as a controlled deployment; do not run migrations concurrently with application requests. Keep database and application backup/restore procedures tested.

### Nginx, TLS, and frontend

Point DNS at the VPS and allow inbound TCP 80/443. Create `/var/www/certbot`, install `deploy/nginx-bootstrap.conf` as the temporary Nginx site (replacing the example hostname), validate/reload Nginx, and request a certificate with the webroot authenticator:

```bash
sudo install -d -o www-data -g www-data -m 0755 /var/www/certbot
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d washing-bay.example.com
```

Then install `deploy/nginx.conf` as `/etc/nginx/sites-available/community-washing-bay`, replace the example hostname in both server blocks, enable it, validate, and reload:

```bash
sudo ln -s /etc/nginx/sites-available/community-washing-bay /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Nginx serves the Vite SPA and collected Django static files, terminates HTTPS, and forwards `/api/` to Gunicorn. The private media directory must not have an Nginx alias or public URL: receipt downloads are permission-checked by Django. The 11 MB request limit accommodates multipart overhead for the API's 10 MB receipt limit. Verify the certificate renewal timer is enabled after installation. Review the HSTS preload/include-subdomains settings before deployment: enable them only if every subdomain on the domain is permanently HTTPS-capable.

### Backups, logs, and operations

- Supabase plan-level backups and point-in-time recovery availability vary; verify and enable the protection level your business requires in the Supabase dashboard. The supplied `deploy/backup.sh` additionally writes a custom-format PostgreSQL dump and a separate private-media archive with restrictive permissions. Install a PostgreSQL client compatible with the Supabase server version. The backup script reads the same `DATABASE_URL` as Django, creates a temporary mode-`0600` PostgreSQL password file, and removes it when finished; it never places the password in the `pg_dump` command line. Do not use the transaction pooler for `pg_dump`; use the direct endpoint or a session pooler that supports the dump connection. Install `deploy/community-washing-bay-backup.service` and `deploy/community-washing-bay-backup.timer` into `/etc/systemd/system`, create `/var/backups/community-washing-bay` as root mode `0700`, then run `systemctl daemon-reload`, `systemctl enable --now community-washing-bay-backup.timer`, and `systemctl start community-washing-bay-backup.service` once to verify it. Check runs with `systemctl list-timers` and `journalctl -u community-washing-bay-backup.service`. Keep backups outside the public Nginx document root.
- Encrypt backups and copy them off the VPS; the supplied timer does not implement off-site transfer or retention deletion. Define retention and storage-capacity alerts for your business, and avoid storing long-lived backups on the same disk as the database.
- Test restores periodically in a separate Supabase project or isolated database. A backup is not verified until both database and media are restored and an application-level smoke test succeeds. Restore the custom-format dump using Supabase's documented restore/migration procedure and an appropriately privileged connection; never restore over production during a test. Restore media into a separate staging directory and verify receipt download through the authenticated API before promoting it.
- Django and Gunicorn write to stdout/stderr. Inspect logs with `sudo journalctl -u community-washing-bay`; configure journald retention/forwarding to meet the business's retention requirements. Nginx access/error logs are under `/var/log/nginx/`.
- Set up uptime checks for the HTTPS frontend and authenticated API health path, disk-space and backup-age alerts, and a documented patch/restart process. Restrict SSH, firewall PostgreSQL from the public interface, and keep OS/Python/npm dependencies patched.
- Review role assignments, Super Admin accounts, database access, CORS/CSRF origins, receipt access, TLS renewal, and backup access during routine operations.

### Final deployment checklist

- [ ] `manage.py check --deploy` passes with the production environment.
- [ ] `manage.py migrate --check` passes against Supabase and the database cache table exists.
- [ ] Django connects successfully to Supabase using SSL and the intended direct/session-pooler endpoint.
- [ ] HTTPS certificate and renewal dry run succeed; HTTP redirects to HTTPS.
- [ ] Frontend SPA routes reload correctly and API calls use the HTTPS origin.
- [ ] Login, refresh, logout, password change, role restrictions, and throttling work through Nginx.
- [ ] Unauthenticated requests are denied for business APIs; managers cannot access owner reports/configure prices.
- [ ] Create a POS sale, record partial/final payment, complete a job, issue a permitted refund, and reconcile reports.
- [ ] Inventory purchase/usage, expense recording/cancellation, and receipt upload/download work; private media is not directly web-accessible.
- [ ] No production secret or database credential is present in the repository or frontend bundle.
- [ ] Database and media backups are current, off-host, access-restricted, and a restore has been exercised.
- [ ] Frontend build and full Django tests pass for the release.

The shared production cache is PostgreSQL-backed to ensure authentication and API throttles are shared between Gunicorn workers. The database is Supabase PostgreSQL; Django and Gunicorn logs go to the system journal, while database monitoring and managed backups are configured through Supabase. Configure log retention and external log shipping to suit operational requirements.

## Frontend setup (PowerShell)

In another terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in `frontend/.env` to the backend API root (default `http://localhost:8000/api`). The API client keeps access and refresh tokens in memory only; it does not persist JWTs in browser storage. The current backend returns tokens in JSON and does not issue HttpOnly cookies, so a full page reload requires signing in again. In production, serve the frontend and API over HTTPS.

Authenticated users land on a role-aware dashboard with date-filtered operational or financial summaries, responsive module navigation, and recent live records. Manager dashboards show selected-day jobs, assignments, expense totals, and stock alerts. Admin and Super Admin dashboards include owner report metrics, monthly sales performance, and inventory valuation; Super Admin also sees system activity and account counts. Activity is assembled from recent job, expense, inventory, and account records rather than a separate audit log. Admins and Super Admins can manage accounts at `/workspace/users` within the backend's role restrictions. Other modules are available at `/workspace/settings/vehicle-types`, `/workspace/workers`, `/workspace/pos`, `/workspace/inventory`, and `/workspace/expenses`; owner reports at `/workspace/reports` are limited to Admin and Super Admin roles.

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
│   │   ├── workers/         # Worker records, commission ledger, summaries, and payouts
│   │   ├── jobs/            # POS sales, vehicles, price/discount snapshots, payments, refunds, and receipts
│   │   ├── inventory/      # Suppliers, inventory items, immutable stock movements, and reports
│   │   ├── expenses/       # Expense records, audit history, reversals, receipts, and reports
│   │   ├── reporting/      # Owner financial and operating reports with CSV/PDF exports
│   │   └── users/            # Custom user, roles, and tests
│   ├── config/
│   │   ├── settings/         # Shared, development, production, and test settings
│   │   ├── api_urls.py       # Versioned auth, configuration, job, inventory, expense, and docs routes
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
