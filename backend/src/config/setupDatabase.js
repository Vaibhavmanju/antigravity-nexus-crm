/**
 * setupDatabase.js
 * Run once: node src/config/setupDatabase.js
 * Creates the nexus_crm database, all tables, seeds admin and demo users.
 */

process.env.TZ = 'UTC'; // same date semantics as the API server
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'Sridevisri089@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Sridevi@2026';

function toDateStr(d) { return d.toISOString().split('T')[0]; }

function weekOfYear(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

async function setup() {
  // Connect WITHOUT a database first so we can CREATE DATABASE
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  const DB = process.env.DB_NAME || 'nexus_crm';

  console.log(`\n🚀  Setting up Antigravity Nexus CRM Database...\n`);

  // ── 1. Database ──────────────────────────────────────────────
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB}\``);
  console.log(`✅  Database: ${DB}`);

  // ── 2. Admins ────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(100) NOT NULL DEFAULT 'Administrator',
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: admins`);

  // ── 3. Users (agents / employees) ───────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      name             VARCHAR(100) NOT NULL,
      email            VARCHAR(255) NOT NULL UNIQUE,
      password_hash    VARCHAR(255) NOT NULL,
      role             ENUM('Sales','Support','Marketing','Operations','HR') DEFAULT 'Sales',
      department       VARCHAR(100) DEFAULT 'Sales',
      phone            VARCHAR(30),
      status           ENUM('Active','Inactive') DEFAULT 'Active',
      join_date        DATE DEFAULT (CURDATE()),
      google_sheet_link TEXT,
      weekly_target    INT DEFAULT 500,
      achieved         INT DEFAULT 0,
      notes            TEXT,
      last_synced_at   DATETIME NULL,
      sync_status      ENUM('idle','syncing','success','error') DEFAULT 'idle',
      sync_error       VARCHAR(500) NULL,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: users`);

  // Migration safety net: add the new sync columns if this script runs
  // against a database created by an earlier version of this project.
  async function ensureColumn(table, column, definition) {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [DB, table, column]
    );
    if (rows[0].cnt === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
      console.log(`   ➕  Added column ${table}.${column}`);
    }
  }
  await ensureColumn('users', 'last_synced_at',     'last_synced_at DATETIME NULL');
  await ensureColumn('users', 'sync_status',         "sync_status ENUM('idle','syncing','success','error') DEFAULT 'idle'");
  await ensureColumn('users', 'sync_error',          'sync_error VARCHAR(500) NULL');
  await ensureColumn('users', 'rfq_sheet_link',      'rfq_sheet_link TEXT NULL');
  await ensureColumn('users', 'client_sheet_link',   'client_sheet_link TEXT NULL');
  await ensureColumn('users', 'project_sheet_link',  'project_sheet_link TEXT NULL');

  // Team-lead / manager permission tier + gamified streak tracking
  await ensureColumn('users', 'manager_id',             'manager_id INT NULL');
  await ensureColumn('users', 'is_team_lead',            'is_team_lead TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('users', 'current_streak',          'current_streak INT NOT NULL DEFAULT 0');
  await ensureColumn('users', 'best_streak',             'best_streak INT NOT NULL DEFAULT 0');
  await ensureColumn('users', 'last_streak_date',        'last_streak_date DATE NULL');
  await ensureColumn('users', 'email_reports_enabled',   'email_reports_enabled TINYINT(1) NOT NULL DEFAULT 1');

  // Helpful index for team rollups (ignore if it already exists)
  try {
    await conn.query(`CREATE INDEX idx_users_manager ON users (manager_id)`);
  } catch (e) { /* duplicate index — fine */ }

  // ── 4. Daily Performance ─────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS daily_performance (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      perf_date  DATE NOT NULL,
      value      DECIMAL(10,2) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_date (user_id, perf_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: daily_performance`);

  // ── 5. Tasks ─────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      title       VARCHAR(255) NOT NULL,
      description TEXT,
      status      ENUM('Pending','In Progress','Done') DEFAULT 'Pending',
      priority    ENUM('Low','Medium','High') DEFAULT 'Medium',
      due_date    DATE,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: tasks`);

  // ── 6. Activity Log ──────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      actor_type  ENUM('admin','user') NOT NULL,
      actor_id    INT NOT NULL,
      action      VARCHAR(255) NOT NULL,
      target_type VARCHAR(50),
      target_id   INT,
      meta        JSON,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: activity_log`);

  // ── 7. Master Sheet Config ───────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\`       VARCHAR(100) PRIMARY KEY,
      \`value\`     TEXT,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await conn.query(`INSERT IGNORE INTO settings (\`key\`, \`value\`) VALUES ('master_sheet_link', '')`);
  console.log(`✅  Table: settings`);

  // ── 7b. Notifications (missed targets, sync failures, digests) ─
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      type        ENUM('sync_error','missed_target','goal_achieved','streak','weekly_digest','system') DEFAULT 'system',
      severity    ENUM('info','warning','critical','success') DEFAULT 'info',
      title       VARCHAR(255) NOT NULL,
      message     TEXT,
      is_read     TINYINT(1) NOT NULL DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_notif_user_read (user_id, is_read)
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: notifications`);

  // ── 7c. Date dimension (for Power BI time-intelligence DAX) ────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS dim_date (
      date_key      DATE PRIMARY KEY,
      day_name      VARCHAR(10),
      day_of_week   TINYINT,
      day_of_month  TINYINT,
      week_of_year  TINYINT,
      week_start    DATE,
      week_end      DATE,
      month_num     TINYINT,
      month_name    VARCHAR(10),
      quarter       TINYINT,
      year          SMALLINT,
      is_weekend    TINYINT(1)
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: dim_date`);

  // Populate dim_date once, 2 years back to 1 year forward, if empty.
  const [[dimCount]] = await conn.query(`SELECT COUNT(*) AS cnt FROM dim_date`);
  if (dimCount.cnt === 0) {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    start.setMonth(0, 1);
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    end.setMonth(11, 31);

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rows = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      rows.push([
        toDateStr(d), dayNames[dow], dow, d.getDate(),
        weekOfYear(d), toDateStr(monday), toDateStr(sunday),
        d.getMonth() + 1, monthNames[d.getMonth()],
        Math.floor(d.getMonth() / 3) + 1, d.getFullYear(),
        (dow === 0 || dow === 6) ? 1 : 0,
      ]);
    }
    // Bulk insert in chunks
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await conn.query(
        `INSERT INTO dim_date (date_key, day_name, day_of_week, day_of_month, week_of_year, week_start, week_end, month_num, month_name, quarter, year, is_weekend) VALUES ?`,
        [chunk]
      );
    }
    console.log(`✅  Populated dim_date: ${rows.length} days (${toDateStr(start)} → ${toDateStr(end)})`);
  }

  // ── 8. RFQ Entries (Page 1 sheet) ───────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS rfq_entries (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      user_id            INT NOT NULL,
      sl_no              VARCHAR(50),
      subject            VARCHAR(500),
      entry_date         DATE,
      client_contact     VARCHAR(255),
      client_name        VARCHAR(255),
      designation        VARCHAR(255),
      email              VARCHAR(255),
      industry           VARCHAR(255),
      rfq_sent_by        VARCHAR(255),
      methodology        VARCHAR(255),
      target_audience    VARCHAR(255),
      market             VARCHAR(255),
      sample_size        DECIMAL(12,2),
      loi                DECIMAL(10,2),
      ir                 DECIMAL(10,4),
      cpi_usd            DECIMAL(12,2),
      additional_cost    DECIMAL(12,2),
      total_cost         DECIMAL(14,2),
      quota_sent_by      VARCHAR(255),
      follow_up          VARCHAR(255),
      comment            TEXT,
      row_hash           VARCHAR(64),
      synced_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_rfq_row (user_id, row_hash),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_rfq_date (entry_date),
      INDEX idx_rfq_user_date (user_id, entry_date)
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: rfq_entries`);

  // ── 9. Client Entries (Page 2 sheet) ────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS client_entries (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      user_id            INT NOT NULL,
      entry_date         DATE,
      company_name       VARCHAR(255),
      name               VARCHAR(255),
      email              VARCHAR(255),
      designation        VARCHAR(255),
      address            TEXT,
      phone              VARCHAR(100),
      intro_mail_sent    VARCHAR(255),
      follow_up_email    VARCHAR(255),
      comment            TEXT,
      row_hash           VARCHAR(64),
      synced_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_client_row (user_id, row_hash),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_client_date (entry_date),
      INDEX idx_client_user_date (user_id, entry_date)
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: client_entries`);

  // ── 8. Project Entries (from Google Sheet) ───────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_entries (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      user_id             INT NOT NULL,
      project_code        VARCHAR(100),
      project_name        VARCHAR(500),
      start_date          DATE,
      end_date            DATE,
      client_name         VARCHAR(255),
      client_contact_pm   VARCHAR(255),
      market              VARCHAR(255),
      target_audience     VARCHAR(255),
      methodology         VARCHAR(255),
      requested_n         DECIMAL(12,2),
      achieved_n          DECIMAL(12,2),
      loi                 DECIMAL(10,2),
      ir                  DECIMAL(10,4),
      cpi                 DECIMAL(12,2),
      additional_cost     DECIMAL(12,2),
      total               DECIMAL(14,2),
      project_status      VARCHAR(100),
      invoice_status      VARCHAR(100),
      comment             TEXT,
      project_expenses    DECIMAL(14,2),
      project_gross       DECIMAL(14,2),
      amount              DECIMAL(14,2),
      gross_margin        DECIMAL(14,4),
      project_manager     VARCHAR(255),
      row_hash            VARCHAR(64),
      synced_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_row (user_id, row_hash),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_start_date (start_date),
      INDEX idx_user_start (user_id, start_date)
    ) ENGINE=InnoDB
  `);
  console.log(`✅  Table: project_entries`);

  // ── 9. Seed Admin ────────────────────────────────────────────
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await conn.query(`
    INSERT INTO admins (name, email, password_hash)
    VALUES ('Sridevi', ?, ?)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
  `, [ADMIN_EMAIL, adminHash]);
  console.log(`✅  Admin seeded: ${ADMIN_EMAIL}`);

  // ── 10. Seed Demo Users ───────────────────────────────────────
  const demoUsers = [
    { name: 'Alice Johnson',  email: 'alice@example.com',  password: 'alice123',  role: 'Sales',     dept: 'Sales',     phone: '+1 555-0101', target: 1000, achieved: 787,  daily: [120, 145, 98, 160, 134, 175, 155] },
    { name: 'Bob Martinez',   email: 'bob@example.com',    password: 'bob123',    role: 'Support',   dept: 'Support',   phone: '+1 555-0102', target: 800,  achieved: 687,  daily: [80, 95, 110, 88, 102, 115, 97]  },
    { name: 'Carol White',    email: 'carol@example.com',  password: 'carol123',  role: 'Marketing', dept: 'Marketing', phone: '+1 555-0103', target: 600,  achieved: 540,  daily: [60, 75, 82, 70, 90, 85, 78]    },
    { name: 'David Chen',     email: 'david@example.com',  password: 'david123',  role: 'Sales',     dept: 'Sales',     phone: '+1 555-0104', target: 1100, achieved: 1066, daily: [140, 155, 130, 170, 148, 165, 158] },
  ];

  // Get Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);

  for (const u of demoUsers) {
    const hash = await bcrypt.hash(u.password, 12);
    const [result] = await conn.query(`
      INSERT INTO users (name, email, password_hash, role, department, phone, status, weekly_target, achieved)
      VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        weekly_target = VALUES(weekly_target),
        achieved = VALUES(achieved)
    `, [u.name, u.email, hash, u.role, u.dept, u.phone, u.target, u.achieved]);

    // Get user id
    const [[row]] = await conn.query('SELECT id FROM users WHERE email = ?', [u.email]);
    const userId = row.id;

    // Seed daily performance for this week
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      await conn.query(`
        INSERT INTO daily_performance (user_id, perf_date, value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [userId, dateStr, u.daily[i]]);
    }

    // Seed sample tasks
    await conn.query(`
      INSERT IGNORE INTO tasks (user_id, title, status, priority, due_date)
      VALUES
        (?, 'Complete weekly report', 'In Progress', 'High', DATE_ADD(CURDATE(), INTERVAL 2 DAY)),
        (?, 'Follow up with leads', 'Pending', 'Medium', DATE_ADD(CURDATE(), INTERVAL 1 DAY)),
        (?, 'Team standup notes', 'Done', 'Low', CURDATE())
    `, [userId, userId, userId]);

    console.log(`   👤  User seeded: ${u.name} (${u.email})`);
  }

  await conn.end();
  console.log(`\n🎉  Database setup complete!\n`);
  console.log(`    Admin Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`    Start backend: npm start`);
  console.log(`    Start frontend: cd ../frontend && npm start\n`);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
