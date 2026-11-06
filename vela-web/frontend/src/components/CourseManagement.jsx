'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useData, Loading, PageTitle, Form, Table } from './ui';
import { api, when, money, localInput } from '../lib/api';

export default function CourseManagement({ user }) {
  const isManager = user?.role === 'MANAGER';
  const prefix = isManager ? '/manager' : '/teacher';
  const state = useData(prefix + '/courses');
  const accounts = useData(isManager ? '/manager/accounts' : null);
  const [courseForm, setCourseForm] = useState(null);
  const [classForm, setClassForm] = useState(null);
  const courses = [...new Map((state.data || []).map(row => [row.course_id, row])).values()];
  const done = () => { setCourseForm(null); setClassForm(null); state.reload(); };
  return <>
    <PageTitle
      title="Khóa học và lớp"
      subtitle={isManager ? "Tạo chương trình trước, sau đó mở các lớp với lịch và học phí riêng." : "Xem danh sách các khóa học và lớp học đang mở của trung tâm."}
    >
      {isManager && (
        <button className="primary" onClick={() => { setClassForm(null); setCourseForm({}); }}>Tạo khóa học</button>
      )}
    </PageTitle>
    {!state.data ? <Loading {...state} /> : <section className="card"><Table rows={courses} columns={[
      { key: 'name', label: 'Khóa học' }, { key: 'program', label: 'Chương trình' }, { key: 'level', label: 'Trình độ' },
      { key: 'actions', label: 'Thao tác', render: row => isManager ? <div className="inline">
        <button onClick={() => { setClassForm(null); setCourseForm(row); }}>Sửa khóa học</button>
        <button onClick={() => { setCourseForm(null); setClassForm({ course_id: row.course_id, course_name: row.name }); }}>Mở lớp mới</button>
      </div> : <span className="muted">Chỉ Quản lý được chỉnh sửa</span> }
    ]} /></section>}
    {isManager && courseForm && <section className="card"><h2>{courseForm.course_id ? 'Sửa khóa học' : 'Tạo khóa học'}</h2>
      <Form key={'course-' + (courseForm.course_id || 'new')} initial={{ program: 'IELTS', ...courseForm }} fields={[
        { name: 'name', label: 'Tên khóa học', required: true },
        { name: 'program', label: 'Chương trình', options: ['IELTS', 'SAT'], required: true },
        { name: 'level', label: 'Trình độ' },
        { name: 'target_min', label: 'Mục tiêu từ', type: 'number' },
        { name: 'target_max', label: 'Mục tiêu đến', type: 'number' },
        { name: 'description', label: 'Mô tả', type: 'textarea', wide: true }
      ]} submit={body => api('/manager/courses' + (courseForm.course_id ? '/' + courseForm.course_id : ''), {
        method: courseForm.course_id ? 'PATCH' : 'POST', body
      })} onDone={done} />
      <button onClick={() => setCourseForm(null)}>Hủy</button>
    </section>}
    <section className="card"><h2>Các lớp đã mở</h2>{!state.data ? <Loading {...state} /> : <Table rows={state.data.filter(row => row.class_id)} columns={[
      { key: 'name', label: 'Khóa học' }, { key: 'code', label: 'Mã lớp' },
      { key: 'starts_at', label: 'Bắt đầu', render: row => when(row.starts_at) },
      { key: 'tuition_amount', label: 'Học phí', render: row => money(row.tuition_amount) },
      { key: 'actions', label: 'Thao tác', render: row => <div className="inline">
        {isManager && <button onClick={() => { setCourseForm(null); setClassForm({ ...row, course_name: row.name }); }}>Sửa lớp / phân công</button>}
        <Link href={'/' + user.role.toLowerCase() + '/classes/' + row.class_id}>Mở lớp</Link>
      </div> }
    ]} />}</section>
    {isManager && classForm && <section className="card"><h2>{classForm.class_id ? 'Sửa lớp' : 'Mở lớp mới'} — {classForm.course_name}</h2>
      <Form key={'class-' + classForm.course_id + '-' + (classForm.class_id || 'new')} initial={{
        format: 'GROUP', ...classForm, starts_at: localInput(classForm.starts_at), ends_at: localInput(classForm.ends_at)
      }} fields={[
        { name: 'code', label: 'Mã lớp', required: true },
        { name: 'format', label: 'Hình thức', options: ['GROUP', 'INDIVIDUAL', 'SC'], required: true },
        { name: 'tuition_amount', label: 'Học phí VND', type: 'number', min: 1, step: 1, required: true },
        { name: 'starts_at', label: 'Bắt đầu', type: 'datetime-local', required: true },
        { name: 'ends_at', label: 'Kết thúc', type: 'datetime-local', required: true },
        ...(isManager ? [{ name: 'teacher_id', label: 'Giáo viên phụ trách', required: true,
          options: (accounts.data || []).filter(a => a.teacher_id && a.status === 'ACTIVE').map(a => ({ value: a.teacher_id, label: a.full_name })) }] : [])
      ]} submit={body => api('/manager/courses/' + classForm.course_id + '/classes' + (classForm.class_id ? '/' + classForm.class_id : ''), {
        method: classForm.class_id ? 'PATCH' : 'POST', body: {
          ...body, starts_at: new Date(body.starts_at).toISOString(), ends_at: new Date(body.ends_at).toISOString()
        }
      })} onDone={done} />
      <button onClick={() => setClassForm(null)}>Hủy</button>
    </section>}
  </>;
}
