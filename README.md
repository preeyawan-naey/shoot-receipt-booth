# SHOOT Receipt BOOTH

Vertical photobooth web app — booth UI, ticket codes, thermal print, QR download, and admin backoffice.

## Project structure

```
Shoot Receipt/
├── frontend/                 # Static booth UI + backoffice
│   ├── index.html            # Main booth app
│   ├── css/
│   ├── js/
│   │   └── native-print.js   # Native APK print driver (Intent)
│   ├── img/
│   ├── admin/                # Backoffice dashboard
│   └── package.json
│
├── android/                  # Shoot Print Bridge APK (USB silent print)
│   └── README.md             # Build & install instructions
│
├── backend/                  # Node.js API + serves frontend
│   ├── server.js
│   ├── config.js
│   ├── db.js
│   ├── storage.js
│   ├── tickets.js
│   ├── admin.js
│   ├── routes/
│   ├── scripts/              # npm run tickets:generate
│   ├── schema.sql
│   ├── schema.mysql.sql
│   ├── Dockerfile
│   ├── railway.toml
│   ├── render.yaml
│   ├── .env.example
│   └── package.json
│
├── railway.toml              # Deploy entry (points to backend/Dockerfile)
├── render.yaml               # Render Blueprint entry
└── DEPLOY.md
```

## Quick start (local)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set ADMIN_API_KEY, Supabase keys if needed
npm install
npm start
```

### 2. Open in browser

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Photobooth |
| http://localhost:3000/admin/ | Backoffice (login with `ADMIN_API_KEY`) |

The backend serves `frontend/` as static files on the same port — no separate frontend server required for normal use.

### Generate ticket codes

```bash
cd backend
npm run tickets:generate -- 20
```

## Optional: frontend-only preview

For UI work without the API (API calls will fail):

```bash
cd frontend
npm run preview
# Opens http://localhost:5173 — booth API calls need backend on :3000
```

## Environment variables

See `backend/.env.example`. Key variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default 3000) |
| `PUBLIC_URL` | Public URL for QR download links |
| `ADMIN_API_KEY` | Backoffice login key |
| `DATABASE_URL` | PostgreSQL (optional; default SQLite) |
| `SUPABASE_*` | Cloud image storage |

## Docker

Build from **repository root**:

```bash
docker build -f backend/Dockerfile -t shoot-receipt .
docker run -p 3000:3000 --env-file backend/.env shoot-receipt
```

## Deploy

See [DEPLOY.md](./DEPLOY.md).

## Native Android print (optional)

For silent USB printing without RawBT modal, build and install **Shoot Print Bridge**:

```bash
# See android/README.md
open android/   # in Android Studio → Build APK
```

Enable on tablet: `?print=native` or `localStorage.shoot_print_driver = 'native'`.
Default driver remains **rawbt** until you switch.
