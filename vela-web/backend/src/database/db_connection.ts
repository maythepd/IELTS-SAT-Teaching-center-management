import { config } from '../config.ts';
// Both drivers use mssql's pool, parameter binding and transaction API.
export const sql = process.env.DB_AUTH === 'windows'
  ? (await import('mssql/msnodesqlv8.js')).default
  : (await import('mssql')).default;
let pending;
export async function pool() {
  if (!pending) {
    const p = new sql.ConnectionPool(config.db);
    p.on('error', e => console.error(JSON.stringify({
      level: 'error',
      code: 'DB_POOL',
      message: e.message
    })));
    pending = p.connect().catch(e => {
      pending = undefined;
      throw e;
    });
  }
  return pending;
}
export async function query(text, params = {}, tx = null) {
  const request = tx ? new sql.Request(tx) : (await pool()).request();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number' && (!Number.isInteger(value) || value > 2147483647 || value < -2147483648)) request.input(key, sql.Decimal(18, 4), value);else request.input(key, value === undefined ? null : value);
  }
  // ODBC pooled connections retain SET options after a transaction. Restore the
  // normal isolation for standalone queries; explicit transactions stay SERIALIZABLE.
  const result = await request.query(tx ? text : 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED;\n' + text);
  return result.recordset || [];
}
export async function transaction(work) {
  const tx = new sql.Transaction(await pool());
  let begun = false;
  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    begun = true;
    const value = await work(tx);
    await tx.commit();
    begun = false;
    return value;
  } catch (error) {
    if (begun) try {
      await tx.rollback();
    } catch (rollbackError) {
      console.error(JSON.stringify({
        level: 'error',
        code: 'ROLLBACK_FAILED',
        message: rollbackError.message
      }));
    }
    throw error;
  }
}
export async function close() {
  if (pending) await (await pending).close();
  pending = undefined;
}
