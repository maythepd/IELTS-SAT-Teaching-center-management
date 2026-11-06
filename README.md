# IELTS & SAT Teaching Center Management

Hệ thống quản lý trung tâm giảng dạy IELTS & SAT.

---

## 1. Chạy ứng dụng bằng Docker

Xem hướng dẫn chi tiết tại [vela-web/README.Docker.md](vela-web/README.Docker.md).

### Khởi chạy nhanh:
Chạy lệnh trực tiếp từ thư mục gốc của repository:
```bash
docker compose up -d --build
```

Hoặc di chuyển vào thư mục `vela-web`:
```bash
cd vela-web
docker compose up -d --build
```

- **Giao diện Web**: [http://localhost:3000](http://localhost:3000) 
- **Backend API**: [http://localhost:4000](http://localhost:4000)

Dừng dịch vụ:
```bash
docker compose down
```

---

## 2. Tài khoản Demo

- **Mật khẩu chung**: `abc@123` (hoặc cấu hình tùy ý qua biến `DEMO_PASSWORD`)
- **Quản lý**: `manager@example.test`
- **Giáo viên**: `teacher@example.test`
- **Học viên**: `student@example.test`

> **Lưu ý**: Trong môi trường Docker Compose mẫu, tính năng xác thực hai lớp qua email (`MFA_REQUIRED=false`) đã được cấu hình sẵn để đăng nhập trực tiếp mà không cần cài đặt máy chủ SMTP.
