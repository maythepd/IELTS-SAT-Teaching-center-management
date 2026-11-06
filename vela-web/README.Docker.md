# Docker Guide for Vela Web (`vela-web`)

Tài liệu hướng dẫn build và chạy Docker cho ứng dụng **Vela Web** (Hệ thống quản lý trung tâm IELTS & SAT).

---

## 1. Tổng quan kiến trúc Docker

Dự án `vela-web` là một npm workspace gồm:
- **Frontend**: Next.js 16 (React 19, Tailwind CSS) lắng nghe cổng `3000`. Next.js đóng vai trò cổng vào chính (Reverse Proxy `/api/*` tới Backend).
- **Backend API**: Express 5 chạy trực tiếp TypeScript trên Node 24 LTS, lắng nghe cổng `4000`.
- **Background Jobs Worker**: Tiến trình xử lý hàng đợi email, nhắc lịch, hết hạn bài test và sao lưu dữ liệu (`src/jobs/worker.ts`).
- **Database**: Microsoft SQL Server (yêu cầu database engine T-SQL).

Khi chạy container `vela-web`:
- `docker-entrypoint.sh` tự động:
  1. Kiểm tra / sinh khóa bảo mật `DATA_KEY_HEX` (64 ký tự hex) nếu chưa có.
  2. Tạo file `backend/.env` để đáp ứng cờ `--env-file=.env` của Node mà không làm ghi đè biến môi trường từ Docker.
  3. Đợi SQL Server sẵn sàng kết nối qua cổng TCP 1433.
  4. Chạy migration schema tự động (`npm run db:migrate -w backend`).
  5. Khởi tạo dữ liệu mẫu nếu database trống (`npm run db:seed -w backend -- --if-empty`).
  6. Khởi động đồng thời cả 3 tiến trình (API, Frontend, Jobs Worker) qua `concurrently`.

---

## 2. Cách chạy nhanh nhất với Docker Compose (Khuyến nghị)

Docker Compose sẽ tự động khởi tạo SQL Server 2022 và `vela-web`:

```bash
# Di chuyển vào thư mục vela-web
cd vela-web

# Build và khởi chạy các container
docker compose up -d --build
```

*(Hoặc chạy trực tiếp `docker compose up -d --build` từ thư mục gốc của repository).*

### Truy cập ứng dụng:
- **Giao diện Web**: [http://localhost:3000](http://localhost:3000)
- **API Trực tiếp**: [http://localhost:4000](http://localhost:4000)

### Tài khoản mẫu có sẵn (khi `AUTO_SEED=true`):
- **Quản lý**: `manager@example.test`
- **Giáo viên**: `teacher@example.test`
- **Học viên**: `student@example.test`
- **Mật khẩu chung**: `DemoPassword@123` *(hoặc giá trị cấu hình trong `DEMO_PASSWORD`)*

> **Lưu ý về MFA**: Trong môi trường Docker Compose mẫu, `MFA_REQUIRED=false` được bật sẵn để có thể đăng nhập ngay mà không cần cấu hình SMTP Server.

Dừng dịch vụ:
```bash
docker compose down
```

Xóa toàn bộ dữ liệu database để reset:
```bash
docker compose down -v
```

---

## 3. Build Docker Image độc lập

Để build image thủ công:

```bash
cd vela-web
docker build -t vela-web:latest .
```

### Chạy container riêng lẻ kết nối với SQL Server bên ngoài:

```bash
docker run -d \
  --name vela-web \
  -p 3000:3000 \
  -p 4000:4000 \
  -e DB_SERVER=host.docker.internal \
  -e DB_PORT=1433 \
  -e DB_NAME=TeachingCenter \
  -e DB_USER=sa \
  -e DB_PASSWORD="YourPassword123" \
  -e DB_AUTH=sql \
  -e DB_TRUST_SERVER_CERTIFICATE=true \
  -e MFA_REQUIRED=false \
  -e DEMO_PASSWORD="DemoPassword@123" \
  vela-web:latest
```

---

## 4. Bảng biến môi trường (Environment Variables)

| Biến | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `PORT` | `3000` | Cổng HTTP của Frontend Next.js |
| `BACKEND_PORT` | `4000` | Cổng HTTP của Backend Express API |
| `APP_URL` | `http://localhost:3000` | URL gốc của ứng dụng (dùng tạo link email) |
| `API_UPSTREAM` | `http://127.0.0.1:4000` | Địa chỉ backend mà Next.js proxy `/api/*` tới |
| `DB_SERVER` | `localhost` / `sqlserver` | Địa chỉ IP hoặc hostname của Microsoft SQL Server |
| `DB_PORT` | `1433` | Cổng SQL Server |
| `DB_NAME` | `TeachingCenter` | Tên database |
| `DB_USER` | `sa` | Tài khoản đăng nhập SQL Server |
| `DB_PASSWORD` | - | Mật khẩu tài khoản SQL Server |
| `DB_AUTH` | `sql` | Phương thức xác thực (`sql` cho Docker/Linux) |
| `DB_ENCRYPT` | `true` | Bật mã hóa kết nối TLS với database |
| `DB_TRUST_SERVER_CERTIFICATE` | `true` | Bỏ qua kiểm tra chứng chỉ tự ký của SQL Server trong Docker |
| `DATA_KEY_HEX` | *(Tự sinh nếu trống)* | Khóa hex 64 ký tự (32 bytes) dùng mã hóa dữ liệu nhạy cảm |
| `DEMO_PASSWORD` | `DemoPassword@123` | Mật khẩu cho các tài khoản seed demo ban đầu |
| `AUTO_MIGRATE` | `true` | Tự động chạy SQL migration khi container khởi động |
| `AUTO_SEED` | `true` | Tự động tạo dữ liệu mẫu nếu database còn trống |
| `MFA_REQUIRED` | `false` | Bật/tắt yêu cầu mã xác thực email khi đăng nhập |
| `SMTP_HOST` | - | Địa chỉ SMTP server gửi mail thật |
| `SMTP_PORT` | `587` | Cổng SMTP |
| `SMTP_USER` | - | Tài khoản SMTP |
| `SMTP_PASS` | - | Mật khẩu SMTP |
