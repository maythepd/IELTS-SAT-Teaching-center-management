# Chạy và test trên Windows

Cần: Node.js 24 LTS x64, SQL Server Express đang chạy, Microsoft ODBC Driver 18 x64 và Internet lúc cài thư viện. Tài khoản Windows cần quyền tạo database. Kiểm thử Chrome cần Google Chrome.

## Cài và chạy

Giải nén, mở PowerShell tại `project\vela-web`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Setup-Local.ps1 -SqlServer ".\SQLEXPRESS"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Local.ps1 -WithoutEmailMfa
```

Thay `.\SQLEXPRESS` nếu instance SQL trên máy có tên khác. Script tự tạo cấu hình/khóa, cài thư viện, migrate, seed và build; không xóa dữ liệu cũ.

Mở **http://localhost:3000**. Giữ terminal mở; Ctrl+C để dừng. Những lần sau chỉ chạy lệnh Start-Local.

Tài khoản: `manager@example.test`, `teacher@example.test`, `student@example.test`. Mật khẩu chung: giá trị `DEMO_PASSWORD` trong `vela-web\backend\.env`.

## Chạy test

Mở terminal khác tại `project\vela-web`. Test nhanh: `npm.cmd test`.

Để chạy đầy đủ SQL/Chrome, giữ web ở localhost:3000 và chạy:

```powershell
Push-Location ..\test
npm.cmd ci
Pop-Location
$env:DB_NAME='TeachingCenter_test'
npm.cmd run db:migrate
$env:RUN_SQL_TESTS='1'
$env:RUN_BROWSER_TESTS='1'
Push-Location backend
node --env-file=.env --test ../../test/backend/*.test.ts
Pop-Location
Remove-Item Env:DB_NAME,Env:RUN_SQL_TESTS,Env:RUN_BROWSER_TESTS
```

Test dùng database riêng, không chạy nhiều bản test đồng thời. File/ảnh test nằm trong `test\artifacts`. Có thể chạy thêm `node browser.mjs` từ thư mục `test` để kiểm tra các trang bằng tài khoản mẫu.

Chế độ local bỏ OTP email; SMTP/SePay chưa cấu hình và QR chỉ là placeholder. Không đưa `.env`, database, node_modules hoặc file build lên GitHub.