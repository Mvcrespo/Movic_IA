import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";

export type AppUserRole = "admin" | "user";

type StoredUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
  role: AppUserRole;
  must_change_password: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

type StoredSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
};

export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: AppUserRole;
  mustChangePassword: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type CreateUserResult = {
  user: AppUser;
  temporaryPassword: string;
};

export type AuthenticationResult =
  | {
      status: "success";
      user: AppUser;
    }
  | {
      status: "inactive";
    }
  | {
      status: "invalid_credentials";
    };

type AuthOptions = {
  seedAdminEmail: string;
  seedAdminPassword: string;
};

const SESSION_COOKIE = "pulse_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function ensureAuthSchema(pool: Pool, options: AuthOptions): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_expires
    ON app_user_sessions (user_id, expires_at DESC)
  `);

  await pool.query(`DELETE FROM app_user_sessions WHERE expires_at <= NOW()`);

  await ensureSeedAdmin(pool, options);
}

export async function getCurrentUser(
  pool: Pool,
  request: IncomingMessage
): Promise<AppUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const result = await pool.query<StoredUserRow & StoredSessionRow>(
    `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.password_hash,
        u.role,
        u.must_change_password,
        u.active,
        u.created_at,
        u.updated_at,
        u.last_login_at,
        s.id as session_id,
        s.user_id,
        s.token_hash,
        s.expires_at
      FROM app_user_sessions s
      JOIN app_users u
        ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND u.active = TRUE
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return toAppUser(row);
}

export async function authenticateUser(
  pool: Pool,
  email: string,
  password: string
): Promise<AuthenticationResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query<StoredUserRow>(
    `
      SELECT *
      FROM app_users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const row = result.rows[0];
  if (!row) {
    return { status: "invalid_credentials" };
  }

  if (!verifyPassword(password, row.password_hash)) {
    return { status: "invalid_credentials" };
  }

  if (!row.active) {
    return { status: "inactive" };
  }

  await pool.query(
    `
      UPDATE app_users
      SET last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  );

  return {
    status: "success",
    user: {
      ...toAppUser(row),
      lastLoginAt: new Date().toISOString()
    }
  };
}

export async function createSession(pool: Pool, userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await pool.query(
    `
      INSERT INTO app_user_sessions (
        id,
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4)
    `,
    [randomUUID(), userId, tokenHash, expiresAt]
  );

  return rawToken;
}

export async function destroySession(pool: Pool, request: IncomingMessage): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return;
  }

  await pool.query(`DELETE FROM app_user_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export function setSessionCookie(response: ServerResponse, token: string): void {
  response.setHeader("Set-Cookie", buildCookieHeader(SESSION_COOKIE, token, SESSION_TTL_MS));
}

export function clearSessionCookie(response: ServerResponse): void {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export async function updatePassword(
  pool: Pool,
  userId: string,
  currentPassword: string,
  nextPassword: string
): Promise<void> {
  const result = await pool.query<StoredUserRow>(`SELECT * FROM app_users WHERE id = $1 LIMIT 1`, [
    userId
  ]);
  const row = result.rows[0];
  if (!row) {
    throw new Error("Conta não encontrada.");
  }

  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw new Error("A password atual está incorreta.");
  }

  await pool.query(
    `
      UPDATE app_users
      SET password_hash = $2,
          must_change_password = FALSE,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, hashPassword(nextPassword)]
  );
}

export async function createUser(
  pool: Pool,
  input: {
    email: string;
    displayName?: string | null;
    role: AppUserRole;
    temporaryPassword: string;
  }
): Promise<CreateUserResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedDisplayName = input.displayName?.trim() || null;

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM app_users WHERE email = $1 LIMIT 1`,
    [normalizedEmail]
  );
  if (existing.rows[0]?.id) {
    throw new Error("Já existe uma conta com esse email.");
  }

  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO app_users (
        id,
        email,
        display_name,
        password_hash,
        role,
        must_change_password,
        active
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
    `,
    [id, normalizedEmail, trimmedDisplayName, hashPassword(input.temporaryPassword), input.role]
  );

  const user = await getUserById(pool, id);
  if (!user) {
    throw new Error("Não foi possível criar a conta.");
  }

  return {
    user,
    temporaryPassword: input.temporaryPassword
  };
}

export async function listUsers(pool: Pool): Promise<AppUser[]> {
  const result = await pool.query<StoredUserRow>(
    `
      SELECT *
      FROM app_users
      ORDER BY
        CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
        email ASC
    `
  );

  return result.rows.map(toAppUser);
}

export async function getUserById(pool: Pool, userId: string): Promise<AppUser | null> {
  const result = await pool.query<StoredUserRow>(`SELECT * FROM app_users WHERE id = $1 LIMIT 1`, [
    userId
  ]);
  const row = result.rows[0];
  return row ? toAppUser(row) : null;
}

export async function countActiveAdmins(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM app_users
      WHERE role = 'admin'
        AND active = TRUE
    `
  );

  return Number(result.rows[0]?.count ?? "0");
}

export async function setUserActiveState(
  pool: Pool,
  userId: string,
  active: boolean
): Promise<void> {
  await pool.query(
    `
      UPDATE app_users
      SET active = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, active]
  );

  if (!active) {
    await pool.query(`DELETE FROM app_user_sessions WHERE user_id = $1`, [userId]);
  }
}

export async function deleteUserIdentity(pool: Pool, userId: string): Promise<void> {
  await pool.query(`DELETE FROM app_user_sessions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM app_users WHERE id = $1`, [userId]);
}

export function generateTemporaryPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let output = "";
  const bytes = randomBytes(length);
  for (let index = 0; index < length; index += 1) {
    output += alphabet[bytes[index] % alphabet.length];
  }
  return output;
}

async function ensureSeedAdmin(pool: Pool, options: AuthOptions): Promise<void> {
  const normalizedEmail = options.seedAdminEmail.trim().toLowerCase();
  const seedDisplayName = "Admin";
  const existing = await pool.query<StoredUserRow>(
    `SELECT * FROM app_users WHERE email = $1 LIMIT 1`,
    [normalizedEmail]
  );

  if (existing.rows[0]?.id) {
    await pool.query(
      `
        UPDATE app_users
        SET
          role = 'admin',
          active = TRUE,
          display_name = COALESCE(display_name, $2),
          updated_at = NOW()
        WHERE id = $1
      `,
      [existing.rows[0].id, seedDisplayName]
    );
    return;
  }

  await pool.query(
    `
      INSERT INTO app_users (
        id,
        email,
        display_name,
        password_hash,
        role,
        must_change_password,
        active
      )
      VALUES ($1, $2, $3, $4, 'admin', TRUE, TRUE)
    `,
    [
      randomUUID(),
      normalizedEmail,
      seedDisplayName,
      hashPassword(options.seedAdminPassword)
    ]
  );
}

function toAppUser(row: StoredUserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastLoginAt: row.last_login_at?.toISOString() ?? null
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildCookieHeader(name: string, value: string, ttlMs: number): string {
  const maxAge = Math.max(1, Math.floor(ttlMs / 1000));
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }

  const cookies = header.split(";").map((item) => item.trim());
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = scryptSync(password, salt, expected.length);

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}
