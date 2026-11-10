// Database abstraction layer supporting PostgreSQL (via pg) and in-memory PostgreSQL (via pg-mem)
import pg from 'pg';
import { newDb, DataType } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;
const isLivePostgres = Boolean(databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')));

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ lastInsertId?: number; rowCount?: number }>;
}

let activePool: any = null;

export async function getDbPool(): Promise<any> {
  if (activePool) return activePool;

  if (isLivePostgres && databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
    activePool = pool;
    return activePool;
  } else {
    // In-memory PostgreSQL instance for local development / tests
    const memDb = newDb();
    
    // Disable strict AST coverage checks for CREATE TABLE statements
    (memDb as any).options = { ...((memDb as any).options || {}), astCoverage: false };
    
    // Register common functions that pg-mem might miss
    memDb.public.registerFunction({
      name: 'trim',
      args: [DataType.text],
      returns: DataType.text,
      implementation: (x: string) => (x ? x.trim() : ''),
    });

    const adapter = memDb.adapters.createPg();
    const pool = new adapter.Pool();
    activePool = pool;
    return activePool;
  }
}

export const db: DbClient = {
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pool = await getDbPool();
    const res = await pool.query(sql, params);
    return res.rows as T[];
  },

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const pool = await getDbPool();
    const res = await pool.query(sql, params);
    return (res.rows[0] as T) || null;
  },

  async execute(sql: string, params: any[] = []): Promise<{ lastInsertId?: number; rowCount?: number }> {
    const pool = await getDbPool();
    const res = await pool.query(sql, params);
    return {
      lastInsertId: res.rows?.[0]?.id ? Number(res.rows[0].id) : undefined,
      rowCount: res.rowCount ?? 0,
    };
  },
};

let migrationsRun = false;

// Run schema initialization / migrations
export async function runMigrations(): Promise<void> {
  if (migrationsRun) return;
  migrationsRun = true;

  const pool = await getDbPool();
  const initSqlPath = path.resolve(__dirname, '../migrations/001_init.sql');
  if (!fs.existsSync(initSqlPath)) {
    console.warn('Migration file not found at:', initSqlPath);
    return;
  }

  const rawSql = fs.readFileSync(initSqlPath, 'utf8');
  await pool.query(rawSql);
}
