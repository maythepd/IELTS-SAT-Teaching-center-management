import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { query, transaction, close } from '../database/db_connection.ts';
import { config } from '../config.ts';
import { unseal } from '../utils/security.ts';
import { queueMail } from '../services/mail.ts';
import { submitTest } from '../services/tests.ts';
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
});
async function emailJob() {
    const [job] = await query(`;WITH next_job AS(SELECT TOP 1 * FROM email_outbox WITH(UPDLOCK,READPAST,ROWLOCK,READCOMMITTEDLOCK) WHERE ((status IN ('PENDING','RETRY') AND next_attempt_at<=SYSUTCDATETIME()) OR (status='PROCESSING' AND lease_until<SYSUTCDATETIME())) AND attempts<5 ORDER BY email_id)
 UPDATE next_job SET status='PROCESSING',attempts=attempts+1,lease_until=DATEADD(minute,3,SYSUTCDATETIME()) OUTPUT INSERTED.*`);
  if (!job) return false;
  try {
    if (['VERIFY', 'RESET', 'LOGIN', 'CONSENT'].includes(job.kind)) {
      const tokenHash = job.dedupe_key.split(':').slice(1).join(':');
      const [valid] = await query('SELECT token_id FROM account_token WHERE token_hash=@hash AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()', {
        hash: tokenHash
      });
      if (!valid) {
        await query("UPDATE email_outbox SET status='BLOCKED',last_error='TOKEN_EXPIRED_OR_USED',lease_until=NULL WHERE email_id=@id", {
          id: job.email_id
        });
        return true;
      }
    }
    if (job.parent_id) {
      const [parent] = await query('SELECT email,consent FROM parent_contact WHERE parent_id=@id', {
        id: job.parent_id
      });
      if (!parent?.consent || parent.email !== job.recipient) {
        await query("UPDATE email_outbox SET status='BLOCKED',last_error='CONSENT_MISSING',lease_until=NULL WHERE email_id=@id", {
          id: job.email_id
        });
        return true;
      }
    }
    if (!process.env.SMTP_HOST) throw Object.assign(new Error('SMTP chưa được cấu hình'), {
      code: 'SMTP_NOT_CONFIGURED'
    });
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined,
      connectionTimeout: 20000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true
    });
    try {
      const result = await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: job.recipient,
        subject: job.subject,
        text: unseal(job.protected_payload).body,
        messageId: `<notification-${job.email_id}@${new URL(config.appUrl).hostname}>`
      });
      if (!result.accepted?.length) throw Object.assign(new Error('SMTP không chấp nhận người nhận'), {
        code: 'SMTP_REJECTED'
      });
      await query("UPDATE email_outbox SET status='SENT',sent_at=SYSUTCDATETIME(),provider_message_id=@message,lease_until=NULL,last_error=NULL WHERE email_id=@id", {
        id: job.email_id,
        message: String(result.messageId || '').slice(0, 300)
      });
    } finally {
      transport.close();
    }
  } catch (e) {
    const code = String(e.code || 'MAIL_ERROR').slice(0, 100);
    await query("UPDATE email_outbox SET status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE 'RETRY' END,last_error=@error,next_attempt_at=DATEADD(minute,5*attempts,SYSUTCDATETIME()),lease_until=NULL WHERE email_id=@id", {
      id: job.email_id,
      error: code
    });
    console.error(JSON.stringify({
      code,
      jobId: job.email_id
    }));
  }
  return true;
}
async function reminders() {
  await transaction(async tx => {
    const events = await query('SELECT TOP 20 * FROM schedule_event WITH(UPDLOCK,HOLDLOCK) WHERE reminder_queued=0 AND reminder_at<=SYSUTCDATETIME() AND ends_at>SYSUTCDATETIME() ORDER BY reminder_at', {}, tx);
    for (const e of events) {
      const users = await query(`SELECT DISTINCT a.account_id,a.email FROM account a WHERE a.status='ACTIVE' AND (a.account_id=@owner OR EXISTS(SELECT 1 FROM event_participant p WHERE p.event_id=@id AND p.account_id=a.account_id) OR EXISTS(SELECT 1 FROM student s JOIN enrollment n ON n.student_id=s.student_id WHERE s.account_id=a.account_id AND n.class_id=@class AND n.status='SUCCESS' AND NOT EXISTS(SELECT 1 FROM event_participant ep WHERE ep.event_id=@id)) OR EXISTS(SELECT 1 FROM teacher t JOIN class_teacher ct ON ct.teacher_id=t.teacher_id WHERE t.account_id=a.account_id AND ct.class_id=@class))`, {
        owner: e.owner_id,
        id: e.event_id,
        class: e.class_id
      }, tx);
      for (const u of users) await queueMail(u.email, 'Trung tâm học tập — Nhắc lịch', `${e.title}\nBắt đầu: ${new Date(e.starts_at).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh'
      })}\n${config.appUrl}`, `reminder:${e.event_id}:${new Date(e.starts_at).getTime()}:${u.account_id}`, 'REMINDER', null, tx);
      await query('UPDATE schedule_event SET reminder_queued=1 WHERE event_id=@id', {
        id: e.event_id
      }, tx);
    }
  });
}
async function expireTests() {
  const rows = await query("SELECT TOP 20 attempt_id,student_id FROM test_attempt WHERE status='IN_PROGRESS' AND deadline_at<SYSUTCDATETIME() ORDER BY deadline_at");
  for (const r of rows) await submitTest({
    role: 'STUDENT',
    student_id: r.student_id
  }, r.attempt_id);
}
async function backup() {
  const key = 'backup:' + new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  const claimed = await transaction(async tx => {
    const [old] = await query('SELECT * FROM maintenance_run WITH(UPDLOCK,HOLDLOCK) WHERE run_key=@key', {
      key
    }, tx);
    if (old) return false;
    await query("INSERT maintenance_run(run_key,status,details) VALUES(@key,'RUNNING','')", {
      key
    }, tx);
    return true;
  });
  if (!claimed) return;
  try {
    if (!process.env.BACKUP_DIRECTORY) throw new Error('BACKUP_DIRECTORY chưa cấu hình (đường dẫn trên máy SQL Server).');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(config.db.database)) throw new Error('DB_NAME không hợp lệ');
    const directory = process.env.BACKUP_DIRECTORY.replace(/[\\/]$/, '');
    const separator = directory.includes('\\') ? '\\' : '/';
    const file = directory + separator + config.db.database + '_' + key.slice(7) + '.bak';
    await query(`BACKUP DATABASE [${config.db.database}] TO DISK=@file WITH INIT,CHECKSUM`, {
      file
    });
    await query("UPDATE maintenance_run SET status='SUCCESS',details=@file WHERE run_key=@key", {
      key,
      file
    });
  } catch (e) {
    await query("UPDATE maintenance_run SET status='FAILED',details=@details WHERE run_key=@key", {
      key,
      details: String(e.message).slice(0, 1000)
    });
    console.error(JSON.stringify({
      code: 'BACKUP_FAILED',
      key
    }));
  }
}
async function backupFiles() {
  const key = 'files:' + new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  if ((await query('SELECT run_key FROM maintenance_run WHERE run_key=@key', {
    key
  })).length) return;
  await query("INSERT maintenance_run(run_key,status) VALUES(@key,'RUNNING')", {
    key
  });
  try {
    if (!process.env.FILE_BACKUP_DIRECTORY) throw new Error('FILE_BACKUP_DIRECTORY chưa cấu hình.');
    const target = path.resolve(process.env.FILE_BACKUP_DIRECTORY, key.slice(6));
    if (target === config.dataPath || target.startsWith(config.dataPath + path.sep)) throw new Error('Không backup vào trong thư mục file gốc.');
    await fs.mkdir(config.dataPath, {
      recursive: true
    });
    await fs.mkdir(path.dirname(target), {
      recursive: true
    });
    await fs.cp(config.dataPath, target, {
      recursive: true,
      force: false
    });
    await query("UPDATE maintenance_run SET status='SUCCESS',details=@target WHERE run_key=@key", {
      key,
      target
    });
  } catch (e) {
    await query("UPDATE maintenance_run SET status='FAILED',details=@details WHERE run_key=@key", {
      key,
      details: String(e.message).slice(0, 1000)
    });
    console.error(JSON.stringify({
      code: 'FILE_BACKUP_FAILED',
      key
    }));
  }
}
try {
  while (!stopping) {
    try {
      for (let count = 0; count < 20; count++) {
        if (!await emailJob()) break;
      }
      await reminders();
      await expireTests();
      await backup();
      await backupFiles();
    } catch (e) {
      console.error(JSON.stringify({
        code: 'WORKER_CYCLE',
        error: e.code || e.name,
        number: e.number,
        location: String(e.stack || '').split('\n').find(line => line.trim().startsWith('at '))
      }));
    }
    await delay(5000);
  }
} finally {
  await close();
}
