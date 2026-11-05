'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, setSession } from '../lib/api';
const menus = {
  STUDENT: [['Tổng quan', '/student'], ['Khóa học', '/courses'], ['Lớp của tôi', '/student/classes'], ['Đăng ký & học phí', '/student/enrollments'], ['Kết quả bài tập', '/student/results'], ['Tiến độ học tập', '/student/progress'], ['Lịch học', '/student/schedule'], ['Luyện thi', '/student/tests'], ['Lịch sử thi', '/student/attempts']],
  TEACHER: [['Trang chủ', '/teacher'], ['Lớp phụ trách', '/teacher/classes'], ['Quản lý khóa học', '/teacher/courses'], ['Lịch dạy', '/teacher/schedule'], ['Đề luyện thi', '/teacher/tests'], ['Thu nhập', '/teacher/income']],
  MANAGER: [['Tổng quan', '/manager'], ['Tài khoản & quyền', '/manager/accounts'], ['Khóa học & lớp', '/manager/courses'], ['Ghi danh', '/manager/enrollments'], ['Học phí', '/manager/payments'], ['Bảng lương', '/manager/payroll'], ['Rate & bonus', '/manager/rates'], ['Lịch & buổi dạy', '/manager/schedule'], ['Đề luyện thi', '/manager/tests'], ['Trạng thái email', '/manager/emails'], ['Lịch sử thay đổi', '/manager/audit'], ['Sao lưu', '/manager/maintenance']]
};
export default function Shell({
  children,
  publicPage = false
}) {
  const [user, setUser] = useState(null),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const path = usePathname(),
    router = useRouter();
  useEffect(() => {
    let alive = true;
    api('/auth/me').then(u => {
      if (alive) {
        setUser(u);
        setSession(u);
        setLoaded(true);
      }
    }).catch(e => {
      if (!alive) return;
      if (e.status === 401) {
        setLoaded(true);
        if (!publicPage) router.replace('/login');
      } else {
        setError(e.message);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [publicPage, router]);
  useEffect(() => {
    const listener = e => setMessage(e.detail);
    window.addEventListener('app-notice', listener);
    return () => window.removeEventListener('app-notice', listener);
  }, []);
  if (!loaded) return <p className="loading-page">Đang kiểm tra phiên đăng nhập…</p>;
  if (error) return <div className="auth-card"><p className="error">{error}</p><button onClick={() => location.reload()}>Thử lại</button><Link href="/login">Đăng nhập</Link></div>;
  if (!user && !publicPage) return null;
  return <div className="workspace"><aside className="sidebar"><Link className="brand" href={user ? '/' + user.role.toLowerCase() : '/courses'}>TRUNG TÂM<span>HỌC TẬP</span></Link><p className="sidebar-label">KHÔNG GIAN HỌC TẬP</p><nav>{(menus[user?.role] || [['Khám phá khóa học', '/courses'], ['Đăng nhập', '/login'], ['Đăng ký', '/register']]).map(([label, href]) => <Link key={href} className={path === href ? 'active' : ''} href={href}>{label}</Link>)}{user && <Link href="/profile">Hồ sơ cá nhân</Link>}</nav>{user && <button className="logout" onClick={async () => {
        if (!confirm('Bạn muốn đăng xuất?')) return;
        try {
          await api('/auth/logout', {
            method: 'POST'
          });
          setSession(null);
          router.push('/login');
        } catch (e) {
          setMessage(e.message);
        }
      }}>Đăng xuất</button>}<div className="sidebar-foot">IELTS · SAT<br />Learn with purpose.</div></aside><div className="workspace-body"><header className="topbar"><span>Teaching & Learning Center</span><div><span className="role-tag">{user?.role || 'GUEST'}</span><strong>{user?.full_name || 'Khách'}</strong></div></header><main>{message && <div className="notice" role="status">{message}<button onClick={() => setMessage('')}>×</button></div>}{typeof children === 'function' ? children(user) : children}</main><footer>Trung tâm học tập · Quản lý giảng dạy và học tập</footer></div></div>;
}
