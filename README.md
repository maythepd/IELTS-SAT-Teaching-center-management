# IELTS & SAT Teaching Center Management

Hệ thống quản lý trung tâm giảng dạy IELTS & SAT.

## Chạy ứng dụng bằng Docker

Xem hướng dẫn chi tiết tại [vela-web/README.Docker.md](vela-web/README.Docker.md).

### Khởi chạy nhanh:
Chạy lệnh trực tiếp từ thư mục gốc:
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

Tài khoản test:
manager@example.test	DemoPassword@123	

teacher@example.test	DemoPassword@123

student@example.test	DemoPassword@123	
