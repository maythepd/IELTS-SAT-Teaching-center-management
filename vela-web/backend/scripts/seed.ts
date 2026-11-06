import { query, transaction, close } from '../src/database/db_connection.ts';
import { passwordHash } from '../src/utils/security.ts';
try {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error('Đặt DEMO_PASSWORD >=10 ký tự trong .env.');
  if (process.env.NODE_ENV === 'production') throw new Error('Không seed demo trong production.');
  const existingDemo = process.argv.includes('--if-empty') && (await query("SELECT account_id FROM account WHERE email='manager@example.test'")).length > 0;
  if (existingDemo) {
    console.log('Demo already exists; keeping all existing data.');
  } else {
  await transaction(async tx => {
    if ((await query("SELECT account_id FROM account WHERE email='manager@example.test'", {}, tx)).length) throw new Error('Demo đã tồn tại; seed không ghi đè dữ liệu.');
    const people: Record<string, number> = {};
    for (const [name, role, e] of [['Quản lý Demo', 'MANAGER', 'manager@example.test'], ['Giáo viên Demo', 'TEACHER', 'teacher@example.test'], ['Học viên Demo', 'STUDENT', 'student@example.test']]) {
      const [a] = await query("INSERT account(email,full_name,password_hash,role,status) OUTPUT INSERTED.account_id VALUES(@e,@name,@p,@role,'ACTIVE')", {
        e,
        name,
        p: passwordHash(password),
        role
      }, tx);
      people[role] = a.account_id;
    }
    const [t] = await query('INSERT teacher(account_id) OUTPUT INSERTED.teacher_id VALUES(@id)', {
        id: people.TEACHER
      }, tx),
      [s] = await query('INSERT student(account_id) OUTPUT INSERTED.student_id VALUES(@id)', {
        id: people.STUDENT
      }, tx);
    const [course] = await query("INSERT course(name,program,level,description,target_min,target_max,created_by) OUTPUT INSERTED.course_id VALUES(N'IELTS Foundation','IELTS',N'Foundation',N'Dữ liệu demo để kiểm tra luồng. Không phải lớp/thanh toán thật.',5,6.5,@u)", {
      u: people.TEACHER
    }, tx);
    const [g] = await query("INSERT class_group(course_id,code,format,starts_at,ends_at,tuition_amount) OUTPUT INSERTED.class_id VALUES(@c,'DEMO-IELTS-01','GROUP',DATEADD(day,-7,SYSUTCDATETIME()),DATEADD(day,90,SYSUTCDATETIME()),2000000)", {
      c: course.course_id
    }, tx);
    await query('INSERT class_teacher(class_id,teacher_id) VALUES(@c,@t)', {
      c: g.class_id,
      t: t.teacher_id
    }, tx);
    await query("INSERT enrollment(student_id,class_id,status,payment_status,approved,approved_by,fee_snapshot,success_at) VALUES(@s,@c,'SUCCESS','PAID',1,@u,2000000,DATEADD(day,-7,SYSUTCDATETIME()))", {
      s: s.student_id,
      c: g.class_id,
      u: people.MANAGER
    }, tx);
    await query("INSERT audit_log(actor_id,action,entity_type,entity_id,summary) VALUES(@u,'DEMO_SEED','class',@c,N'Enrollment mẫu đã được cấp quyền để kiểm tra học tập; không đại diện giao dịch ngân hàng.')", {
      u: people.MANAGER,
      c: g.class_id
    }, tx);
    await query("INSERT teacher_rate(teacher_id,class_format,hourly_rate,valid_from) VALUES(@t,'GROUP',200000,'2020-01-01')", {
      t: t.teacher_id
    }, tx);
    await query("INSERT assignment(class_id,title,instructions,task_type,metric_code,max_score,due_at,created_by) VALUES(@c,N'Writing Task 2 — Education',N'Write at least 250 words about online education.','IELTS_WRITING','IELTS_WRITING',9,DATEADD(day,7,SYSUTCDATETIME()),@u)", {
      c: g.class_id,
      u: people.TEACHER
    }, tx);
    const [ev] = await query("INSERT schedule_event(owner_id,class_id,title,event_type,starts_at,ends_at) OUTPUT INSERTED.event_id VALUES(@u,@c,N'Buổi học demo','LESSON',DATEADD(hour,-2,SYSUTCDATETIME()),DATEADD(hour,-1,SYSUTCDATETIME()))", {
      u: people.TEACHER,
      c: g.class_id
    }, tx);
    await query('INSERT teaching_session(event_id,class_id,teacher_id) VALUES(@e,@c,@t)', {
      e: ev.event_id,
      c: g.class_id,
      t: t.teacher_id
    }, tx);
    const [test] = await query("INSERT practice_test(class_id,title,program,description,duration_minutes,status,created_by) OUTPUT INSERTED.test_id VALUES(@c,N'IELTS Reading — Mini practice','IELTS',N'Điểm phần trăm, không quy đổi band khi chưa có bảng quy đổi của đề.',10,'PUBLISHED',@u)", {
      c: g.class_id,
      u: people.TEACHER
    }, tx);
    await query("INSERT test_question(test_id,position,section_code,question_type,prompt,options_json,answer_key,points) VALUES(@t,1,'IELTS_READING','MCQ',N'Choose the synonym of important.','[\"Significant\",\"Tiny\",\"Late\",\"Rare\"]','A',1),(@t,2,'IELTS_READING','SHORT',N'Complete: She ___ a student.','[]','is',1)", {
      t: test.test_id
    }, tx);
  });
  console.log('Demo accounts created: manager@example.test, teacher@example.test, student@example.test. Password: DEMO_PASSWORD (not printed).');
  }
} catch (e) {
  console.error('Seed stopped:', e.message);
  process.exitCode = 1;
} finally {
  await close();
}
