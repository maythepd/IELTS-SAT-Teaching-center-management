'use client';

import { useState, useEffect } from 'react';

// Database roles & statuses translations
export const DB_TRANSLATIONS = {
  // Roles
  STUDENT: { vi: 'Học viên', en: 'Student' },
  TEACHER: { vi: 'Giáo viên', en: 'Teacher' },
  MANAGER: { vi: 'Quản lý', en: 'Manager' },
  GUEST: { vi: 'Khách', en: 'Guest' },

  // Statuses
  ACTIVE: { vi: 'Hoạt động', en: 'Active' },
  LOCKED: { vi: 'Đã khóa', en: 'Locked' },
  PENDING: { vi: 'Chờ duyệt', en: 'Pending' },
  PENDING_VERIFICATION: { vi: 'Chờ xác thực', en: 'Pending Verification' },
  PENDING_APPROVAL: { vi: 'Chờ duyệt', en: 'Pending Approval' },
  PENDING_PAYMENT: { vi: 'Chờ thanh toán', en: 'Pending Payment' },
  OPEN: { vi: 'Đang mở', en: 'Open' },
  PAID: { vi: 'Đã thanh toán', en: 'Paid' },
  UNPAID: { vi: 'Chưa thanh toán', en: 'Unpaid' },
  SUCCESS: { vi: 'Thành công', en: 'Success' },
  FAILED: { vi: 'Thất bại', en: 'Failed' },
  SUBMITTED: { vi: 'Đã nộp', en: 'Submitted' },
  GRADED: { vi: 'Đã chấm', en: 'Graded' },
  DRAFT: { vi: 'Bản nháp', en: 'Draft' },
  PUBLISHED: { vi: 'Đã phát hành', en: 'Published' },
  CLOSED: { vi: 'Đã đóng', en: 'Closed' },
  APPROVED: { vi: 'Đã duyệt', en: 'Approved' },
  REJECTED: { vi: 'Từ chối', en: 'Rejected' },
  LESSON: { vi: 'Buổi học', en: 'Lesson' },
  MOCK_TEST: { vi: 'Thi thử', en: 'Mock Test' },
  OFFICIAL_EXAM: { vi: 'Kỳ thi chính thức', en: 'Official Exam' },
  PERSONAL: { vi: 'Cá nhân', en: 'Personal' },
  PRESENT: { vi: 'Có mặt', en: 'Present' },
  ABSENT: { vi: 'Vắng mặt', en: 'Absent' },
  LATE: { vi: 'Đi muộn', en: 'Late' },
  EXCUSED: { vi: 'Có phép', en: 'Excused' },
  SENT: { vi: 'Đã gửi', en: 'Sent' }
};

// Key-based translations (backwards compatible)
export const I18N_KEYS = {
  menuOverview: { vi: 'Tổng quan', en: 'Dashboard' },
  menuHome: { vi: 'Trang chủ', en: 'Home' },
  menuCourses: { vi: 'Khóa học', en: 'Courses' },
  menuExploreCourses: { vi: 'Khám phá khóa học', en: 'Explore Courses' },
  menuMyClasses: { vi: 'Lớp của tôi', en: 'My Classes' },
  menuTeachingClasses: { vi: 'Lớp phụ trách', en: 'Assigned Classes' },
  menuEnrollments: { vi: 'Đăng ký & học phí', en: 'Enrollment & Tuition' },
  menuResults: { vi: 'Kết quả bài tập', en: 'Assignment Results' },
  menuProgress: { vi: 'Tiến độ học tập', en: 'Learning Progress' },
  menuSchedule: { vi: 'Lịch học', en: 'My Schedule' },
  menuTeachingSchedule: { vi: 'Lịch dạy', en: 'Teaching Schedule' },
  menuCenterSchedule: { vi: 'Lịch & buổi dạy', en: 'Center Schedule' },
  menuTests: { vi: 'Luyện thi', en: 'Practice Tests' },
  menuTestHistory: { vi: 'Lịch sử thi', en: 'Exam History' },
  menuIncome: { vi: 'Thu nhập', en: 'Income & Payroll' },
  menuAccounts: { vi: 'Tài khoản & quyền', en: 'Accounts & Permissions' },
  menuCoursesAndClasses: { vi: 'Khóa học & lớp', en: 'Courses & Classes' },
  menuManagerEnrollments: { vi: 'Ghi danh', en: 'Enrollments' },
  menuPayments: { vi: 'Học phí', en: 'Tuition Payments' },
  menuPayroll: { vi: 'Bảng lương', en: 'Payroll' },
  menuRates: { vi: 'Rate & bonus', en: 'Rates & Bonuses' },
  menuEmails: { vi: 'Trạng thái email', en: 'Outbox Emails' },
  menuAudit: { vi: 'Lịch sử thay đổi', en: 'Audit Log' },
  menuMaintenance: { vi: 'Sao lưu', en: 'Backups' },
  menuLogin: { vi: 'Đăng nhập', en: 'Log in' },
  menuRegister: { vi: 'Đăng ký', en: 'Register' },
  profile: { vi: 'Hồ sơ cá nhân', en: 'Profile' },
  logout: { vi: 'Đăng xuất', en: 'Log out' },
  logoutConfirm: { vi: 'Bạn muốn đăng xuất?', en: 'Do you want to log out?' },
  retry: { vi: 'Thử lại', en: 'Retry' },
  guest: { vi: 'Khách', en: 'Guest' },
  centerTitle: { vi: 'Trung tâm học tập · Quản lý giảng dạy và học tập', en: 'Teaching & Learning Center' },
  footerText: { vi: 'Trung tâm học tập · Nền tảng quản lý học tập & giảng dạy IELTS / SAT', en: 'Teaching Center · Academic & Learning Management Platform' },
  weekdays: {
    vi: ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  },
  prev: { vi: '← Trước', en: '← Prev' },
  next: { vi: 'Tiếp →', en: 'Next →' },
  today: { vi: 'Hôm nay', en: 'Today' },
  month: { vi: 'Tháng', en: 'Month' },
  week: { vi: 'Tuần', en: 'Week' },
  day: { vi: 'Ngày', en: 'Day' },
  addEvent: { vi: '+ Thêm lịch', en: '+ Add Event' }
};

// Vietnamese to English full dictionary
export const VN_TO_EN = {
  // Navigation & Brand
  'TRUNG TÂM': 'LEARNING',
  'HỌC TẬP': 'CENTER',
  'Tên trung tâm': 'Center Name',
  'Motto trung tâm': 'Center Motto',
  'text motto trung tâm': 'Center Motto',
  'TÀI KHOẢN': 'ACCOUNT',
  'Chào mừng trở lại': 'Welcome back',
  'Đăng ký tài khoản': 'Create an Account',
  'Quên mật khẩu': 'Forgot Password',
  'Đặt lại mật khẩu': 'Reset Password',
  'Xác nhận email': 'Verify Email',
  'Mã xác thực từ email': 'Verification code from email',
  'Mã xác thực': 'Verification code',
  'Xác thực': 'Verify',
  'Mật khẩu': 'Password',
  'Họ tên': 'Full name',
  'Mật khẩu (ít nhất 6 ký tự)': 'Password (at least 6 characters)',
  'Mật khẩu mới (ít nhất 6 ký tự)': 'New password (at least 6 characters)',
  'Mật khẩu cần ít nhất 6 ký tự.': 'Password must be at least 6 characters.',
  'Mật khẩu cần từ 6 đến 128 ký tự.': 'Password must be between 6 and 128 characters.',
  'Mật khẩu (ít nhất 10 ký tự)': 'Password (at least 10 characters)',
  'Loại tài khoản (cần quản lý duyệt)': 'Account type (Requires manager approval)',
  'Loại tài khoản (nhân sự cần quản lý duyệt)': 'Account type (Requires manager approval)',
  'Gửi hướng dẫn': 'Send Instructions',
  'Mã trong liên kết': 'Token from link',
  'Mật khẩu mới': 'New Password',
  'Quay lại': 'Back',
  '← Khám phá khóa học': '← Explore courses',
  'Mã xác nhận': 'Confirmation Code',
  'Xác nhận': 'Confirm',
  'Teaching & Learning Center': 'Teaching & Learning Center',
  'Trung tâm học tập · Quản lý giảng dạy và học tập': 'Learning Center · Academic Management',
  'Trung tâm học tập · Nền tảng quản lý học tập & giảng dạy IELTS / SAT': 'Teaching Center · Academic & Learning Management Platform',
  'KHÔNG GIAN HỌC TẬP': 'LEARNING SPACE',
  'TRUNG TÂM HỌC TẬP': 'LEARNING CENTER',
  'TÀI KHOẢN Trung tâm học tập': 'Learning Center Account',
  'Đang kiểm tra phiên đăng nhập…': 'Checking session…',
  'Đăng xuất': 'Log out',
  'Hồ sơ cá nhân': 'Profile',
  'Khách': 'Guest',
  'Bạn muốn đăng xuất?': 'Do you want to log out?',
  'Thử lại': 'Retry',

  // Roles
  'QUẢN LÝ': 'MANAGER',
  'GIÁO VIÊN': 'TEACHER',
  'HỌC VIÊN': 'STUDENT',
  'KHÁCH': 'GUEST',
  'Quản lý': 'Manager',
  'Giáo viên': 'Teacher',
  'Học viên': 'Student',

  // Menus
  'Tổng quan': 'Dashboard',
  'Trang chủ': 'Home',
  'Khóa học': 'Courses',
  'Khám phá khóa học': 'Explore Courses',
  'Lớp của tôi': 'My Classes',
  'Lớp phụ trách': 'Assigned Classes',
  'Đăng ký & học phí': 'Enrollment & Tuition',
  'Kết quả bài tập': 'Assignment Results',
  'Tiến độ học tập': 'Learning Progress',
  'Lịch học': 'My Schedule',
  'Lịch dạy': 'Teaching Schedule',
  'Lịch & buổi dạy': 'Center Schedule',
  'Luyện thi': 'Practice Tests',
  'Lịch sử thi': 'Exam History',
  'Thu nhập': 'Income & Payroll',
  'Tài khoản & quyền': 'Accounts & Permissions',
  'Khóa học & lớp': 'Courses & Classes',
  'Ghi danh': 'Enrollments',
  'Học phí': 'Tuition Payments',
  'Bảng lương': 'Payroll',
  'Rate & bonus': 'Rates & Bonuses',
  'Trạng thái email': 'Outbox Emails',
  'Lịch sử thay đổi': 'Audit Log',
  'Sao lưu': 'Backups',
  'Đăng nhập': 'Log in',
  'Đăng ký': 'Register',

  // Dashboard & Statistics
  'Tháng thống kê:': 'Month:',
  'Tháng thống kê': 'Month',
  'Kỳ thống kê:': 'Period:',
  'Kỳ thống kê': 'Period',
  'Bài chưa chấm': 'Ungraded Submissions',
  'Giờ dạy đã ghi nhận trong tháng': 'Recorded Teaching Hours',
  'Thu nhập ước tính': 'Estimated Income',
  'Từ buổi đã ghi nhận chưa bị từ chối và thưởng đã duyệt.': 'From recorded sessions and approved bonuses.',
  'Báo cáo sau buổi còn thiếu': 'Missing Post-Class Reports',
  'Có buổi thiếu đơn giá. Chưa thể tính đầy đủ thu nhập ước tính.': 'Some sessions lack hourly rate. Cannot compute estimated income.',
  'Lịch sắp tới trong 30 ngày': 'Upcoming Events (Next 30 Days)',
  'Bài nộp cần chấm': 'Submissions Needing Grading',
  'Báo cáo sau buổi cần bổ sung': 'Reports Needing Feedback',
  'Lớp đang truy cập': 'Active Classes',
  'Luyện thi trực tuyến →': 'Online Practice Tests →',
  'Làm bài và xem phản hồi.': 'Take tests and review feedback.',
  'Tiến độ theo kỹ năng →': 'Skill Progress →',
  'Kết quả và mục tiêu của bạn.': 'Your results and target scores.',
  'Lớp đang mở': 'Active Classes',
  'Doanh thu tháng': 'Monthly Revenue',
  'Ghi danh chờ duyệt': 'Pending Enrollments',
  'Buổi dạy chờ duyệt lương': 'Sessions Pending Approval',
  'Học viên trong hệ thống': 'Students enrolled',
  'Đang giảng dạy': 'Active teachers',
  'IELTS & SAT': 'IELTS & SAT',
  'Cần xác nhận học phí / duyệt': 'Needs payment / approval',
  'Giáo viên đã ghi nhận buổi': 'Teacher recorded session',
  'Lũy kế:': 'All-time total:',
  'Lũy kế': 'All-time total',
  'Ghi danh & Học phí cần xử lý': 'Enrollments & Tuition to Process',
  'Xem toàn bộ →': 'View all →',
  'Không có ghi danh nào đang chờ xử lý.': 'No pending enrollments.',
  'Xử lý ghi danh': 'Process enrollment',
  'Buổi dạy chờ duyệt chấm công & thù lao': 'Sessions Pending Attendance & Pay Approval',
  'Mở Bảng lương →': 'Open Payroll →',
  'Tất cả buổi dạy đã được duyệt hoặc chưa có buổi mới ghi nhận.': 'All sessions are approved or no new sessions recorded.',
  'Duyệt': 'Approve',
  'Từ chối': 'Reject',
  'Lịch học & Sự kiện trung tâm sắp diễn ra (14 ngày tới)': 'Upcoming Lessons & Center Events (Next 14 Days)',
  'Xem lịch chi tiết →': 'View detailed schedule →',
  'Không có sự kiện nào trong 14 ngày tới.': 'No events in the next 14 days.',
  'Kiểm tra ngay →': 'Check now →',
  'email hệ thống gặp lỗi hoặc đang chờ thử lại.': 'system emails failed or pending retry.',

  // Courses & Classes
  'Khóa học và lớp': 'Courses & Classes',
  'Tạo chương trình trước, sau đó mở các lớp với lịch và học phí riêng.': 'Create course programs, then open classes with schedules and tuition.',
  'Xem danh sách các khóa học và lớp học đang mở của trung tâm.': 'View course programs and open classes.',
  'Tạo khóa học': 'Create Course',
  'Sửa khóa học': 'Edit Course',
  'Mở lớp mới': 'Open New Class',
  'Sửa lớp / phân công': 'Edit Class / Assign',
  'Chỉ Quản lý được chỉnh sửa': 'Manager only',
  'Các lớp đã mở': 'Open Classes',
  'Chương trình': 'Program',
  'Trình độ': 'Level',
  'Mã lớp': 'Class Code',
  'Hình thức': 'Format',
  'Học phí': 'Tuition',
  'Học phí VND': 'Tuition (VND)',
  'Bắt đầu': 'Starts at',
  'Kết thúc': 'Ends at',
  'Giáo viên phụ trách': 'Assigned Teacher',
  'Thao tác': 'Actions',
  'Mở lớp': 'Open Class',
  'Mở lớp →': 'Open Class →',
  'Mục tiêu từ': 'Target Min',
  'Mục tiêu đến': 'Target Max',
  'Tên khóa học': 'Course Name',
  'Mô tả': 'Description',
  'Lớp học của tôi': 'My Classes',
  'Tài liệu, bài tập và học sinh theo từng lớp.': 'Materials, assignments and students per class.',
  'Chưa có lớp được cấp quyền truy cập.': 'No classes accessible.',
  'Thông tin lớp học': 'Class Information',
  'Thời gian học': 'Class Schedule',
  'Tài liệu học tập': 'Course Materials',
  'Thêm tài liệu': 'Add Material',
  'Thêm tài liệu mới': 'Add New Material',
  'Sửa tài liệu': 'Edit Material',
  'Đóng': 'Close',
  'Tên tài liệu': 'Material Title',
  'Link tài liệu ngoài (nếu có)': 'External Link (optional)',
  'Nội dung / mô tả': 'Description / Notes',
  'File tài liệu': 'Document File',
  'Tải file tài liệu (PDF, Word, MP3...)': 'Upload Document File (PDF, Word, MP3...)',
  'Chưa có tài liệu học tập nào trong lớp này.': 'No course materials uploaded yet.',
  'Truy cập': 'Access',
  'Liên kết ngoài': 'External Link',
  'Chỉnh sửa': 'Edit',
  'Hủy sửa': 'Cancel Edit',
  'Bài tập & Nhiệm vụ': 'Assignments & Tasks',
  'Giao bài tập mới': 'New Assignment',
  'Chưa có bài tập nào được giao cho lớp này.': 'No assignments assigned yet.',
  'Bài tập': 'Assignment',
  'Loại bài': 'Task Type',
  'Hạn nộp': 'Due Date',
  'Xem bài nộp': 'View Submissions',
  'Làm bài tập →': 'Submit Assignment →',
  'Danh sách học viên': 'Enrolled Students',
  'Tiến độ': 'Progress',
  'Xem tiến độ →': 'View progress →',
  'Đề luyện thi & Mock Tests của lớp →': 'Class Practice Tests & Mock Tests →',
  'Giao bài mới': 'Assign New Task',
  'Tên bài tập': 'Assignment Title',
  'Loại nhiệm vụ': 'Task Type',
  'Thang điểm tối đa': 'Max Score',
  'Hạn nộp bài': 'Due Date & Time',
  'Hướng dẫn làm bài': 'Instructions',
  'Tiêu chí chấm': 'Grading Criteria',
  'Chưa có tài liệu nào.': 'No materials uploaded yet.',
  'Chưa có bài tập nào.': 'No assignments created yet.',
  'Chưa có học viên nào trong lớp.': 'No students in this class yet.',
  'Tổng quan': 'Overview',
  'Tài liệu': 'Materials',
  'Học viên': 'Students',
  'Lớp': 'Class',

  // Profile
  'Quản lý thông tin tài khoản, họ tên, email và số điện thoại.': 'Manage account details, full name, email and phone number.',
  'Họ tên': 'Full Name',
  'Email': 'Email',
  'Số điện thoại': 'Phone Number',
  'Ngày sinh': 'Date of Birth',
  'Vai trò hệ thống:': 'System Role:',
  'Lưu': 'Save',
  'Đang lưu…': 'Saving…',
  'Liên hệ phụ huynh': 'Parent Contacts',
  'Phụ huynh xác nhận đồng ý qua liên kết gửi đến chính email của họ.': 'Parents confirm consent via a link sent to their email.',
  'Họ tên phụ huynh': 'Parent Name',
  'Email phụ huynh': 'Parent Email',
  'Gửi yêu cầu xác nhận': 'Send Confirmation Request',
  'Nhận email': 'Email Consent',
  'Đã đồng ý': 'Consented',
  'Chưa đồng ý': 'Not yet consented',
  'Thu hồi': 'Revoke',

  // Practice Tests & Exams
  'IELTS / SAT Practice': 'IELTS / SAT Practice',
  'Luyện tập và thi thử trực tuyến theo nội dung của lớp.': 'Practice and take mock tests online based on class curriculum.',
  'Tạo đề': 'Create Test',
  'Tạo đề luyện thi': 'Create Practice Test',
  'Quản lý đề luyện thi': 'Manage Practice Test',
  'Quản lý đề & kết quả →': 'Manage Test & Results →',
  'Bắt đầu / tiếp tục': 'Start / Continue',
  'Tên đề': 'Test Title',
  'Chọn lớp…': 'Select Class…',
  'Thời lượng phút': 'Duration (minutes)',
  'Câu hỏi': 'Questions',
  'Câu': 'Question',
  'Xóa câu': 'Delete Question',
  '+ Thêm câu hỏi': '+ Add Question',
  'Kỹ năng / section': 'Skill / Section',
  'Loại câu': 'Question Type',
  'Nội dung': 'Prompt / Content',
  'Các lựa chọn (mỗi dòng một lựa chọn)': 'Options (one per line)',
  'Đáp án đúng (A/B/C/D…)': 'Correct Answer (A/B/C/D…)',
  'Đáp án đúng (so khớp không phân biệt hoa thường)': 'Correct Answer (case-insensitive)',
  'Điểm thô tối đa': 'Max Raw Points',
  'Tệp đính kèm câu hỏi (PDF, Word, MP3) hoặc Link URL:': 'Attached Question File (PDF, Word, MP3) or URL:',
  'hoặc dán link:': 'or paste link:',
  '📄 Xem / Tải file đính kèm': '📄 View / Download attached file',
  'Xóa tệp': 'Remove file',
  'Bảng quy đổi của đề (nếu có)': 'Score Conversion Table (optional)',
  'Không có bảng quy đổi: hệ thống chỉ công bố phần trăm điểm thô, không tự suy ra IELTS band hoặc SAT score. Mỗi dòng đặt ngưỡng điểm thô tối thiểu của một mức điểm.': 'Without a scale: system reports raw percentage only. Each row defines minimum raw points for a score level.',
  'Điểm thô từ': 'Min Raw Points',
  'Điểm quy đổi': 'Scaled Score',
  'Thang tối đa': 'Scale Max',
  '+ Thêm mức quy đổi': '+ Add Scale Row',
  'Xóa mức': 'Delete Scale',
  'Lưu đề': 'Save Test',
  'Lịch sử & kết quả làm bài': 'Attempt History & Results',
  'Đề': 'Test',
  'Học sinh': 'Student',
  'Rời màn hình': 'Tab Switch / Blur',
  'Chi tiết': 'Details',
  'Xem / chấm bài': 'Review / Grade',
  'Mở bài / kết quả': 'Open Attempt / Results',
  'Chấm bài & xem dấu hiệu rời màn hình': 'Grading & integrity monitoring',
  'Đáp án được tự lưu mỗi 15 giây. Thời hạn do server kiểm soát.': 'Answers autosaved every 15s. Deadline controlled by server.',
  'Còn lại': 'Remaining',
  'Lưu ngay': 'Save Now',
  'Nộp bài': 'Submit Exam',
  'Rời màn hình được ghi nhận:': 'Screen switch detected:',
  'Đây là tín hiệu cần xem xét, không tự kết luận gian lận.': 'Review indicator, does not automatically conclude cheating.',
  '📎 Tệp / Tư liệu đính kèm:': '📎 Attached Material / Media:',
  '📥 Mở / Tải file đính kèm (PDF, Word, MP3)': '📥 Open / Download Attachment (PDF, Word, MP3)',
  'Bài làm:': 'Submission:',
  'Điểm thô:': 'Raw Points:',
  'Chờ chấm': 'Pending grading',

  // Calendar
  'Lịch dạy & sự kiện': 'Teaching Schedule & Events',
  'Lịch học của tôi': 'My Schedule',
  'Buổi học, hạn bài tập, mock test và kỳ thi chính thức.': 'Lessons, assignment deadlines, mock tests, and official exams.',
  'Thêm lịch': 'Add Event',
  '+ Thêm lịch': '+ Add Event',
  'Chỉnh sửa lịch': 'Edit Event',
  'Trước': 'Prev',
  '← Trước': '← Prev',
  'Tiếp': 'Next',
  'Tiếp →': 'Next →',
  'Hôm nay': 'Today',
  'Tháng': 'Month',
  'Tuần': 'Week',
  'Ngày': 'Day',
  'Kiểu lịch': 'Calendar View',
  'Sự kiện': 'Event',
  'Loại': 'Type',
  'Ghi nhận': 'Record status',
  'Ghi nhận buổi': 'Record Session',
  'Điểm danh / báo cáo': 'Attendance / Report',
  'Thời gian': 'Time',
  'Buổi / sự kiện': 'Session / Event',
  'Chưa ghi nhận': 'Not recorded',
  'Mở buổi dạy': 'Open Session',
  'Chấm & phản hồi': 'Grade & Feedback',
  'Viết báo cáo': 'Write Report',
  'Sửa báo cáo': 'Edit Report',
  'Điểm danh': 'Attendance',
  'Nhận xét sau buổi': 'Post-Class Feedback',
  'Thời lượng thực tế (phút)': 'Actual Duration (min)',

  // Common Buttons & Labels
  'Hủy': 'Cancel',
  'Sửa': 'Edit',
  'Xóa': 'Delete',
  'Thêm': 'Add',
  'Tạo': 'Create',
  'Xử lý': 'Process',
  'Trạng thái': 'Status',
  'Thời lượng': 'Duration',
  'phút': 'mins',
  'Tài liệu': 'Material',
  'Xem': 'View',
  'Xem lịch': 'View Schedule',
  'Tìm khóa học phù hợp': 'Find Suitable Courses',
  'Chọn chương trình, xem lớp đang mở và đăng ký học.': 'Choose a program, view open classes and enroll.',
  'Tìm theo tên khóa học…': 'Search by course name…',
  'Đăng ký lớp': 'Enroll in Class',

  // Management Pages
  'Tài khoản & quyền truy cập': 'Accounts & Permissions',
  'Thêm tài khoản': 'Add Account',
  'Sửa tài khoản': 'Edit Account',
  'Tạo tài khoản': 'Create Account',
  'Sửa hồ sơ': 'Edit Profile',
  'Quyền': 'Permissions',
  'Vai trò': 'Role',
  'Mật khẩu khởi tạo (ít nhất 10 ký tự)': 'Initial Password (at least 10 chars)',
  'Mật khẩu': 'Password',
  'Ghi danh khóa học': 'Course Enrollments',
  'Học sinh / Lớp': 'Student / Class',
  'Xét duyệt': 'Approval',
  'Xác nhận tiền mặt/CK': 'Confirm Cash/Bank Transfer',
  'Duyệt vào lớp': 'Approve into Class',
  'Học phí đã thu': 'Tuition Received',
  'Giao dịch học phí': 'Tuition Transactions',
  'Mã đối soát': 'Reference Code',
  'Số tiền': 'Amount',
  'Cổng / Phương thức': 'Provider / Method',
  'Ngày thanh toán': 'Payment Date',
  'Bảng tính thù lao giáo viên': 'Teacher Payroll Calculation',
  'Kỳ lương': 'Payroll Period',
  'Duyệt toàn bộ': 'Approve All',
  'Tổng giờ': 'Total Hours',
  'Thù lao giờ': 'Hourly Pay',
  'Thưởng': 'Bonus',
  'Tổng nhận': 'Total Net Pay',
  'Biểu phí & Đơn giá giảng dạy': 'Teaching Rates & Formulas',
  'Thêm đơn giá': 'Add Rate',
  'Đơn giá / giờ': 'Hourly Rate',
  'Hiệu lực từ': 'Effective From',
  'Đến ngày': 'Effective To',
  'Hàng đợi Email hệ thống': 'System Outbox Email Queue',
  'Người nhận': 'Recipient',
  'Số lần thử': 'Attempts',
  'Lỗi gần nhất': 'Last Error',
  'Thử lại ngay': 'Retry Now',
  'Nhật ký kiểm toán': 'Audit Log',
  'Thời điểm': 'Timestamp',
  'Tài khoản': 'Account',
  'Hành động': 'Action',
  'Đối tượng': 'Entity',
  'Tóm tắt': 'Summary',
  'Tiến trình sao lưu dữ liệu': 'Data Backup Runs',
  'Khóa tác vụ': 'Run Key',
  'Phê duyệt lương': 'Salary Approval',
  'Sự kiện / Tiết học': 'Event / Lesson',
  'Phụ trách': 'Teacher in charge',
  'Chung': 'General',
  'Buổi học': 'Session',
  'Thanh toán': 'Payment',
  'Duyệt lớp': 'Class Approval',
  'Chưa có dữ liệu.': 'No data.',
  'Đang tải dữ liệu…': 'Loading data…',
  'Đang xử lý…': 'Processing…',
  'Đã lưu.': 'Saved.',
  'Chọn…': 'Select…',

  // Payroll & Income tab
  'Buổi đã duyệt': 'Approved Sessions',
  'Tiền buổi đã duyệt': 'Approved Session Pay',
  'Bonus đã duyệt': 'Approved Bonus',
  'Tổng đã duyệt': 'Total Approved Pay',
  'Chi tiết buổi dạy': 'Teaching Session Details',
  'Khoản thưởng': 'Bonuses',
  'Buổi dạy': 'Session',
  'Ngày': 'Date',
  'Phút': 'Mins',
  'Rate/giờ': 'Hourly Rate',
  'Tiền buổi': 'Session Pay',
  'Lý do': 'Reason',
  'Số tiền': 'Amount',
  'Bảng lương giáo viên': 'Teacher Payroll',
  'Thu nhập của tôi': 'My Income',
  'Chỉ buổi được duyệt mới đóng góp vào số tiền được tính.': 'Only approved sessions contribute to computed pay.',
  'Có buổi chưa có rate. Chưa thể tính đầy đủ thu nhập cho các buổi đó.': 'Some sessions lack hourly rate. Cannot compute full income for those sessions.',
  'Lưu điểm danh & buổi dạy': 'Save Attendance & Session',
  'Mức độ tham gia': 'Participation Level',
  'Nhận xét kết quả học tập': 'Learning Feedback',
  'Khuyến nghị / bài cần luyện': 'Recommendations & Practice',
  'Lưu báo cáo & gửi email': 'Save Report & Send Email',
  'Báo cáo sau buổi học': 'Post-Class Report',
  'Email chỉ được gửi cho liên hệ phụ huynh đã xác nhận đồng ý.': 'Emails are only sent to parent contacts who consented.',
  'Quyền thao tác': 'Action Permissions',
  'Các quyền này không mở quyền đọc lớp/hồ sơ ngoài phạm vi được phân công.': 'These permissions do not grant access beyond assigned scope.',
  'Tạo / sửa course': 'Create / edit courses',
  'Quản lý tài liệu và bài tập': 'Manage materials and tasks',
  'Chấm bài': 'Grade assignments',
  'Đặt mục tiêu': 'Set target scores',
  'Quản lý lịch của mình': 'Manage own schedule',
  'Báo cáo phụ huynh': 'Parent reports',
  'Quản lý đề thi': 'Manage tests',
  'Lưu quyền': 'Save Permissions',
  'Xác nhận tiền': 'Confirm Payment',
  'Số tiền đã nhận': 'Amount Received',
  'Nội dung xác nhận': 'Confirmation Notes',
  'Xác nhận đã thực nhận': 'Confirm Received',
  'Xác nhận đã nhận tiền': 'Confirm received payment',
  'Nội dung thanh toán': 'Payment Reference',
  'Kênh': 'Provider',
  'Xem giao dịch': 'View Transaction',
  'Giao dịch': 'Transaction',
  'Mã phía ngân hàng:': 'Bank transaction code:',
  'Tạo lúc:': 'Created at:',
  'Nhận lúc:': 'Received at:',
  'Thông báo cần kiểm tra': 'Notifications Needing Review',
  'Mã giao dịch': 'Transaction Code',
  'Nhận lúc': 'Received at',
  'Mức trả theo giờ': 'Hourly Pay Formula',
  'Loại lớp': 'Class Format',
  'VND/giờ': 'VND / hour',
  'Hiệu lực từ': 'Effective From',
  'Đến ngày (để trống nếu chưa kết thúc)': 'Valid To (leave blank if ongoing)',
  'Rate': 'Rate',
  'Từ': 'From',
  'Đến': 'To',
  'Hiệu lực': 'Status',
  'Kết thúc rate': 'End Rate',
  'Ngày kết thúc hiệu lực': 'End Date',
  'Thêm khoản thưởng được duyệt': 'Add Approved Bonus',
  'Số tiền VND': 'Amount (VND)',
  'Trạng thái gửi email': 'Outbox Email Status',
  'Lịch sử thay đổi': 'Audit History',
  'Sao lưu hệ thống': 'System Backups',
  'Lần thử': 'Attempts',
  'Lỗi gần nhất': 'Last Error',
  'Người thực hiện': 'Actor',
  'Ghi chú': 'Summary',
  'Lần chạy': 'Run',
  'Kết quả': 'Result',
  'Tải lại': 'Reload',
  'Định dạng nộp bài': 'Submission Format',
  'Nội dung, link hoặc file': 'Text, link or file',
  'Chỉ văn bản': 'Text only',
  'Chỉ liên kết': 'Link only',
  'File đính kèm': 'Attached file',
  'Bản ghi âm (Speaking)': 'Audio recording (Speaking)',
  'Bài Speaking phải chọn bản ghi âm. Để trống sẽ áp dụng mặc định theo loại bài.': 'Speaking tasks require audio recording. Blank uses task type default.',
  'Tài liệu kèm bài tập (giữ Ctrl để chọn nhiều)': 'Materials attached to assignment (hold Ctrl to select multiple)',
  'Tiêu chí đánh giá': 'Evaluation Criteria',
  'Chỉ số điểm': 'Metric Code',
  'Điểm tối đa (IELTS: 9; SAT section: 800)': 'Max Score (IELTS: 9; SAT: 800)',
  'Định dạng nộp:': 'Submission format:',
  'Tiêu chí:': 'Criteria:',
  'Theo hướng dẫn của giáo viên': 'As instructed by teacher',
  'Mở tài liệu': 'Open material',
  'Bài làm của bạn': 'Your Submission',
  'Nhập bài làm hoặc ghi chú…': 'Type submission or notes…',
  'từ': 'words',
  'Liên kết bài làm': 'Submission link',
  'Xác nhận nộp bài': 'Confirm Submission',
  'Nộp lúc': 'Submitted at',
  'Điểm': 'Score',
  'Điểm tối đa': 'Max score',
  'Link bài làm': 'Submission link',
  'Phản hồi của giáo viên': 'Teacher feedback',
  'Lưu điểm & phản hồi': 'Save Score & Feedback',
  'Chỉ số': 'Metric',
  'Chưa chấm': 'Ungraded',
  'Phản hồi': 'Feedback',
  'Xem / thanh toán': 'View / Pay',
  'Vào lớp →': 'Enter Class →',
  'Đã nhận thanh toán. Đang chờ Manager duyệt vào lớp.': 'Payment received. Waiting for Manager approval into class.',
  'Hiện QR thanh toán': 'Show Payment QR',
  'Nội dung bắt buộc:': 'Required Reference:',
  'Chuyển đúng': 'Transfer exactly',
  'In báo cáo': 'Print Report',
  'Từ ngày': 'From Date',
  'Đến hết ngày': 'To Date',
  'Xóa bộ lọc': 'Clear Filter',
  'Mục tiêu:': 'Target:',
  'Chưa đặt': 'Not set',
  'Chưa có kết quả cho chỉ số này.': 'No results for this metric yet.',
  'Mới có một kết quả; chưa đủ dữ liệu để kết luận xu hướng.': 'Only one result so far; insufficient data to determine trend.',
  'Bài đánh giá': 'Assessment',
  'Xem điểm & phản hồi': 'View score & feedback',
  'Chi tiết đánh giá': 'Assessment Details',
  'Đóng chi tiết': 'Close Details',
  'Phản hồi:': 'Feedback:',
  'Chưa có': 'None',
  'Liên kết bài nộp': 'Submission Link',
  'Mục tiêu học tập': 'Learning Target',
  'Điểm mục tiêu': 'Target Score',
  'Chuẩn': 'Standard',
  'Đến:': 'To:',
  'Hình thức:': 'Format:',
  'Trạng thái:': 'Status:'
};

// Sorted list of Vietnamese phrases (longest first) for substring replacement
const PHRASE_PAIRS = Object.entries(VN_TO_EN)
  .filter(([vi]) => vi && typeof vi === 'string')
  .sort((a, b) => b[0].length - a[0].length);

let currentLang = 'vi';

export function getLang() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('app_lang') || 'vi';
  }
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'vi';
  if (typeof window !== 'undefined') {
    localStorage.setItem('app_lang', currentLang);
    window.dispatchEvent(new CustomEvent('app-lang-change', { detail: currentLang }));
    applyDomTranslations(currentLang === 'en');
  }
}

export function translateText(text, targetLang = 'en') {
  if (!text || typeof text !== 'string') return text;
  if (targetLang !== 'en') return text;

  // Exact match first
  const trimmed = text.trim();
  if (VN_TO_EN[trimmed]) {
    return text.replace(trimmed, VN_TO_EN[trimmed]);
  }

  // Phrase-by-phrase replacement (longest phrases first)
  let result = text;
  for (let i = 0; i < PHRASE_PAIRS.length; i++) {
    const [vi, en] = PHRASE_PAIRS[i];
    if (result.includes(vi)) {
      result = result.split(vi).join(en);
    }
  }
  return result;
}

export function t(key, lang = null) {
  if (!key || typeof key !== 'string') return key;
  const activeLang = lang || getLang();

  // 1. Check legacy key lookup
  if (I18N_KEYS[key]) {
    return I18N_KEYS[key][activeLang] || I18N_KEYS[key].vi;
  }

  // 2. Check DB enum / status lookup
  if (DB_TRANSLATIONS[key]) {
    return DB_TRANSLATIONS[key][activeLang] || DB_TRANSLATIONS[key].vi;
  }

  // 3. In Vietnamese mode, keep natural Vietnamese text
  if (activeLang === 'vi') {
    return key;
  }

  // 4. In English mode, translate to English
  if (VN_TO_EN[key]) {
    return VN_TO_EN[key];
  }

  return translateText(key, 'en');
}

export function applyDomTranslations(isEn) {
  if (typeof document === 'undefined') return;

  // When switching to Vietnamese, revert any previously translated nodes
  if (!isEn) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.__viText !== undefined && node.nodeValue !== node.__viText) {
        node.nodeValue = node.__viText;
      }
    }

    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      if (el.__viPh !== undefined && el.getAttribute('placeholder') !== el.__viPh) {
        el.setAttribute('placeholder', el.__viPh);
      }
    });

    document.querySelectorAll('option').forEach(el => {
      if (el.__viText !== undefined && el.textContent !== el.__viText) {
        el.textContent = el.__viText;
      }
    });
    return;
  }

  // When switching to English:
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (['SCRIPT', 'STYLE'].includes(parent.tagName)) continue;

    // Cache original Vietnamese text
    if (node.__viText === undefined) {
      node.__viText = node.nodeValue;
    }

    const translated = translateText(node.__viText, 'en');
    if (node.nodeValue !== translated) {
      node.nodeValue = translated;
    }
  }

  // Translate input and textarea placeholders
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (el.__viPh === undefined) {
      el.__viPh = el.getAttribute('placeholder') || '';
    }
    const translated = translateText(el.__viPh, 'en');
    if (el.getAttribute('placeholder') !== translated) {
      el.setAttribute('placeholder', translated);
    }
  });

  // Translate select options
  document.querySelectorAll('option').forEach(el => {
    if (el.__viText === undefined) {
      el.__viText = el.textContent || '';
    }
    const translated = translateText(el.__viText, 'en');
    if (el.textContent !== translated) {
      el.textContent = translated;
    }
  });
}

export function useLang() {
  const [lang, setLangState] = useState(getLang());

  useEffect(() => {
    const update = () => {
      const current = getLang();
      setLangState(current);
      applyDomTranslations(current === 'en');
    };

    update();

    const handler = () => update();
    window.addEventListener('app-lang-change', handler);

    // Debounced MutationObserver ONLY active in English mode
    let timeoutId;
    const observer = new MutationObserver(() => {
      if (getLang() === 'en') {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          applyDomTranslations(true);
        }, 40);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: false });

    return () => {
      window.removeEventListener('app-lang-change', handler);
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  const toggle = () => {
    const next = lang === 'vi' ? 'en' : 'vi';
    setLang(next);
  };

  return {
    lang,
    t: (key) => t(key, lang),
    toggle,
    setLang,
    isEn: lang === 'en'
  };
}
