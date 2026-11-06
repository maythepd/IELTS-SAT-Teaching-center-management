import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(directory, '.env');
const server = process.argv[2] || 'localhost\\SQLEXPRESS';
if (!/^[\w.\\,:-]+$/.test(server)) throw new Error('Invalid SQL Server name. Example: localhost\\SQLEXPRESS');
try {
  let source = await fs.readFile(path.join(directory, '.env.example'), 'utf8');
  const values = {
    DB_AUTH: 'windows', DB_SERVER: server, DB_USER: '', DB_PASSWORD: '',
    DATA_KEY_HEX: randomBytes(32).toString('hex'),
    DEMO_PASSWORD: randomBytes(12).toString('hex')
  };
  for (const [name, value] of Object.entries(values)) source = source.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
  await fs.writeFile(filename, source, { flag: 'wx' });
  console.log('Created backend/.env with Windows Authentication and random local keys. Demo password is in DEMO_PASSWORD; not printed.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping existing backend/.env unchanged.');
}
