import pg from 'pg';

const { Pool, types } = pg;

// node-postgres returns NUMERIC/DECIMAL columns (balance, available_balance,
// amount, ...) as strings by default, since they can exceed JS float
// precision. Our amounts fit safely in a double, and the frontend expects
// real numbers (it does arithmetic like `accounts.reduce((s,a) => s + a.balance, 0)`,
// which silently string-concatenates instead of summing if left as strings).
// OID 1700 = NUMERIC.
types.setTypeParser(1700, (val: string) => parseFloat(val));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected Postgres pool error', err);
});
