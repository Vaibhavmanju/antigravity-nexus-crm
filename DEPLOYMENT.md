# Deployment Guide

This project is now ready to deploy two ways. Pick one.

---

## Option 1 — Docker Compose (single VM: AWS EC2, DigitalOcean Droplet, Azure VM, etc.)

Everything — MySQL, backend, frontend — runs from one `docker-compose.yml`, on any machine with Docker installed.

### Steps

1. Install Docker + Docker Compose on your VM ([get.docker.com](https://get.docker.com) is the fastest way).
2. Copy this whole project folder to the VM (`git clone` or `scp`).
3. `cp .env.example .env` and fill in real values — **at minimum change `DB_PASSWORD`, `JWT_SECRET`, and `ADMIN_PASSWORD`**. Generate a JWT secret with:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. If you have a domain, set `FRONTEND_URL` and `REACT_APP_API_URL` to the real URLs now (they get baked into the frontend build).
5. From the project root:
   ```
   docker compose up -d --build
   ```
   This builds and starts all three containers. The backend automatically waits for MySQL, runs the schema setup (`setup-db`, safe to run repeatedly), and boots — no manual DB step needed.
6. Visit `http://<your-vm-ip>` — the frontend is on port 80, the API on port 5000.
7. Check logs anytime with `docker compose logs -f backend` (or `frontend`, `mysql`).

### Putting it behind a real domain + HTTPS

Point your domain's DNS A record at the VM's IP, then put a reverse proxy in front (simplest: install [Caddy](https://caddyserver.com) on the host — it gets you automatic free HTTPS with a 3-line Caddyfile pointing `yourdomain.com` at `localhost:80` and `api.yourdomain.com` at `localhost:5000`). Update `FRONTEND_URL`/`REACT_APP_API_URL` in `.env` to the HTTPS domains and re-run `docker compose up -d --build`.

### Updating after a code change

```
git pull
docker compose up -d --build
```

---

## Option 2 — Railway (backend + MySQL) + Vercel (frontend)

No servers to manage; git-push deploys.

### Backend + Database (Railway)

1. [railway.com](https://railway.com) → New Project → **+ New → Database → MySQL**.
2. **+ New → GitHub Repo**, connect your repo, set **Root Directory** to `backend`. Railway will detect the `Dockerfile` automatically (the included `railway.json` pins the healthcheck to `/api/health`).
3. In the backend service's **Variables** tab, add everything from `backend/.env.example`, pointing the `DB_*` fields at the MySQL service's variables (Railway lets you reference them directly, e.g. `${{MySQL.MYSQLHOST}}`).
4. Deploy. Once live, open the service **Shell** (or `railway run`) and run:
   ```
   npm run setup-db
   ```
5. Confirm `https://<your-backend>.up.railway.app/api/health` responds.

### Frontend (Vercel)

1. [vercel.com](https://vercel.com) → Add New Project → import the repo → set **Root Directory** to `frontend` (the included `vercel.json` handles the build settings and SPA routing).
2. Add environment variable `REACT_APP_API_URL=https://<your-backend>.up.railway.app/api`.
3. Deploy.

### Close the loop

Back in Railway, set the backend's `FRONTEND_URL` to your Vercel URL and redeploy so CORS allows it.

---

## Post-deploy checklist (either option)

- [ ] Changed `JWT_SECRET`, `DB_PASSWORD`, and `ADMIN_PASSWORD` from any defaults
- [ ] Logged in as admin and confirmed the dashboard loads
- [ ] Added a test user with a Google Sheet link and triggered a manual sync
- [ ] Confirmed the notification bell and Activity Feed work
- [ ] Left Power BI / SMTP variables blank if not using them yet (features degrade gracefully) or filled them in if you are
