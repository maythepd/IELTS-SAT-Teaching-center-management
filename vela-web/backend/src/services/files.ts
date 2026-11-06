import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.ts';
import { query } from '../database/db_connection.ts';
import { encrypt, decrypt } from '../utils/security.ts';
import { invalid } from '../utils/errors.ts';
import { classAccess } from './access.ts';
const types = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
  'video/webm',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
export async function upload(user, file) {
  if (!file) invalid('FILE_REQUIRED', 'Chưa chọn file.');
  if (!types.has(file.mimetype)) invalid('FILE_TYPE', 'Loại file chưa được hỗ trợ.');
  const key = randomUUID() + '.enc';
  await fs.mkdir(config.dataPath, {
    recursive: true
  });
  const filename = path.join(config.dataPath, key);
  await fs.writeFile(filename, encrypt(file.buffer));
  try {
    const [f] = await query('INSERT file_asset(storage_key,original_name,mime_type,byte_size,uploaded_by) OUTPUT INSERTED.file_id VALUES(@key,@name,@mime,@size,@u)', {
      key,
      name: path.basename(file.originalname).slice(0, 200),
      mime: file.mimetype,
      size: file.size,
      u: user.account_id
    });
    return f;
  } catch (error) {
    try {
      await fs.unlink(filename);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        code: 'FILE_CLEANUP',
        key,
        message: cleanupError.code
      }));
    }
    throw error;
  }
}
export async function download(user, id) {
  const [f] = await query('SELECT * FROM file_asset WHERE file_id=@id', {
    id
  });
  if (!f) invalid('FILE_MISSING', 'Không có file.', 404);
  if (user.role !== 'MANAGER' && f.uploaded_by !== user.account_id) {
    const material = await query('SELECT class_id FROM course_material WHERE file_id=@id', {
        id
      }),
      submission = await query('SELECT a.class_id,s.student_id FROM assignment_submission s JOIN assignment a ON a.assignment_id=s.assignment_id WHERE s.file_id=@id', {
        id
      }),
      answer = await query('SELECT t.class_id,a.student_id FROM test_answer ans JOIN test_attempt a ON a.attempt_id=ans.attempt_id JOIN practice_test t ON t.test_id=a.test_id WHERE ans.file_id=@id', {
        id
      }),
      testMedia = await query('SELECT t.class_id FROM test_question q JOIN practice_test t ON t.test_id=q.test_id WHERE q.media_url LIKE @urlPattern', {
        urlPattern: '%/api/files/' + id
      });
    let allowed = false;
    for (const m of [...material, ...testMedia]) {
      try {
        await classAccess(user, m.class_id);
        allowed = true;
        break;
      } catch (e) {
        if (e.status !== 403) throw e;
      }
    }
    for (const s of [...submission, ...answer]) {
      if (user.role === 'STUDENT' && s.student_id === user.student_id) allowed = true;else if (user.role === 'TEACHER') {
        try {
          await classAccess(user, s.class_id);
          allowed = true;
        } catch (e) {
          if (e.status !== 403) throw e;
        }
      }
    }
    if (!allowed) invalid('FILE_FORBIDDEN', 'Không được tải file này.', 403);
  }
  return {
    ...f,
    buffer: decrypt(await fs.readFile(path.join(config.dataPath, f.storage_key)))
  };
}
