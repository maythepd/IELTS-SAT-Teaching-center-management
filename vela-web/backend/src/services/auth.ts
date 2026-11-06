import { randomInt } from 'node:crypto';
import { query, transaction } from '../database/db_connection.ts';
import { config } from '../config.ts';
import { token, hash, passwordHash, passwordMatches, seal, unseal, safeEqual } from '../utils/security.ts';
import { invalid, email, text } from '../utils/errors.ts';
import { queueMail } from './mail.ts';
export async function currentUser(rawToken, checkExpiry = true) {
  if (!rawToken) return null;
  const [u] = await query(`SELECT a.account_id,a.full_name,a.email,a.role,s.student_id,t.teacher_id,l.csrf_token
 FROM login_session l JOIN account a ON a.account_id=l.account_id
 LEFT JOIN student s ON s.account_id=a.account_id LEFT JOIN teacher t ON t.account_id=a.account_id
 WHERE l.token_hash=@token AND l.expires_at>SYSUTCDATETIME() AND a.status='ACTIVE'`, {
    token: hash(rawToken)
  });
  if (checkExpiry && u?.role === 'STUDENT') await checkStudentExpiry(u.student_id);
  return u || null;
}
async function checkStudentExpiry(id) {
  const [x] = await query(`SELECT MAX(c.ends_at) last_end,DATEADD(hour,-7,DATEADD(month,3,DATEADD(hour,7,MAX(c.ends_at)))) cutoff,MAX(CASE WHEN c.ends_at>=SYSUTCDATETIME() THEN 1 ELSE 0 END) has_live
 FROM enrollment e JOIN class_group c ON c.class_id=e.class_id WHERE e.student_id=@id AND e.status='SUCCESS'`, {
    id
  });
  if (x?.last_end && !x.has_live) {
    const cutoff = new Date(x.cutoff);
    if (new Date() > cutoff) invalid('ACCESS_EXPIRED', 'Đã hết thời hạn truy cập 3 tháng sau khóa cuối. Liên hệ quản lý.', 403);
  }
}
function validPassword(value) {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128) invalid('WEAK_PASSWORD', 'Mật khẩu cần từ 6 đến 128 ký tự.');
}
export async function issueToken(accountId, purpose, payload = null, minutes = 60, tx = null) {
  const raw = token();
  await query('INSERT account_token(account_id,token_hash,purpose,payload,expires_at) VALUES(@id,@hash,@purpose,@payload,DATEADD(minute,@minutes,SYSUTCDATETIME()))', {
    id: accountId,
    hash: hash(raw),
    purpose,
    payload: payload ? seal(payload) : null,
    minutes
  }, tx);
  return raw;
}
export async function register(body) {
  const e = email(body.email),
    name = text(body.full_name, 120),
    role = ['STUDENT', 'TEACHER', 'MANAGER'].includes(body.role) ? body.role : 'STUDENT';
  validPassword(body.password);
  if (!name) invalid('NAME_REQUIRED', 'Vui lòng nhập họ tên.');
  await transaction(async tx => {
    if ((await query('SELECT account_id FROM account WITH(UPDLOCK,HOLDLOCK) WHERE email=@e', {
      e
    }, tx)).length) invalid('EMAIL_EXISTS', 'Email đã được sử dụng.', 409);
    const [a] = await query("INSERT account(email,full_name,password_hash,role) OUTPUT INSERTED.account_id VALUES(@e,@name,@password,@role)", {
      e,
      name,
      role,
      password: passwordHash(body.password)
    }, tx);
    if (role === 'STUDENT') await query('INSERT student(account_id) VALUES(@id)', {
      id: a.account_id
    }, tx);
    if (role === 'TEACHER') await query('INSERT teacher(account_id) VALUES(@id)', {
      id: a.account_id
    }, tx);
    const raw = await issueToken(a.account_id, 'VERIFY', null, 1440, tx);
    await queueMail(e, 'Xác minh tài khoản Trung tâm học tập', `Mở liên kết: ${config.appUrl}/verify-email?token=${raw}`, `verify:${hash(raw)}`, 'VERIFY', null, tx);
  });
  return {
    message: 'Tài khoản đã tạo, email xác minh đang chờ gửi.'
  };
}
export async function verify(raw) {
  return transaction(async tx => {
    const [t] = await query("SELECT * FROM account_token WITH(UPDLOCK,HOLDLOCK) WHERE token_hash=@hash AND purpose IN ('VERIFY','PARENT_CONSENT') AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()", {
      hash: hash(raw)
    }, tx);
    if (!t) invalid('TOKEN_INVALID', 'Mã xác minh không hợp lệ hoặc hết hạn.');
    if (t.purpose === 'VERIFY') await query("UPDATE account SET email_verified_at=SYSUTCDATETIME(),status=CASE WHEN role='STUDENT' THEN 'ACTIVE' ELSE 'PENDING_APPROVAL' END WHERE account_id=@id AND status='PENDING_VERIFICATION'", {
      id: t.account_id
    }, tx);else {
      const payload = unseal(t.payload);
      await query('UPDATE parent_contact SET consent=1,consent_at=SYSUTCDATETIME() WHERE parent_id=@id', {
        id: payload.parentId
      }, tx);
    }
    await query('UPDATE account_token SET consumed_at=SYSUTCDATETIME() WHERE token_id=@id', {
      id: t.token_id
    }, tx);
    return {
      message: t.purpose === 'VERIFY' ? 'Đã xác minh email. Student có thể đăng nhập; tài khoản nhân sự cần Manager phê duyệt.' : 'Đã ghi nhận đồng ý nhận email của phụ huynh.'
    };
  });
}
export async function login(body) {
  const e = email(body.email);
  const [a] = await query('SELECT a.*,s.student_id FROM account a LEFT JOIN student s ON s.account_id=a.account_id WHERE email=@e', {
    e
  });
  if (!a || !passwordMatches(body.password, a.password_hash)) invalid('LOGIN_FAILED', 'Email hoặc mật khẩu không đúng.', 401);
  if (a.status !== 'ACTIVE') invalid('ACCOUNT_INACTIVE', 'Tài khoản chưa xác minh hoặc đã bị khóa.', 403);
  if (a.student_id) await checkStudentExpiry(a.student_id);
  if (!config.mfa) return newSession(a.account_id);
  const otp = String(randomInt(100000, 1000000));
  const raw = await transaction(async tx => {
    const challenge = await issueToken(a.account_id, 'LOGIN', {
      otpHash: hash(otp)
    }, 10, tx);
    await queueMail(e, 'Mã đăng nhập Trung tâm học tập', `Mã xác thực: ${otp}. Hết hạn sau 10 phút.`, `login:${hash(challenge)}`, 'LOGIN', null, tx);
    return challenge;
  });
  return {
    mfa_required: true,
    challenge: raw,
    message: 'Mã xác thực đang chờ gửi qua email. Kiểm tra hộp thư của bạn.'
  };
}
export async function finishLogin(body) {
  const result = await transaction(async tx => {
    const [t] = await query("SELECT t.* FROM account_token t WITH(UPDLOCK,HOLDLOCK) JOIN account a ON a.account_id=t.account_id WHERE token_hash=@h AND purpose='LOGIN' AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME() AND attempts<5 AND a.status='ACTIVE'", {
      h: hash(body.challenge)
    }, tx);
    if (!t) return {
      error: true
    };
    if (!safeEqual(unseal(t.payload).otpHash, hash(body.code))) {
      await query('UPDATE account_token SET attempts=attempts+1 WHERE token_id=@id', {
        id: t.token_id
      }, tx);
      return {
        error: true
      };
    }
    await query('UPDATE account_token SET consumed_at=SYSUTCDATETIME() WHERE token_id=@id', {
      id: t.token_id
    }, tx);
    return {
      id: t.account_id
    };
  });
  if (result.error) invalid('MFA_INVALID', 'Mã sai/hết hạn hoặc đã nhập quá nhiều lần.', 401);
  return newSession(result.id);
}
async function newSession(id) {
  const [a] = await query('SELECT a.*,s.student_id FROM account a LEFT JOIN student s ON s.account_id=a.account_id WHERE a.account_id=@id AND a.status=\'ACTIVE\'', {
    id
  });
  if (!a) invalid('ACCOUNT_INACTIVE', 'Tài khoản không hoạt động.', 403);
  if (a.student_id) await checkStudentExpiry(a.student_id);
  const raw = token(),
    csrf = token();
  await query('INSERT login_session(account_id,token_hash,csrf_token,expires_at) VALUES(@id,@hash,@csrf,DATEADD(hour,12,SYSUTCDATETIME()))', {
    id,
    hash: hash(raw),
    csrf
  });
  return {
    sessionToken: raw,
    user: await currentUser(raw)
  };
}
export async function forgot(body) {
  const e = email(body.email),
    [a] = await query("SELECT account_id FROM account WHERE email=@e AND status='ACTIVE'", {
      e
    });
  if (a) await transaction(async tx => {
    const raw = await issueToken(a.account_id, 'RESET', null, 30, tx);
    await queueMail(e, 'Đặt lại mật khẩu Trung tâm học tập', `${config.appUrl}/reset-password?token=${raw}`, `reset:${hash(raw)}`, 'RESET', null, tx);
  });
  return {
    message: 'Nếu email hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi.'
  };
}
export async function reset(body) {
  validPassword(body.password);
  await transaction(async tx => {
    const [t] = await query("SELECT * FROM account_token WITH(UPDLOCK,HOLDLOCK) WHERE token_hash=@h AND purpose='RESET' AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()", {
      h: hash(body.token)
    }, tx);
    if (!t) invalid('TOKEN_INVALID', 'Mã đặt lại mật khẩu không hợp lệ.');
    await query('UPDATE account SET password_hash=@p WHERE account_id=@id', {
      p: passwordHash(body.password),
      id: t.account_id
    }, tx);
    await query("UPDATE account_token SET consumed_at=SYSUTCDATETIME() WHERE account_id=@id AND purpose='RESET'", {
      id: t.account_id
    }, tx);
    await query('DELETE login_session WHERE account_id=@id', {
      id: t.account_id
    }, tx);
  });
  return {
    message: 'Mật khẩu đã được đổi. Vui lòng đăng nhập lại.'
  };
}
export async function profile(user, body = null) {
  if (body) {
    const name = text(body.full_name, 120);
    if (!name) invalid('NAME_REQUIRED', 'Vui lòng nhập tên.');
    let newEmail = null;
    if (body.email) {
      newEmail = email(body.email);
      const [existing] = await query('SELECT account_id FROM account WHERE email=@e AND account_id!=@id', {
        e: newEmail,
        id: user.account_id
      });
      if (existing) invalid('EMAIL_EXISTS', 'Email này đã được sử dụng bởi tài khoản khác.');
    }
    const phone = text(body.phone, 30);
    if (body.phone && (!/^[+\d() .-]{7,30}$/.test(body.phone) || !/\d/.test(body.phone))) invalid('PHONE_INVALID', 'Số điện thoại không hợp lệ.');
    const birth = body.date_of_birth || null;
    if (birth && (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !Number.isFinite(Date.parse(birth)) || new Date(birth).toISOString().slice(0, 10) !== birth || new Date(birth) > new Date())) invalid('BIRTH_DATE_INVALID', 'Ngày sinh không hợp lệ hoặc ở tương lai.');
    await transaction(async tx => {
      await query('UPDATE account SET full_name=@name, email=COALESCE(@email, email) WHERE account_id=@id', {
        name,
        email: newEmail,
        id: user.account_id
      }, tx);
      if (user.student_id) await query('UPDATE student SET phone=CASE WHEN @setPhone=1 THEN @phone ELSE phone END,date_of_birth=CASE WHEN @setBirth=1 THEN @birth ELSE date_of_birth END WHERE student_id=@id', {
        id: user.student_id, phone, birth, setPhone: Object.hasOwn(body, 'phone'), setBirth: Object.hasOwn(body, 'date_of_birth')
      }, tx);
      if (user.teacher_id && Object.hasOwn(body, 'phone')) await query('UPDATE teacher SET phone=@phone WHERE teacher_id=@id', { id: user.teacher_id, phone }, tx);
    });
  }
  const [a] = await query('SELECT a.account_id,a.full_name,a.email,a.role,COALESCE(s.phone,t.phone) phone,s.date_of_birth FROM account a LEFT JOIN student s ON s.account_id=a.account_id LEFT JOIN teacher t ON t.account_id=a.account_id WHERE a.account_id=@id', {
    id: user.account_id
  });
  return {
    ...a,
    parents: user.student_id ? await query('SELECT parent_id,name,email,consent,consent_at FROM parent_contact WHERE student_id=@id', {
      id: user.student_id
    }) : []
  };
}
export async function parentContact(user, body) {
  if (!user.student_id) invalid('STUDENT_ONLY', 'Chức năng dành cho Student.', 403);
  const e = email(body.email),
    name = text(body.name, 120);
  await transaction(async tx => {
    let [p] = await query('SELECT parent_id FROM parent_contact WITH(UPDLOCK,HOLDLOCK) WHERE student_id=@s AND email=@e', {
      s: user.student_id,
      e
    }, tx);
    if (!p) [p] = await query('INSERT parent_contact(student_id,name,email) OUTPUT INSERTED.parent_id VALUES(@s,@name,@e)', {
      s: user.student_id,
      name,
      e
    }, tx);
    if (body.revoke) {
      await query('UPDATE parent_contact SET consent=0,consent_at=NULL WHERE parent_id=@id', {
        id: p.parent_id
      }, tx);
      // Old confirmation links must not undo a later consent withdrawal.
      const pending = await query("SELECT token_id,payload FROM account_token WITH(UPDLOCK,HOLDLOCK) WHERE account_id=@account AND purpose='PARENT_CONSENT' AND consumed_at IS NULL", {
        account: user.account_id
      }, tx);
      for (const confirmation of pending) {
        if (unseal(confirmation.payload).parentId !== p.parent_id) continue;
        await query('UPDATE account_token SET consumed_at=SYSUTCDATETIME() WHERE token_id=@id', {
          id: confirmation.token_id
        }, tx);
      }
      return;
    }
    const raw = await issueToken(user.account_id, 'PARENT_CONSENT', {
      parentId: p.parent_id
    }, 10080, tx);
    await queueMail(e, 'Đồng ý nhận báo cáo học tập Trung tâm học tập', `Phụ huynh ${name}, nếu đồng ý nhận email về học tập của ${user.full_name}, mở liên kết: ${config.appUrl}/verify-email?token=${raw}. Nếu không đồng ý, không cần thực hiện.`, `parent:${hash(raw)}`, 'CONSENT', null, tx);
  });
  return {
    message: body.revoke ? 'Đã thu hồi đồng ý.' : 'Đã gửi yêu cầu xác nhận tới email phụ huynh.'
  };
}
