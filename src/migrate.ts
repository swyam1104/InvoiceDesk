import { runMigrations, getDbPool } from './db.js';

async function main() {
  console.log('Running database migrations...');
  try {
    await runMigrations();
    console.log('Migrations executed successfully!');
    const pool = await getDbPool();
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();

