# Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa (AI Radio Studio)

Nền tảng phát thanh tin tức cá nhân hóa dành cho **người bận rộn, nhân viên văn phòng và tài xế đường dài / giờ cao điểm** tại Việt Nam.

Hệ thống cho phép người dùng nhập yêu cầu bằng câu lệnh tự nhiên (Prompt), AI tự động thu thập tin tức từ các báo chí chính thống uy tín, tóm tắt nội dung, biên soạn kịch bản dẫn thanh có câu chào, phân đoạn chuyển tiếp (transitions), hiệu ứng âm thanh SFX và phát sóng trực tiếp bằng giọng đọc AI tiếng Việt truyền cảm.

---

## 🛠️ Công Nghệ & Kiến Trúc Dự Án

- **Backend:** Python 3.10+, **FastAPI**, **Uvicorn**, **BeautifulSoup4**, **Requests**, **Pydantic**.
- **Database:** **SQLite** (`sqlite3` tích hợp sẵn trong Python), tự động khởi tạo và nạp sẵn 3 kênh mẫu.
- **Frontend:** **HTML5**, **CSS3** (Tailwind CSS CDN + Glassmorphism hiện đại), **Vanilla JavaScript (ES6 Modules)** thuần túy, không dùng framework nặng.
- **Audio Engine & Visualizer:** Web Audio API (tạo tiếng chuông Radio Chime jingle), Web Speech API (`SpeechSynthesis`) và **HTML5 Canvas** hiển thị dải sóng âm thanh thời gian thực.

---

## 📂 Cấu Trúc Thư Mục Chuẩn

```text
radio-vn-demo/
├── run.bat              # Script khởi chạy nhanh 1 chạm cho Windows
├── README.md            # Tài liệu dự án & hướng dẫn sử dụng
├── backend/
│   ├── main.py          # RESTful API endpoints với FastAPI & Static file serving
│   ├── crawler.py       # Thu thập tin RSS/Web báo chí & Kiểm tra Whitelist domain uy tín
│   ├── ai_editorial.py  # Pipeline AI tóm tắt tin & biên soạn kịch bản Radio sống động
│   ├── database.py      # Quản lý SQLite DB, tài khoản và kênh phát thanh
│   ├── requirements.txt # Danh sách thư viện Python cần thiết
│   └── radio_vn.db      # Database SQLite (tự động tạo khi chạy)
└── frontend/
    ├── index.html       # Giao diện chính (Tailwind CSS, Wizard 4 bước, Sticky Player)
    ├── app.js           # Xử lý logic, gọi API Fetch, Canvas Visualizer & Audio Engine
    └── styles.css       # Hiệu ứng Glassmorphism, animations và thanh sóng âm
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Trên Localhost

### Cách 1: Chạy Nhanh Bằng File `run.bat` (Khuyên Dùng Trên Windows)
1. Mở thư mục `radio-vn-demo`.
2. Nhấp đúp chuột vào file `run.bat`.
3. Trình duyệt sẽ tự động mở `http://127.0.0.1:8000` và server bắt đầu hoạt động.

---

### Cách 2: Chạy Thủ Công Từng Bước Qua Terminal / PowerShell

#### Bước 1: Mở Terminal tại thư mục `radio-vn-demo/backend`
```powershell
cd radio-vn-demo/backend
```

#### Bước 2 (Tùy chọn): Tạo & Kích hoạt Môi trường Ảo (Virtual Environment)
```powershell
python -m venv venv
.\venv\Scripts\activate
```

#### Bước 3: Cài đặt các thư viện cần thiết
```powershell
pip install -r requirements.txt
```

#### Bước 4: Khởi động máy chủ FastAPI với Uvicorn
```powershell
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

#### Bước 5: Mở ứng dụng trong trình duyệt
Truy cập: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

*(Lưu ý: Nếu bạn muốn mở trực tiếp file `frontend/index.html` trong trình duyệt bằng Live Server hoặc click trực tiếp, mã nguồn `app.js` đã được thiết kế linh hoạt tự động trỏ đến `http://127.0.0.1:8000` để gọi API).*

---

## 🎯 Các Chức Năng Cốt Lõi Trong Demo

1. **Đăng Nhập / Đăng Ký Tài Khoản:**
   - Hỗ trợ Modal đăng nhập / đăng ký với mã hóa mật khẩu SHA-256.
   - Nút **"Sử dụng nhanh tài khoản Demo"** (`demo_user` / `demo123`) giúp trải nghiệm ngay lập tức.
   - Quản lý phiên làm việc tự động qua `localStorage`.

2. **Bảng Điều Khiển (Dashboard) & Danh Sách Kênh:**
   - 3 kênh được tạo sẵn:
     - 🚀 *Radio Công Nghệ & Khởi Nghiệp 24/7* (MC Minh Quân - Nam Bắc)
     - 🚗 *Bản Tin Bác Tài & Nhịp Sống Giao Thông* (MC Tấn Phát - Nam Nam Bộ)
     - 📊 *Tài Chính & Đầu Tư Buổi Sáng* (MC Thu Hà - Nữ Bắc)
   - Bộ lọc theo thể loại: Tất cả, Live 24/7, Podcast On-Demand.
   - Thẻ kênh có hiệu ứng **Equalizer động** khi đang phát sóng.

3. **Sticky Audio Player & Canvas Visualizer Cố Định Ở Đáy Màn Hình:**
   - Phát âm thanh tiếng chuông Radio Chime chân thực trước mỗi bản tin.
   - Tích hợp giọng đọc AI tiếng Việt theo vùng miền (Bắc / Nam).
   - Canvas JS Audio Visualizer hiển thị dải sóng âm dao động theo nhịp đọc.
   - Nút xem toàn bộ kịch bản phát thanh đang phát sóng (`Kịch bản`).

4. **Quy Trình Tạo Kênh Bằng Prompt (Wizard 4 Bước):**
   - **Bước 1 (Prompt & Phong cách):** Nhập yêu cầu bằng ngôn ngữ tự nhiên, chọn chủ đề, phong cách (Vui vẻ, Trang trọng, Sôi nổi, Trầm ấm), loại thời lượng.
   - **Bước 2 (Gợi ý & Duyệt Nguồn Báo):**
     - Đề xuất 5-10 đầu báo chính thống (VnExpress, Tuổi Trẻ, Thanh Niên, GenK, CafeF, VietnamNet...).
     - Công cụ **Kiểm tra Whitelist**: Nhập URL bất kỳ để kiểm tra mức độ uy tín và chứng thực an toàn tên miền.
   - **Bước 3 (Cấu hình Phát & Giọng Đọc):**
     - Chọn hình thức: Live 24/7, Podcast On-Demand, Khung giờ cố định.
     - Chọn MC AI: Minh Quân, Thu Hà, Tấn Phát, Mai Phương kèm nút **"Nghe thử mẫu giọng"**.
   - **Bước 4 (Biên tập AI & Lên Sóng):**
     - Mô phỏng pipeline: Cào tin tức -> Lọc & Tóm tắt -> Ghép kịch bản dẫn có câu chào, lời chuyển đoạn (Transitions) và lời kết.
     - Nút **"Lưu & Bắt Đầu Nghe Live"** kích hoạt kênh mới ngay lập tức.
