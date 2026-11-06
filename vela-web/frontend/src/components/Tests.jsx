'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useData, Loading, PageTitle, Action, Table, Badge, Recorder, Upload, FileLink } from './ui';
import { api, when, notice } from '../lib/api';
export function Tests({
  staff = false,
  base = '/student'
}) {
  const state = useData((staff ? '/teacher' : '/student') + '/tests'),
    router = useRouter();
  return <><PageTitle title="IELTS / SAT Practice" subtitle="Luyện tập và thi thử trực tuyến theo nội dung của lớp.">{staff && <Link className="primary" style={{
        padding: 10,
        borderRadius: 6
      }} href={base + '/tests/new'}>Tạo đề</Link>}</PageTitle>{state.data ? <div className="cards">{state.data.map(t => <section className="card" key={t.test_id}><span className="course-tag">{t.program} · {t.class_code}</span><h2>{t.title}</h2><p className="muted">{t.description}</p><p>{t.duration_minutes} phút · <Badge value={t.status} /></p>{staff ? <Link href={base + '/tests/' + t.test_id}>Quản lý đề & kết quả →</Link> : <Action className="primary" work={() => api('/student/tests/' + t.test_id + '/start', {
          method: 'POST'
        })} onDone={r => router.push('/student/attempts/' + r.attempt_id)}>Bắt đầu / tiếp tục</Action>}</section>)}</div> : <Loading {...state} />}</>;
}
const blankQuestion = () => ({
  section_code: 'IELTS_READING',
  question_type: 'MCQ',
  prompt: '',
  options_json: '["A","B","C","D"]',
  answer_key: 'A',
  points: 1,
  media_url: ''
});
function parseOptions(value) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value || '[]');
  } catch {
    console.warn('Invalid stored question options; returning an empty list.');
    return [];
  }
}
export function TestEditor({
  id = null,
  base = '/teacher'
}) {
  const state = useData(id ? '/teacher/tests/' + id : null),
    classes = useData('/teacher/classes'),
    [values, setValues] = useState({
      title: '',
      program: 'IELTS',
      duration_minutes: 30,
      status: 'DRAFT',
      class_id: ''
    }),
    [questions, setQuestions] = useState([blankQuestion()]),
    [scales, setScales] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    router = useRouter();
  useEffect(() => {
    if (state.data) {
      setValues(state.data);
      setQuestions(state.data.questions);
      setScales(state.data.scales);
    }
  }, [state.data]);
  const change = (index, key, value) => setQuestions(all => all.map((q, i) => i === index ? {
    ...q,
    [key]: value
  } : q));
  if (id && !state.data) return <Loading {...state} />;
  return <><PageTitle title={id ? 'Quản lý đề luyện thi' : 'Tạo đề luyện thi'} /><form className="card" onSubmit={async e => {
      e.preventDefault();
      setError('');
      setBusy(true);
      try {
        const body = {
          ...values,
          questions: questions.map(q => ({
            ...q,
            options: parseOptions(q.options_json)
          })),
          scales
        };
        const r = await api('/teacher/classes/' + values.class_id + '/tests' + (id ? '/' + id : ''), {
          method: id ? 'PATCH' : 'POST',
          body
        });
        notice('Đã lưu đề.');
        router.push(base + '/tests/' + r.test_id);
        state.reload();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    }}><div className="form"><label>Tên đề<input required value={values.title} onChange={e => setValues(v => ({
            ...v,
            title: e.target.value
          }))} /></label><label>Lớp<select required value={values.class_id} onChange={e => setValues(v => ({
            ...v,
            class_id: e.target.value
          }))}><option value="">Chọn lớp…</option>{classes.data?.map(c => <option key={c.class_id} value={c.class_id}>{c.code}</option>)}</select></label><label>Chương trình<select value={values.program} onChange={e => setValues(v => ({
            ...v,
            program: e.target.value
          }))}><option>IELTS</option><option>SAT</option></select></label><label>Thời lượng phút<input required type="number" min="1" max="600" value={values.duration_minutes} onChange={e => setValues(v => ({
            ...v,
            duration_minutes: e.target.value
          }))} /></label><label>Trạng thái<select value={values.status} onChange={e => setValues(v => ({
            ...v,
            status: e.target.value
          }))}><option>DRAFT</option><option>PUBLISHED</option></select></label><label>Mô tả<textarea value={values.description || ''} onChange={e => setValues(v => ({
            ...v,
            description: e.target.value
          }))} /></label></div><h2 style={{
        marginTop: 25
      }}>Câu hỏi</h2>{questions.map((q, i) => <div className="question-editor" key={i}><div className="inline"><h3>Câu {i + 1}</h3><button type="button" onClick={() => setQuestions(all => all.filter((_, j) => i !== j))}>Xóa câu</button></div><div className="form"><label>Kỹ năng / section<input required value={q.section_code} placeholder="IELTS_READING, SAT_MATH…" onChange={e => change(i, 'section_code', e.target.value)} /></label><label>Loại câu<select value={q.question_type} onChange={e => change(i, 'question_type', e.target.value)}>{['MCQ', 'SHORT', 'WRITING', 'SPEAKING'].map(t => <option key={t}>{t}</option>)}</select></label><label className="wide">Nội dung<textarea required rows={5} value={q.prompt} onChange={e => change(i, 'prompt', e.target.value)} /></label>{q.question_type === 'MCQ' && <label className="wide">Các lựa chọn (mỗi dòng một lựa chọn)<textarea value={parseOptions(q.options_json).join('\n')} onChange={e => change(i, 'options_json', JSON.stringify(e.target.value.split('\n')))} /></label>}{['MCQ', 'SHORT'].includes(q.question_type) && <label>Đáp án đúng {q.question_type === 'MCQ' ? '(A/B/C/D…)' : '(so khớp không phân biệt hoa thường)'}<input required value={q.answer_key || ''} onChange={e => change(i, 'answer_key', e.target.value)} /></label>}<label>Điểm thô tối đa<input type="number" required min="0.1" step="0.1" value={q.points} onChange={e => change(i, 'points', e.target.value)} /></label><label>Link âm thanh / tài liệu (nếu có)<input type="url" value={q.media_url || ''} onChange={e => change(i, 'media_url', e.target.value)} /></label></div></div>)}<button type="button" onClick={() => setQuestions(q => [...q, blankQuestion()])}>+ Thêm câu hỏi</button><h2 style={{
        marginTop: 25
      }}>Bảng quy đổi của đề (nếu có)</h2><p className="muted">Không có bảng quy đổi: hệ thống chỉ công bố phần trăm điểm thô, không tự suy ra IELTS band hoặc SAT score. Mỗi dòng đặt ngưỡng điểm thô tối thiểu của một mức điểm.</p>{scales.map((s, i) => <div className="inline" key={i}>{[['section_code', 'Kỹ năng / section'], ['raw_points', 'Điểm thô từ'], ['scaled_score', 'Điểm quy đổi'], ['max_score', 'Thang tối đa']].map(([key, label]) => <label key={key}>{label}<input style={{
            width: 160
          }} value={s[key] ?? ''} onChange={e => setScales(all => all.map((r, j) => i === j ? {
            ...r,
            [key]: e.target.value
          } : r))} /></label>)}<button type="button" onClick={() => setScales(all => all.filter((_, j) => i !== j))}>Xóa mức</button></div>)}<button type="button" onClick={() => setScales(s => [...s, {
        section_code: 'IELTS_READING',
        raw_points: 0,
        scaled_score: 0,
        max_score: 9
      }])}>+ Thêm mức quy đổi</button>{error && <p className="error">{error}</p>}<div style={{
        marginTop: 25
      }}><button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu đề'}</button></div></form>{id && <AttemptList staff testId={id} base={base} />}</>;
}
export function AttemptList({
  staff = false,
  testId = null,
  base = '/student'
}) {
  const state = useData(staff ? '/teacher/tests/' + testId + '/attempts' : '/student/attempts');
  return <><PageTitle title="Lịch sử & kết quả làm bài" />{state.data ? <section className="card"><Table rows={state.data} columns={[{
        key: 'title',
        label: 'Đề'
      }, {
        key: 'full_name',
        label: 'Học sinh'
      }, {
        key: 'started_at',
        label: 'Bắt đầu',
        render: r => when(r.started_at)
      }, {
        key: 'status',
        label: 'Trạng thái',
        render: r => <Badge value={r.status} />
      }, {
        key: 'violation_count',
        label: 'Rời màn hình'
      }, {
        key: 'action',
        label: 'Chi tiết',
        render: r => <Link href={base + '/attempts/' + r.attempt_id}>{staff ? 'Xem / chấm bài' : 'Mở bài / kết quả'}</Link>
      }]} /></section> : <Loading {...state} />}</>;
}
export function Attempt({
  id,
  staff = false
}) {
  const state = useData((staff ? '/teacher' : '/student') + '/attempts/' + id),
    [answers, setAnswers] = useState({}),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(''),
    [manual, setManual] = useState({}),
    answersRef = useRef({}),
    busy = useRef(false),
    timerOffset = useRef(0);
  useEffect(() => {
    if (!state.data) return;
    timerOffset.current = new Date(state.data.server_time).getTime() - Date.now();
    const map = {};
    for (const a of state.data.answers) map[a.question_id] = {
      answer_text: a.answer_text || '',
      file_id: a.file_id
    };
    setAnswers(map);
    answersRef.current = map;
  }, [state.data]);
  const running = state.data?.status === 'IN_PROGRESS' && !staff;
  async function save() {
    await api('/student/attempts/' + id + '/answers', {
      method: 'PUT',
      body: {
        answers: Object.entries(answersRef.current).map(([question_id, a]) => ({
          question_id,
          ...a
        }))
      }
    });
  }
  async function finish() {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      try {
        await save();
      } catch (e) {
        if (e.code !== 'TEST_ENDED') throw e;
      }
      await api('/student/attempts/' + id + '/submit', {
        method: 'POST'
      });
      notice('Đã nộp bài.');
      state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
    }
  }
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 1000),
      autosave = setInterval(() => {
        if (!busy.current) save().catch(e => {
          if (e.code !== 'TEST_ENDED') setError('Chưa lưu được đáp án: ' + e.message);
        });
      }, 15000);
    const record = type => api('/student/attempts/' + id + '/violation', {
      method: 'POST',
      body: {
        event_type: type
      }
    }).catch(e => setError('Không ghi nhận được trạng thái kết nối: ' + e.message));
    const hidden = () => {
        if (document.hidden) record('TAB_HIDDEN');
      },
      blur = () => record('WINDOW_BLUR');
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur);
    return () => {
      clearInterval(interval);
      clearInterval(autosave);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur);
    };
  }, [running, id]);
  const remaining = state.data ? Math.max(0, Math.floor((new Date(state.data.deadline_at).getTime() - now - timerOffset.current) / 1000)) : 0;
  useEffect(() => {
    if (running && remaining === 0) finish();
  }, [remaining, running]);
  if (!state.data) return <Loading {...state} />;
  const attempt = state.data,
    questions = attempt.test.questions,
    setAnswer = (qid, patch) => setAnswers(old => {
      const next = {
        ...old,
        [qid]: {
          ...old[qid],
          ...patch
        }
      };
      answersRef.current = next;
      return next;
    });
  return <><PageTitle title={attempt.title} subtitle={staff ? 'Chấm bài & xem dấu hiệu rời màn hình' : 'Đáp án được tự lưu mỗi 15 giây. Thời hạn do server kiểm soát.'} />{running && <div className="exam-timer"><strong>Còn lại {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong><span><button onClick={() => save().then(() => notice('Đã lưu.')).catch(e => setError(e.message))}>Lưu ngay</button> <button onClick={finish}>Nộp bài</button></span></div>}{error && <p className="error">{error}</p>}<section className="card"><Badge value={attempt.status} />{staff && <p>Rời màn hình được ghi nhận: {attempt.violation_count}. Đây là tín hiệu cần xem xét, không tự kết luận gian lận.</p>}{questions.map((q, i) => {
        const answer = attempt.answers.find(a => a.question_id === q.question_id),
          value = answers[q.question_id] || {};
        return <div className="exam-question" key={q.question_id}><span className="course-tag">{q.section_code} · {q.points} điểm thô</span><h3>Câu {i + 1}</h3><p>{q.prompt}</p>{q.media_url && <p><a href={q.media_url} target="_blank" rel="noreferrer">Mở tư liệu câu hỏi</a></p>}{running ? q.question_type === 'MCQ' ? parseOptions(q.options_json).map((option, j) => {
            const letter = String.fromCharCode(65 + j);
            return <label className="option" key={letter}><input type="radio" name={'q' + q.question_id} checked={value.answer_text === letter} onChange={() => setAnswer(q.question_id, {
                answer_text: letter
              })} /><span>{letter}. {option}</span></label>;
          }) : q.question_type === 'SPEAKING' ? <><Recorder onUpload={file_id => setAnswer(q.question_id, {
              file_id
            })} /><Upload onUpload={file_id => setAnswer(q.question_id, {
              file_id
            })} /><FileLink id={value.file_id} /></> : <textarea rows={q.question_type === 'WRITING' ? 10 : 2} value={value.answer_text || ''} onChange={e => setAnswer(q.question_id, {
            answer_text: e.target.value
          })} /> : <><p><strong>Bài làm:</strong> {answer?.answer_text || '—'}</p><FileLink id={answer?.file_id} /><p>Điểm thô: {answer?.points_awarded ?? 'Chờ chấm'} / {q.points}</p>{answer?.feedback && <p>Feedback: {answer.feedback}</p>}{staff && ['WRITING', 'SPEAKING'].includes(q.question_type) && <div className="form"><label>Điểm<input type="number" min="0" max={q.points} step="0.5" value={manual[q.question_id]?.points_awarded ?? answer?.points_awarded ?? ''} onChange={e => setManual(m => ({
                  ...m,
                  [q.question_id]: {
                    ...m[q.question_id],
                    points_awarded: e.target.value
                  }
                }))} /></label><label>Feedback<textarea value={manual[q.question_id]?.feedback ?? answer?.feedback ?? ''} onChange={e => setManual(m => ({
                  ...m,
                  [q.question_id]: {
                    ...m[q.question_id],
                    feedback: e.target.value
                  }
                }))} /></label></div>}</>}</div>;
      })}{staff && attempt.status !== 'IN_PROGRESS' && <Action className="primary" work={() => api('/teacher/attempts/' + id + '/grade', {
        method: 'PUT',
        body: {
          answers: questions.filter(q => ['WRITING', 'SPEAKING'].includes(q.question_type)).map(q => ({
            question_id: q.question_id,
            points_awarded: manual[q.question_id]?.points_awarded ?? attempt.answers.find(a => a.question_id === q.question_id)?.points_awarded,
            feedback: manual[q.question_id]?.feedback ?? attempt.answers.find(a => a.question_id === q.question_id)?.feedback ?? ''
          }))
        }
      })} onDone={state.reload}>Lưu điểm & phản hồi</Action>}{!running && !staff && <Link href="/student/progress">Xem kết quả trong tiến độ học tập →</Link>}</section></>;
}
