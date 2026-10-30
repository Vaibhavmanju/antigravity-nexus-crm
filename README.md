# Antigravity Nexus CRM — Full Stack Edition

A complete, production-style full-stack CRM platform: the exact same futuristic React frontend you started with, now powered by a real **Node.js + Express + MySQL** backend instead of browser localStorage. Built for seminar/project demonstrations where judges expect a genuine client-server architecture, secure authentication, and a persistent relational database.

## 🏗️ Architecture

```
nexus-crm-fullstack/
├── backend/                  Node.js + Express + MySQL REST API
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js              MySQL connection pool 
│   │   │   └── setupDatabase.js   One-shot schema + seed script
│   │   ├── middleware/
│   │   │   └── auth.js            JWT verification & role guards
│   │   ├── routes/
│   │   │   ├── auth.js            Admin & user login, /me
│   │   │   ├── users.js           Admin: full user CRUD
│   │   │   ├── me.js               Logged-in user: profile, performance, tasks
│   │   │   └── dashboard.js       KPIs, charts, master sheet link, activity log
│   │   └── server.js              Express app entry point
│   ├── .env                       Database & JWT configuration
│   └── package.json
│
└── frontend/                 React 18 (unchanged UI, now API-driven)
    ├── src/
    │   ├── components/            All original screens — visually identical
    │   ├── context/AuthContext.js Same interface, now calls the REST API
    │   ├── services/api.js        Thin fetch wrapper for the backend
    │   └── App.js / index.js
    ├── .env                       Points at the backend API URL
    └── package.json
```

The frontend's visual design, layout, animations, and component structure are **fully retained** exactly as in the original prototype. Only the data layer changed: `AuthContext` now calls a real REST API backed by MySQL instead of reading/writing `localStorage`.

## ✨ What's new / unique (great for seminar judges)

1. **Real relational database** — MySQL with proper foreign keys (`users`, `daily_performance`, `tasks`, `activity_log`, `admins`, `settings`), not browser storage that vanishes on a cache clear.
2. **Secure authentication** — passwords are hashed with bcrypt (never stored in plaintext), sessions use signed JWTs, and admin-only routes are enforced server-side, not just hidden in the UI.
3. **Live Activity Feed** (new sidebar tab) — a real-time audit trail showing every create/update/delete action an admin performs, with a "live" auto-refreshing indicator. This is the standout feature to highlight live in a demo: open two browser tabs, make a change as admin in one, and watch it appear in the Activity Feed.
4. **Server-calculated analytics** — weekly totals, completion percentages, and department/role breakdowns are computed by SQL aggregate queries, not client-side reducers over a hardcoded array, so the numbers are trustworthy at any scale.
5. **Stateless, scalable API** — the same backend could serve a mobile app or a second admin panel with no extra work, since all logic lives server-side behind versioned REST endpoints.

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- MySQL 8.x or MariaDB 10.x installed and running locally (or a remote MySQL instance)

### 1. Database & Backend

```bash
cd backend
npm install
```

Edit `backend/.env` and set your real MySQL password:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password      # ← change this
DB_NAME=nexus_crm
```

Run the one-shot setup script. It creates the database, all tables, and seeds the admin account plus four demo employees with a week of sample performance data:

```bash
npm run setup-db
```

You should see:
```
🎉  Database setup complete!

    Admin Login: Sridevisri089@gmail.com / Sridevi@2026
```

Start the API server:

```bash
npm start
```

The API runs on **http://localhost:5000**. Check `http://localhost:5000/api/health` to confirm it's live.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm start
```

The app opens on **http://localhost:3000**.

### 3. Login

- **Admin Portal** → `Sridevisri089@gmail.com` / `Sridevi@2026`
- **User Portal** (demo employees, all pre-seeded):
  | Email | Password |
  |---|---|
  | alice@example.com | alice123 |
  | bob@example.com | bob123 |
  | carol@example.com | carol123 |
  | david@example.com | david123 |

## 🔐 Security notes

> **Project name: Antigravity Nexus CRM.** All visible branding uses this name. The database name (`DB_NAME=nexus_crm`) and folder names are intentionally unchanged so existing deployments keep working with no migration.


- Admin self-signup has been **disabled** in this version — the single admin account is provisioned once via the seed script, which is the standard practice for a system with one trusted administrator. To add more admins, insert directly into the `admins` table (with a bcrypt-hashed password) or extend the API with an admin-only "create admin" endpoint.
- Change `JWT_SECRET` in `backend/.env` before deploying anywhere outside your local machine or seminar laptop.
- The provided `Sridevi@2026` password meets typical strength requirements (mixed case, digit, symbol) but you should still treat `.env` as a secret file — it's already excluded via `.gitignore`.

## ☁️ Deploying to the cloud

The project ships ready to deploy — Dockerfiles for both `backend/` and `frontend/`, a root `docker-compose.yml` for one-command VM deploys, and `railway.json` / `vercel.json` for a git-push managed deploy. **See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full step-by-step.**

Quick start (single VM with Docker):
```
cp .env.example .env   # fill in real secrets
docker compose up -d --build
```

## 📡 API Reference (quick overview)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/admin/login` | Public | Admin login → JWT |
| POST | `/api/auth/user/login` | Public | Employee login → JWT |
| GET | `/api/auth/me` | Authenticated | Current session info |
| GET/POST | `/api/users` | Admin | List / create employees |
| PUT/DELETE | `/api/users/:id` | Admin | Update / delete an employee |
| GET | `/api/dashboard/summary` | Admin | KPI cards + chart data |
| GET | `/api/dashboard/activity` | Admin | Live audit trail |
| GET/PUT | `/api/settings/master-sheet` | Admin | Master sheet link |
| GET/PUT | `/api/me/profile` | Employee | Own profile |
| PUT | `/api/me/performance` | Employee | Update own weekly numbers |
| GET/POST/PUT/DELETE | `/api/me/tasks` | Employee | Own task list |

## 📊 Google Sheets Sync (per-user)

Each employee can have a personal Google Sheet linked to their profile. The backend pulls their weekly performance numbers straight from that sheet into MySQL — no manual data entry needed.

### Sheet format

Put day names in one row and the matching numbers in the row directly below:

```
Monday  Tuesday  Wednesday  Thursday  Friday  Saturday  Sunday
120     145      98         160       134     175       155
```

This also works as two columns (`Day` / `Value`, one pair per row), or even bare numbers in any cell if no day labels are found — the parser tries all three layouts automatically.

### Sharing requirement

The sheet **must** be shared as **"Anyone with the link can view"** (Share → General access → Anyone with the link). No Google account, API key, or service account is required — the backend reads the public CSV export of the sheet.

### How sync happens

1. **Automatic** — the backend syncs every linked sheet on a timer (default every 5 minutes, configurable via `SHEET_SYNC_INTERVAL_MINUTES` in `backend/.env`). Disable with `SHEET_AUTO_SYNC=false`.
2. **Manual (one user)** — in the admin's User Details table, click the ↻ icon next to a user's sheet link, or use the "Refresh" button on their Individual User page.
3. **Manual (all users)** — "Refresh All Sheets" button on the Master Sheet page.

### Sync status indicators

- A small green dot next to a user's sheet link means the last sync succeeded; red means it failed (hover for the error message).
- Common error: *"Sheet is private"* → the sheet's sharing setting needs to be changed to "Anyone with the link can view."
- Each sync overwrites that user's current-week `daily_performance` rows and recalculates `achieved` — it does not touch other weeks' history.

### API endpoints added

| Method | Endpoint | Purpose |
|---|---|---|
| PUT | `/api/users/:id/sync-sheet` | Sync one user's sheet now |
| PUT | `/api/users/sync-all` | Sync every user with a sheet link now |



- **"MySQL connection failed"** on backend start → confirm MySQL/MariaDB is running and `DB_PASSWORD` in `.env` is correct.
- **CORS errors in the browser console** → confirm `FRONTEND_URL` in `backend/.env` matches the URL the frontend is actually served from.
- **Login always fails** → re-run `npm run setup-db`; it's idempotent and safe to run again, it will reset the admin password to whatever is in `.env`.
- **"Sheet is private" error when syncing** → open the sheet in Google Sheets → Share → change General access to "Anyone with the link" → Viewer.
- **Sync succeeds but numbers look wrong** → double check Row 1 has the day names spelled out (or abbreviated, e.g. "Mon") and Row 2 has the matching numbers directly underneath.

## 📈 Power BI Analytics (Path A: MySQL → Power BI → Embedded)

This adds a real Power BI report embedded straight into the CRM, scoped per employee with Row-Level Security (RLS), on top of the existing MySQL data — no more sheet-parsing needed for the BI layer.

### How it works
1. **Power BI reads MySQL directly.** Build a Power BI Desktop report against `nexus_crm` (the MySQL connector), modeling `users`, `daily_performance`, `tasks`, and the new `dim_date` date-dimension table (auto-populated by `setup-db`) for clean daily/weekly/monthly time-intelligence DAX.
2. **Publish to a Power BI workspace** and add a role called `Employee` with an RLS filter such as `[email] = USERNAME()` on the `users` table.
3. **Register an Azure AD app** (App registrations → New) with the Power BI Service API's `Report.Read.All`/`Dataset.Read.All` application permissions, admin-consented, and a client secret.
4. Fill in `backend/.env`:
   ```
   POWERBI_TENANT_ID=...
   POWERBI_CLIENT_ID=...
   POWERBI_CLIENT_SECRET=...
   POWERBI_WORKSPACE_ID=...   # the workspace GUID
   POWERBI_REPORT_ID=...      # the published report's GUID
   ```
5. Restart the backend. The **Power BI Insights** tab (admin sidebar) and **Power BI** tab (employee portal) will light up automatically — `GET /api/powerbi/status` tells the frontend whether it's configured, so the app degrades gracefully (a "not connected yet" panel) until you set it up.

Admins get the unrestricted report; employees get an embed token scoped by their email via RLS, enforced by Power BI itself — not just hidden in the UI.

## 🏆 Analytics & Reporting

- **Performance scorecards** — every user gets a day/week/month toggleable scorecard (`Insights` tab) with total vs. target, % goal attainment, a trend arrow vs. the previous period, current streak, and best streak, plus a 14-day sparkline. Admins see the same scorecard for any employee from **Sheet Analytics** by selecting a user.
- **Team rollups** — a `manager_id` + `is_team_lead` model lets any user be promoted to a team lead; they get a **My Team** tab showing a rollup table (total / target / % goal / trend / streak) for their direct reports. Admins get the same view for the whole org under **Team Rollup**.
- **Automated report emails** — set `REPORTS_AUTO_EMAIL=true` and the SMTP_* vars in `backend/.env` to email each employee a weekly consolidated CSV report on a configurable cadence (`REPORTS_EMAIL_INTERVAL_HOURS`). Employees can opt out from their Profile tab. Audit-log CSV export is available from the Activity Feed page for compliance/retention purposes.

## 🔔 Product Features

- **In-app notifications** (bell icon, top-right of both portals) fire automatically for: Google Sheet sync failures, missed weekly targets (checked near the end of each week), goal-achieved milestones, and streak milestones every 5 consecutive days logged. Notifications persist in MySQL (`notifications` table) so they survive refreshes; email alerts are sent alongside them when SMTP is configured.
- **Team-lead permission tier** — beyond admin/employee, any employee can be flagged `is_team_lead` with a `manager_id` set on their reports (via the admin's User Details form), unlocking the team rollup view without granting full admin access.
- **Audit log export & retention** — `GET /api/dashboard/activity/export` streams a CSV of the activity log (optionally bounded by `?from=&to=`); see the comment in `backend/src/routes/dashboard.js` for a sample retention/purge query.

### New/changed API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/analytics/me/scorecard?period=day\|week\|month` | Employee | Own scorecard (streaks, trend, % goal) |
| GET | `/api/analytics/users/:id/scorecard` | Admin / team lead | Scorecard for one user |
| GET | `/api/analytics/team-rollup?period=` | Admin / team lead | Team-level rollup table |
| GET/PUT | `/api/notifications` | Authenticated | List / mark-read notifications |
| GET | `/api/notifications/unread-count` | Authenticated | Badge count |
| GET | `/api/powerbi/status` | Authenticated | Whether Power BI is configured |
| GET | `/api/powerbi/embed-token` | Authenticated | RLS-scoped embed token |
| GET | `/api/dashboard/activity/export` | Admin | Audit log CSV export |

## 🆕 Latest updates (v13)

- **Team Leader Portal — a third login, next to Admin and User.** The landing page now has an "⛁ Team Leader" option alongside Admin and User Login. Team leads are regular `users` rows (`is_team_lead=1`) — the admin creates or promotes them from **User Details** (new "Make this user a Team Lead" checkbox), then assigns other users to report to them via the new "Reports To (Team Lead)" dropdown on each user's form. Once logged in through the dedicated Team Leader login, a team lead lands on their own portal (`TeamLeadDashboard.js`) showing only the roster of users the admin assigned to them, with click-to-drill-down into any member's full scorecard and performance history.
- New endpoint: `POST /api/auth/teamlead/login` — authenticates against the same `users` table as the employee login, but requires `is_team_lead=1` and issues a distinct `role: teamlead` token.
- **Fixed a real bug found while building this**: `manager_id`/`is_team_lead`/streak fields were already stored in the database (added in v11) but were never actually returned by `GET /api/users` or `GET /api/users/:id` — so the admin UI had no way to read or set them. That's corrected now, end to end.

## 🆕 Previous updates (v12)

- **Individual performance history graph (admin panel)** — Admin → Individual Users → select a user now shows a "Performance History" area chart (7/30/90-day toggle) below the weekly snapshot, sourced from the same `daily_performance` data that a user's own manual "Update My Performance" entries (or their linked sheet sync) write into. Includes total, average-per-active-day, best day, and active-day-count stats. Backed by `GET /api/analytics/users/:id/performance-history`.

## 🆕 Previous updates (v11)

- **Enhanced "Project Entries" pie chart** (Admin → Dashboard) — hovering a day slice now grows/outlines it (`activeShape`) and the tooltip shows every tracked column's breakdown for that exact date (Market, Methodology, Project Status, Invoice Status), not just the record count. Powered by the new `GET /api/dashboard/week-day-breakdown` endpoint.
- **Consolidated report is now a clean Word document** (`.docx`) instead of CSV — branded title page, KPI summary tables, and formatted data tables per sheet (RFQ / Client / Project), built with the `docx` npm package (`backend/src/services/reportDocxGenerator.js`). The raw CSV is still available at `GET /api/reports/consolidated.csv` if you need to import the data into a spreadsheet.
- **Manual "Achieved" entry is now always available** on the employee Performance tab, whether or not a Google Sheet is linked — "✎ Update My Performance" opens a per-week editor (respects the WeekPicker) that writes straight into `daily_performance`, which also feeds the streak/scorecard/Power BI numbers. Sheet-synced "Project Entries" counts and self-reported "Achieved" are now clearly labeled as two separate metrics.
- **Fixed: newly added tasks not showing up** — the My Tasks tab previously seeded its list once from a stale snapshot taken at login, so tasks created earlier in the session could vanish if the tab remounted. It now always fetches the live list from `GET /api/me/tasks` on open, with visible loading/error states.


## 🆕 Latest changes

### Team Leader → open a team member's user portal
When an admin assigns a user to a team leader, the team leader can open that person's own portal (the same screen the user sees after logging in) from **Team Rollup → Open Portal** or from the member drill-down, and review / enter their details there. The backend issues a 6-hour token (`POST /api/auth/teamlead/view-as/:userId`) only for users whose `manager_id` is that team leader. Every open and every change is written to the activity log (`teamlead_open_user_portal`, `teamlead_edit_user_portal`).

### Admin → Sheet Analytics (RFQ Tracker, Client Database, Project Tracker)
* Opening a user (or All Users) automatically syncs their three Google Sheets first; adding/changing a sheet link also triggers a background sync.
* Each panel is always drawn for one concrete week: the picked week, or the nearest week that has data (with a notice and a "Go to that week" button).
* If a user has no rows at all in a sheet (no link, private sheet, empty sheet) the panel shows clearly labelled **sample data**; it is deleted automatically the moment real data syncs. Disable with `SAMPLE_DATA_FALLBACK=false`.
* Sync is now an exact mirror of the sheet (edited/deleted rows no longer linger or double count), and the CSV parser handles multi-line quoted cells.
* Fixed the week picker showing Sunday–Saturday in timezones ahead of UTC (e.g. India). `APP_TIMEZONE` (default `Asia/Kolkata`) decides what "today" is on the server.
* Chart endpoints are no longer admin-only; they are scoped so users see only themselves and team leaders only their team.

### Fixes verified against your three live Google Sheets
* **RFQ Tracker** ("RFQ MIS"): its date column is literally headed **"Start Date"**, which the sync did not previously recognise as a date column at all — every RFQ row was landing on the sync date instead of its real date. Fixed by adding "start date" as an accepted header alias.
* **Blank template rows**: Google Sheets export sometimes fills "empty" cells at the bottom of a sheet with invisible zero-width characters instead of leaving them truly blank. These defeated the blank-row check and were about to be stored as junk entries. Fixed by stripping invisible characters before parsing.
* **Ordinal dates** ("16th July 2020", "5th April 2021") in the Project Tracker's End Date column now parse correctly.
* **Ambiguous numeric cells**: real CPI/LOI/IR cells contain ranges and multi-value shorthand ("70,90", "400-550", "240/40", "8 10 2001") mixed with genuinely thousands-grouped totals ("2,35,560.00", Indian lakh format). The parser now treats commas as thousands-grouping only for money/count fields, and as a list separator (using the first value) for rate-like fields — and no longer mangles multi-token junk like "8 10 2001" into 8102001.

### Fixed: "Uncaught runtime errors" crash when syncing a sheet from Individual Users
The Individual Users page had one generic "Google Spreadsheet" field, but the backend treats that legacy field as a **Project Tracker** fallback link. Pasting the Client Database (or RFQ) link there made the sync correctly fail with "Could not find recognisable column headers…" — but the page didn't catch that failure, so it surfaced as an unhandled promise rejection and crashed the whole screen.
* Individual Users now has dedicated RFQ Tracker / Client Database / Project Tracker link fields (same as User Details), each synced independently, so the right link always goes to the right sync.
* Sync failures — from a mismatched link, a private sheet, or anything else — are now always caught and shown as an inline message instead of crashing the page. Fixed in both Individual Users and Master Sheet.
