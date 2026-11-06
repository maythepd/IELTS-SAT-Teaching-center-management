import { app } from './app.ts';
import { config } from './config.ts';
import { close } from './database/db_connection.ts';
if (!/^[a-f0-9]{64}$/i.test(config.key)) {
  console.error('Cần DATA_KEY_HEX: 64 ký tự hex tạo từ 32 byte ngẫu nhiên.');
  process.exitCode = 1;
} else {
  const server = app.listen(config.port, () => console.log(`Trung tâm học tập API listening on ${config.port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(async () => {
    await close();
    process.exitCode = 0;
  }));
}
