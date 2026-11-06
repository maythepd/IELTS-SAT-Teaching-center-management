'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setSession } from '../lib/api';
import { Form } from './ui';
export default function Auth({
  mode
}) {
  const router = useRouter(),
    [challenge, setChallenge] = useState(''),
    [message, setMessage] = useState(''),
    [token, setToken] = useState('');
  useEffect(() => setToken(new URLSearchParams(location.search).get('token') || ''), []);
  const login = async result => {
    if (result.mfa_required) {
      setChallenge(result.challenge);
      setMessage(result.message);
      return;
    }
    setSession(result.user);
    router.push('/' + result.user.role.toLowerCase());
  };
  const titles = {
    login: 'Chào mừng trở lại',
    register: 'Bắt đầu cùng Trung tâm học tập',
    'forgot-password': 'Quên mật khẩu',
    'reset-password': 'Đặt lại mật khẩu',
    'verify-email': 'Xác nhận email'
  };
  return <div className="auth-page"><div className="auth-story"><Link className="brand light" href="/courses">TRUNG TÂM<span>HỌC TẬP</span></Link><h1>Học tập có định hướng.<br />Tiến bộ mỗi ngày.</h1><p>Một không gian cho lớp học, bài tập, luyện thi và phản hồi từ giáo viên.</p><small>IELTS & SAT LEARNING CENTER</small></div><section className="auth-card"><p className="eyebrow">TÀI KHOẢN Trung tâm học tập</p><h1>{titles[mode]}</h1>{message && <p className="notice">{message}</p>}{mode === 'login' ? challenge ? <Form key="mfa" fields={[{
        name: 'code',
        label: 'Mã xác thực từ email',
        required: true
      }]} submit={b => api('/auth/login/verify', {
        method: 'POST',
        body: {
          ...b,
          challenge
        }
      })} label="Xác thực" onDone={login} /> : <Form fields={[{
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true
      }, {
        name: 'password',
        label: 'Mật khẩu',
        type: 'password',
        required: true
      }]} submit={b => api('/auth/login', {
        method: 'POST',
        body: b
      })} label="Đăng nhập" onDone={login} /> : mode === 'register' ? <Form fields={[{
        name: 'full_name',
        label: 'Họ tên',
        required: true
      }, {
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true
      }, {
        name: 'password',
        label: 'Mật khẩu (ít nhất 10 ký tự)',
        type: 'password',
        required: true
      }, {
        name: 'role',
        label: 'Loại tài khoản (nhân sự cần quản lý duyệt)',
        options: ['STUDENT', 'TEACHER', 'MANAGER'],
        required: true
      }]} submit={b => api('/auth/register', {
        method: 'POST',
        body: b
      })} label="Đăng ký" onDone={r => setMessage(r.message)} /> : mode === 'forgot-password' ? <Form fields={[{
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true
      }]} submit={b => api('/auth/forgot-password', {
        method: 'POST',
        body: b
      })} label="Gửi hướng dẫn" onDone={r => setMessage(r.message)} /> : mode === 'reset-password' ? <Form key={token} initial={{
        token
      }} fields={[{
        name: 'token',
        label: 'Mã trong liên kết',
        required: true
      }, {
        name: 'password',
        label: 'Mật khẩu mới',
        type: 'password',
        required: true
      }]} submit={b => api('/auth/reset-password', {
        method: 'POST',
        body: b
      })} onDone={r => setMessage(r.message)} /> : <Form key={token} initial={{
        token
      }} fields={[{
        name: 'token',
        label: 'Mã xác nhận',
        required: true
      }]} submit={b => api('/auth/verify-email', {
        method: 'POST',
        body: b
      })} label="Xác nhận" onDone={r => setMessage(r.message)} />}<div className="auth-links"><Link href="/login">Đăng nhập</Link><Link href="/register">Đăng ký</Link><Link href="/forgot-password">Quên mật khẩu</Link></div></section></div>;
}
