# Deployment Guide — Mess Meal Manager

PostgreSQL is the **primary** database (single source of truth). Google Sheets is only a reporting copy — the app works perfectly with Sheets sync disabled.

---

## 1 · Requirements

| Component | Version | Notes |
|---|---|---|
| Node.js | **≥ 20.9** | Next.js 16 requirement |
| npm | ≥ 10 | ships with Node 20 |
| PostgreSQL | ≥ 14 (tested on 17.11) | local, RDS, Neon, Supabase… |
| RAM | 512 MB minimum, 1 GB comfortable | |
| Disk | ~400 MB | `node_modules` + `.next` |

---

## 2 · Environment variables (`.env.local`)

Copy `.env.example` → `.env.local` and fill in:

```bash
# ── REQUIRED ────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME

# 32+ random characters — signs/rotates session tokens
SESSION_SECRET=...    # generate: openssl rand -hex 32

# ── OPTIONAL ────────────────────────────────────────────────
# Google Apps Script Web App /exec URL (global default).
# Per-office URL wins: offices.script_url (set in Office → Google Sheet tab)
GOOGLE_SCRIPT_WEB_APP_URL=
GOOGLE_SHEETS_WEBHOOK=            # legacy alias for the above
GOOGLE_SHEET_URL=                 # fallback sheet link shown in the UI
NEXT_PUBLIC_GOOGLE_SHEET_URL=

AUTO_SYNC=0                       # 1 = sync Sheets after every write
SHOW_PASSWORDS_IN_ADMIN=0         # keep 0 in production (use Reset Password)
NODE_ENV=production

# demo seed only
SEED_ADMIN_USER_ID=01700000000
SEED_ADMIN_PASSWORD=admin
SEED_ADMIN_NAME=Platform Admin
```

> ⚠️ Never commit `.env.local`. It is already in `.gitignore`.

---

## 3 · Local / VPS deployment (recommended)

```bash
# ── 1. install
git clone <your-repo> mess-meal-manager && cd mess-meal-manager
npm ci                      # or: npm install

# ── 2. database
sudo -u postgres psql <<'SQL'
CREATE USER messapp WITH PASSWORD 'a-strong-password' SUPERUSER;
CREATE DATABASE mess_manager OWNER messapp;
SQL

# ── 3. config
cp .env.example .env.local
#   edit DATABASE_URL + SESSION_SECRET
#   SESSION_SECRET=$(openssl rand -hex 32)

# ── 4. schema
npm run db:migrate          # applies drizzle/0000_init.sql  (or: npm run db:push)

# ── 5. optional demo data  (⚠ do NOT run in production)
npm run db:seed

# ── 6. build + run
npm run build
npm run start               # listens on 0.0.0.0:3000
```

### systemd service (keeps it alive across reboots)

`/etc/systemd/system/mess-meal.service`

```ini
[Unit]
Description=Mess Meal Manager
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mess-meal-manager
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/var/www/mess-meal-manager/.env.local

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mess-meal
sudo systemctl status mess-meal
```

### Nginx reverse proxy + HTTPS

```nginx
server {
    listen 80;
    server_name mess.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mess.example.com;

    ssl_certificate     /etc/letsencrypt/live/mess.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mess.example.com/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # ← required for secure cookies
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo certbot --nginx -d mess.example.com
```

> The app reads the client IP from `X-Forwarded-For` for rate limiting and the audit log, so that header matters.

---

## 4 · Vercel + Neon (serverless)

1. **Database:** create a Neon (or Supabase/RDS) project → copy the pooled connection string.
2. **Vercel:** import the repo → Framework preset **Next.js**.
3. **Env vars** (Project → Settings → Environment Variables): `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_SCRIPT_WEB_APP_URL`, `NODE_ENV=production`.
4. **Schema:** run once locally against the remote DB —
   ```bash
   DATABASE_URL="postgresql://…neon…" npx drizzle-kit push --force
   ```
   or `DATABASE_URL="…" npx drizzle-kit migrate`.
5. **Deploy.** Vercel runs `npm run build` automatically.

Notes for serverless:
- Use the **pooled** connection string (`-pooler` host) so `pg` doesn't exhaust connections.
- Rate limiting and the audit trail are per-instance/in-memory for the limiter only — the audit log itself is in PostgreSQL, so it survives.
- Cold starts add ~300 ms to the first request; the UI shows skeletons meanwhile.

---

## 5 · Railway / Render / Fly.io

| Step | Command / setting |
|---|---|
| Build | `npm ci && npm run build` |
| Start | `npm run start` |
| Env | `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_SCRIPT_WEB_APP_URL`, `NODE_ENV` |
| DB | attach a managed Postgres plugin, or point at Neon/RDS |
| Health check | `GET /api/health` → `{"ok":true,"database":"online"}` |
| Migrations | run `npx drizzle-kit migrate` once from a one-off container / shell |

Port: the server binds `0.0.0.0:3000` (override with `-p` in `package.json` if the platform injects `PORT`).

---

## 6 · Docker (optional)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
```

```bash
docker build -t mess-meal-manager .
docker run -d --name mess -p 3000:3000 \
  -e DATABASE_URL=postgresql://messapp:messapp@host.docker.internal:5432/mess_manager \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  mess-meal-manager
```

---

## 7 · Backup & restore

```bash
# full dump (schema + data)
pg_dump -U messapp -d mess_manager -F c -f mess-backup-$(date +%F).dump

# restore into a fresh database
createdb -U messapp mess_manager_restored
pg_restore -U messapp -d mess_manager_restored mess-backup-2026-09-13.dump

# CSV of one office's month (portable, human readable)
curl -b "mmm_session=…" "https://mess.example.com/api/report/export?format=csv&variant=full"
```

Nightly cron:

```bash
0 3 * * * pg_dump -U messapp -d mess_manager -F c -f /backups/mess-$(date +\%F).dump && find /backups -name 'mess-*.dump' -mtime +30 -delete
```

---

## 8 · Pre-production checklist

- [ ] `SESSION_SECRET` is a fresh 64-char random string (not the example value)
- [ ] Demo seed **not** run, or all demo users deleted / passwords changed
- [ ] `SHOW_PASSWORDS_IN_ADMIN=0`
- [ ] Platform admin password changed (`admin` → strong)
- [ ] PostgreSQL password is strong; DB not exposed to `0.0.0.0`
- [ ] HTTPS enabled (cookies are `Secure` in production)
- [ ] `npm run build` succeeds with 0 TypeScript errors
- [ ] `npm run test` → 141 API checks + 70 sheet checks pass
- [ ] `GET /api/health` returns `database: "online"` and `timezone: "Asia/Dhaka"`
- [ ] Backups scheduled and a restore has been rehearsed
- [ ] Google Apps Script deployed **only if** Sheets reporting is wanted (optional)

---

## 9 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `database: "offline"` on `/api/health` | `DATABASE_URL` wrong or Postgres down | `sudo pg_ctlcluster 17 main start`; test `psql "$DATABASE_URL" -c 'select 1'` |
| Login says "অনেক বেশি অনুরোধ" | 12 wrong attempts per login id / 10 min | wait, or restart the app to clear the in-memory limiter |
| Meals/bazar dates look off by one day | container TZ not set | the app forces `Asia/Dhaka` internally (`src/lib/date.ts`) — make sure you did not override `TZ` to a value the DB disagrees with |
| Sheet sync says URL not configured | no `offices.script_url` and no env URL | Office → Google Sheet → paste the `/exec` URL (see `docs/google-apps-script.md`) |
| Sync returns 502 | Apps Script quota / script error | the DB write already succeeded — check `sync_logs` and the script's Executions log |
| Bengali shows as `à¦…à¦«à¦¿à¦b` in Excel | CSV opened without BOM handling | the CSV already carries a UTF-8 BOM; open with Excel 2016+ or LibreOffice |
| `drizzle-kit push` asks to drop columns | local schema drift | prefer `npm run db:migrate` on servers with real data |
