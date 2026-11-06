'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, money, when, localInput } from '../lib/api';
import { useData, Loading, PageTitle, Form, Action, Table, Badge, FileLink, Recorder, Upload, Tabs } from './ui';
export function Catalog({
  user
}) {
  const [search, setSearch] = useState(''),
    [program, setProgram] = useState('');
  const state = useData('/catalog/courses?keyword=' + encodeURIComponent(search)),
    router = useRouter();
  return <><PageTitle title="Tìm khóa học phù hợp" subtitle="Chọn chương trình, xem lớp đang mở và đăng ký học." /><div className="card inline"><input aria-label="Tìm khóa học" placeholder="Tìm theo tên khóa học…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Chương trình" value={program} onChange={e => setProgram(e.target.value)}><option value="">IELTS & SAT</option><option>IELTS</option><option>SAT</option></select></div>{!state.data ? <Loading {...state} /> : <div className="cards">{state.data.filter(c => !program || c.program === program).map(c => <div className="card" key={c.class_id}><span className="course-tag">{c.program} · {c.level}</span><h2>{c.name}</h2><p className="muted">{c.description}</p><p>Lớp {c.code} · {c.format}</p><div className="course-meta"><span>{when(c.starts_at)}</span><span>Mục tiêu {c.target_min}–{c.target_max}</span></div><p className="course-price">{money(c.tuition_amount)}</p><Action className="primary" work={() => user?.role === 'STUDENT' ? api('/student/enrollments', {
          method: 'POST',
          body: {
            class_id: c.class_id
          }
        }) : Promise.resolve(null)} onDone={r => router.push(r ? '/student/enrollments/' + r.enrollment_id : '/login')}>Đăng ký lớp</Action></div>)}</div>}</>;
}
export function Profile() {
  const state = useData('/auth/profile');
  if (!state.data) return <Loading {...state} />;
  return <><PageTitle title="Hồ sơ cá nhân" /><section className="card"><Form key={state.data.full_name + '-' + state.data.phone + '-' + state.data.date_of_birth} initial={{...state.data, date_of_birth: state.data.date_of_birth ? new Date(state.data.date_of_birth).toISOString().slice(0, 10) : ''}} fields={[{
        name: 'full_name',
        label: 'Họ tên',
        required: true
      }, ...(state.data.role !== 'MANAGER' ? [{name: 'phone', label: 'Số điện thoại', type: 'tel'}] : []), ...(state.data.role === 'STUDENT' ? [{name: 'date_of_birth', label: 'Ngày sinh', type: 'date'}] : [])]} submit={body => api('/auth/profile', {
        method: 'PATCH',
        body
      })} onDone={state.reload} /><p className="muted">{state.data.email} · {state.data.role}</p></section>{state.data.role === 'STUDENT' && <><section className="card"><h2>Liên hệ phụ huynh</h2><p className="muted">Phụ huynh xác nhận đồng ý qua liên kết gửi đến chính email của họ.</p><Form fields={[{
          name: 'name',
          label: 'Họ tên phụ huynh',
          required: true
        }, {
          name: 'email',
          label: 'Email phụ huynh',
          type: 'email',
          required: true
        }]} submit={body => api('/auth/parent-contact', {
          method: 'POST',
          body
        })} label="Gửi yêu cầu xác nhận" onDone={state.reload} /></section><section className="card"><Table rows={state.data.parents} columns={[{
          key: 'name',
          label: 'Họ tên'
        }, {
          key: 'email',
          label: 'Email'
        }, {
          key: 'consent',
          label: 'Nhận email',
          render: r => r.consent ? 'Đã đồng ý' : 'Chưa đồng ý'
        }, {
          key: 'actions',
          label: 'Thao tác',
          render: r => <Action work={() => api('/auth/parent-contact', {
            method: 'POST',
            body: {
              email: r.email,
              revoke: true
            }
          })} onDone={state.reload}>Thu hồi</Action>
        }]} /></section></>}</>;
}
export function ClassList({
  staff = false,
  base = '/student'
}) {
  const state = useData(staff ? '/teacher/classes' : '/student/classes');
  return <><PageTitle title={staff ? 'Lớp phụ trách' : 'Lớp học của tôi'} subtitle="Tài liệu, bài tập và học sinh theo từng lớp." />{!state.data ? <Loading {...state} /> : <div className="cards">{state.data.map(c => <div className="card" key={c.class_id}><span className="course-tag">{c.program} · {c.code}</span><h2>{c.course_name}</h2><p className="muted">{when(c.starts_at)} – {when(c.ends_at)}</p><Link className="primary" style={{
          display: 'inline-block',
          padding: '9px 16px',
          borderRadius: 6
        }} href={base + '/classes/' + c.class_id}>Mở lớp →</Link></div>)}{!state.data.length && <p className="empty">Chưa có lớp được cấp quyền truy cập.</p>}</div>}</>;
}
export function ClassDetail({
  id,
  staff = false,
  base = '/student'
}) {
  const prefix = staff ? '/teacher' : '/student',
    state = useData(prefix + '/classes/' + id),
    materials = useData(prefix + '/classes/' + id + '/materials'),
    assignments = useData(prefix + '/classes/' + id + '/assignments'),
    [tab, setTab] = useState('materials'),
    [edit, setEdit] = useState(null);
  if (!state.data) return <Loading {...state} />;
  const c = state.data;
  return <><PageTitle title={c.course_name + ' · ' + c.code} subtitle={c.format + ' · ' + when(c.starts_at)} /><nav className="tabs">{[['materials', 'Tài liệu'], ['assignments', 'Bài tập'], ...(staff ? [['students', 'Học sinh']] : [])].map(([key, label]) => <button key={key} onClick={() => {
        setTab(key);
        setEdit(null);
      }}>{label}</button>)}<Link href={base + '/tests'}>Luyện thi</Link></nav>{tab === 'materials' ? <><section className="card">{materials.data ? <Table rows={materials.data} columns={[{
          key: 'title',
          label: 'Tài liệu'
        }, {
          key: 'description',
          label: 'Mô tả'
        }, {
          key: 'resource',
          label: 'Truy cập',
          render: r => <div><FileLink id={r.file_id} />{r.external_url && <a href={r.external_url} target="_blank" rel="noreferrer">Liên kết ngoài</a>}</div>
        }, ...(staff ? [{
          key: 'edit',
          label: 'Sửa',
          render: r => <button onClick={() => setEdit(r)}>Chỉnh sửa</button>
        }] : [])]} /> : <Loading {...materials} />}</section>{staff && <section className="card"><h2>{edit ? 'Sửa tài liệu' : 'Thêm tài liệu'}</h2><Form key={edit?.material_id || 'new-material'} initial={edit || {}} fields={[{
          name: 'title',
          label: 'Tên tài liệu',
          required: true
        }, {
          name: 'external_url',
          label: 'Link tài liệu',
          type: 'url'
        }, {
          name: 'description',
          label: 'Nội dung / mô tả',
          type: 'textarea',
          wide: true
        }, {
          name: 'file_id',
          label: 'File tài liệu',
          type: 'file'
        }]} submit={body => api('/teacher/classes/' + id + '/materials' + (edit ? '/' + edit.material_id : ''), {
          method: edit ? 'PATCH' : 'POST',
          body
        })} onDone={() => {
          materials.reload();
          setEdit(null);
        }} />{edit && <button onClick={() => setEdit(null)}>Hủy sửa</button>}</section>}</> : tab === 'assignments' ? <><section className="card">{assignments.data ? <Table rows={assignments.data} columns={[{
          key: 'title',
          label: 'Bài tập'
        }, {
          key: 'task_type',
          label: 'Loại'
        }, {
          key: 'due_at',
          label: 'Hạn nộp',
          render: r => when(r.due_at)
        }, {
          key: 'status',
          label: 'Trạng thái',
          render: r => <Badge value={staff ? r.status : r.submission_status} />
        }, {
          key: 'actions',
          label: 'Thao tác',
          render: r => staff ? <div className="inline"><Link href={base + '/assignments/' + r.assignment_id + '/submissions'}>Bài nộp</Link><button onClick={() => setEdit(r)}>Sửa</button></div> : <Link href={'/student/assignments/' + r.assignment_id}>Mở bài tập</Link>
        }]} /> : <Loading {...assignments} />}</section>{staff && <AssignmentEditor key={edit?.assignment_id || 'new'} classId={id} initial={edit} onDone={() => {
        assignments.reload();
        setEdit(null);
      }} />}</> : <section className="card"><Table rows={c.students} columns={[{
        key: 'full_name',
        label: 'Học sinh'
      }, {
        key: 'email',
        label: 'Email'
      }, {
        key: 'progress',
        label: 'Học tập',
        render: r => <Link href={base + '/students/' + r.student_id + '/progress'}>Xem tiến độ →</Link>
      }]} /></section>}</>;
}
function AssignmentEditor({
  classId,
  initial,
  onDone
}) {
  const materials = useData('/teacher/classes/' + classId + '/materials');
  return <section className="card"><h2>{initial ? 'Sửa bài tập' : 'Giao bài tập'}</h2><Form initial={initial ? {
      ...initial,
      material_ids: JSON.parse(initial.materials_json || '[]').map(m => String(m.material_id)),
      due_at: localInput(initial.due_at)
    } : {
      task_type: 'IELTS_WRITING',
      metric_code: 'IELTS_WRITING',
      max_score: 9,
      status: 'PUBLISHED'
    }} fields={[{
      name: 'title',
      label: 'Tên bài tập',
      required: true
    }, {
      name: 'task_type',
      label: 'Loại bài',
      options: ['IELTS_WRITING', 'IELTS_SPEAKING', 'GENERAL'],
      required: true
    }, {
      name: 'instructions',
      label: 'Yêu cầu & tài liệu liên quan',
      type: 'textarea',
      wide: true,
      required: true
    }, {
      name: 'submission_format', label: 'Định dạng nộp bài',
      options: [{value:'ANY',label:'Nội dung, link hoặc file'}, {value:'TEXT',label:'Chỉ văn bản'}, {value:'LINK',label:'Chỉ liên kết'}, {value:'FILE',label:'File đính kèm'}, {value:'AUDIO',label:'Bản ghi âm (Speaking)'}],
      help: 'Bài Speaking phải chọn bản ghi âm. Để trống sẽ áp dụng mặc định theo loại bài.'
    }, {
      name: 'material_ids', label: 'Tài liệu kèm bài tập (giữ Ctrl để chọn nhiều)', multiple: true,
      options: (materials.data || []).map(m => ({value:m.material_id,label:m.title}))
    }, {
      name: 'criteria',
      label: 'Tiêu chí đánh giá',
      type: 'textarea',
      wide: true
    }, {
      name: 'metric_code',
      label: 'Chỉ số điểm',
      options: ['IELTS_WRITING', 'IELTS_SPEAKING', 'IELTS_READING', 'IELTS_LISTENING', 'SAT_MATH', 'SAT_RW', 'PERCENT'],
      required: true
    }, {
      name: 'max_score',
      label: 'Điểm tối đa (IELTS: 9; SAT section: 800)',
      type: 'number',
      required: true
    }, {
      name: 'due_at',
      label: 'Hạn nộp',
      type: 'datetime-local',
      required: true
    }, {
      name: 'status',
      label: 'Công bố',
      options: ['DRAFT', 'PUBLISHED'],
      required: true
    }]} submit={b => api('/teacher/classes/' + classId + '/assignments' + (initial ? '/' + initial.assignment_id : ''), {
      method: initial ? 'PATCH' : 'POST',
      body: {
        ...b,
        due_at: new Date(b.due_at).toISOString()
      }
    })} onDone={onDone} /></section>;
}
export function SubmissionPage({
  id
}) {
  const state = useData('/student/assignments/' + id),
    [file, setFile] = useState(null),
    [content, setContent] = useState(''),
    [url, setUrl] = useState('');
  if (!state.data) return <Loading {...state} />;
  const a = state.data;
  return <><PageTitle title={a.title} subtitle={'Hạn nộp: ' + when(a.due_at)} /><section className="card"><p>Định dạng nộp: {a.submission_format}</p><p style={{
        whiteSpace: 'pre-wrap'
      }}>{a.instructions}</p><p className="muted">Tiêu chí: {a.criteria || 'Theo hướng dẫn của giáo viên'}</p>{a.materials?.map(m => <div key={m.material_id}><strong>{m.title}</strong><p>{m.description}</p><FileLink id={m.file_id} />{m.external_url && <a href={m.external_url} target="_blank" rel="noreferrer">Mở tài liệu</a>}</div>)}</section><section className="card"><h2>Bài làm của bạn</h2>{a.submission_format !== 'LINK' && <><textarea aria-label="Nội dung bài làm" rows={12} placeholder="Nhập bài làm hoặc ghi chú…" value={content} onChange={e => setContent(e.target.value)} /><small>{content.trim() ? content.trim().split(/\s+/).length : 0} từ</small></>}{['ANY','LINK'].includes(a.submission_format) && <label>Liên kết bài làm<input type="url" value={url} onChange={e => setUrl(e.target.value)} /></label>}{['ANY','FILE','AUDIO'].includes(a.submission_format) && <Upload onUpload={setFile} />}{a.submission_format === 'AUDIO' && <Recorder onUpload={setFile} />}<FileLink id={file} /><Action className="primary" work={() => api('/student/assignments/' + id + '/submission', {
        method: 'POST',
        body: {
          text_content: content,
          external_url: url,
          file_id: file
        }
      })}>Xác nhận nộp bài</Action></section></>;
}
export function GradingList({
  id,
  base = '/teacher'
}) {
  const state = useData('/teacher/assignments/' + id + '/submissions');
  return <><PageTitle title="Bài nộp của học sinh" />{!state.data ? <Loading {...state} /> : <section className="card"><Table rows={state.data} columns={[{
        key: 'full_name',
        label: 'Học sinh'
      }, {
        key: 'submitted_at',
        label: 'Nộp lúc',
        render: r => when(r.submitted_at)
      }, {
        key: 'status',
        label: 'Trạng thái',
        render: r => <Badge value={r.status} />
      }, {
        key: 'score',
        label: 'Điểm'
      }, {
        key: 'action',
        label: 'Thao tác',
        render: r => <Link href={base + '/submissions/' + r.submission_id}>Chấm & phản hồi</Link>
      }]} /></section>}</>;
}
export function GradingPage({
  id
}) {
  const state = useData('/teacher/submissions/' + id);
  if (!state.data) return <Loading {...state} />;
  const s = state.data;
  return <><PageTitle title={s.title} subtitle={s.metric_code + ' · Điểm tối đa ' + s.max_score} /><section className="card"><p style={{
        whiteSpace: 'pre-wrap'
      }}>{s.text_content}</p><FileLink id={s.file_id} />{s.external_url && <p><a href={s.external_url} target="_blank" rel="noreferrer">Link bài làm</a></p>}</section><section className="card"><Form initial={s} fields={[{
        name: 'score',
        label: 'Điểm',
        type: 'number',
        min: 0,
        max: s.max_score,
        required: true
      }, {
        name: 'feedback',
        label: 'Phản hồi của giáo viên',
        type: 'textarea',
        wide: true,
        required: true
      }]} submit={body => api('/teacher/submissions/' + id + '/grade', {
        method: 'PUT',
        body
      })} label="Lưu điểm & phản hồi" onDone={state.reload} /></section></>;
}
export function Results() {
  const state = useData('/student/submissions');
  return <><PageTitle title="Kết quả bài tập" />{!state.data ? <Loading {...state} /> : <section className="card"><Table rows={state.data} columns={[{
        key: 'title',
        label: 'Bài tập'
      }, {
        key: 'metric_code',
        label: 'Chỉ số'
      }, {
        key: 'score',
        label: 'Điểm',
        render: r => r.score == null ? 'Chưa chấm' : r.score + '/' + r.max_score
      }, {
        key: 'feedback',
        label: 'Phản hồi'
      }, {
        key: 'status',
        label: 'Trạng thái',
        render: r => <Badge value={r.status} />
      }]} /></section>}</>;
}
