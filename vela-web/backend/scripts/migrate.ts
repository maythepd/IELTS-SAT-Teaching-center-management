import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.ts';
import { sql, query, transaction, close } from '../src/database/db_connection.ts';
try {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(config.db.database)) throw new Error('Invalid DB_NAME');
  const admin = await new sql.ConnectionPool({
    ...config.db,
    database: 'master',
    ...(config.db.connectionString ? {
      connectionString: config.db.connectionString.replace(/Database=[^;]*;/i, 'Database=master;')
    } : {})
  }).connect();
  try {
    await admin.request().query(`IF DB_ID(N'${config.db.database}') IS NULL CREATE DATABASE [${config.db.database}]`);
  } finally {
    await admin.close();
  }
  await query('IF OBJECT_ID(\'schema_migration\') IS NULL CREATE TABLE schema_migration(name VARCHAR(200) PRIMARY KEY, applied_at DATETIME2 DEFAULT SYSUTCDATETIME())');
  const directory = path.resolve('../database/migrations');
  for (const name of (await fs.readdir(directory)).filter(x => x.endsWith('.sql')).sort()) {
    if ((await query('SELECT name FROM schema_migration WHERE name=@name', {
      name
    })).length) continue;
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    await transaction(async tx => {
      for (const batch of source.split(/^\s*GO\s*$/mi).filter(x => x.trim())) await query(batch, {}, tx);
      await query('INSERT schema_migration(name) VALUES(@name)', {
        name
      }, tx);
    });
    console.log('Applied', name);
  }
} catch (e) {
  console.error('Migration stopped:', e.message);
  process.exitCode = 1;
} finally {
  await close();
}
