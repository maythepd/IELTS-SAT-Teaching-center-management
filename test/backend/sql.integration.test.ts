import test from 'node:test';
const enabled = process.env.RUN_SQL_TESTS === '1';
test('SQL Server: migration schema and rollback are available', {
  skip: !enabled
}, async () => {
  if (!String(process.env.DB_NAME || '').toLowerCase().endsWith('_test')) throw new Error('RUN_SQL_TESTS requires a dedicated DB_NAME ending _test');
  const {
    query,
    transaction,
    close
  } = await import('../../vela-web/backend/src/database/db_connection.ts');
  try {
    const [table] = await query("SELECT COUNT(*) n FROM sys.tables WHERE name IN ('account','enrollment','payment_event','test_attempt','email_outbox')");
    if (table.n !== 5) throw new Error('Run migrations on the test database first');
    const label = 'ROLLBACK_TEST_' + Date.now();
    let failed = false;
    try {
      await transaction(async tx => {
        await query("INSERT audit_log(action,entity_type,summary) VALUES('TEST','test',@label)", {
          label
        }, tx);
        throw new Error('Intentional transaction failure');
      });
    } catch {
      failed = true;
    }
    const [rows] = await query('SELECT COUNT(*) n FROM audit_log WHERE summary=@label', {
      label
    });
    if (!failed || rows.n !== 0) throw new Error('Transaction rollback failed');
  } finally {
    await close();
  }
});
