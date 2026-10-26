# Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa (Mobile App Prototype)

Nền tảng phát thanh tin tức cá nhân hóa dành cho **người bận rộn, nhân viên văn phòng và tài xế đường dài / giờ cao điểm** tại Việt Nam.

Giao diện đã được thiết kế hoàn toàn theo phong cách **Prototype Mobile Application (iPhone / Android)** với khung điện thoại hiện đại, thanh điều hướng ngón tay cái, Sticky Mini Player và trình phát Full-Screen Player sống động.

---

## 📱 Đặc Điểm Giao Diện Di Động (Mobile UI/UX)

1. **Khung Màn Hình Di Động (Mobile Container):**
   - Trên Desktop: Hiển thị như một chiếc iPhone cao cấp căn giữa màn hình với bo góc 46px, viền kim loại, Dynamic Island và hiệu ứng ánh sáng nền mờ ảo (ambient glow).
   - Trên Điện thoại thật: Tự động mở rộng 100% toàn màn hình mượt mà (`viewport-fit=cover`).
   - Thanh trạng thái Status Bar chuẩn iOS/Android (Đồng hồ thời gian thực `09:41`, Dynamic Island thông báo kênh đang phát, biểu tượng sóng, wifi, pin).

2. **Thanh Header Top Bar:**
   - Góc trái: Logo "Radio VN" nhỏ kèm huy hiệu đỏ nhấp nháy `🔴 LIVE`.
   - Góc phải: Avatar người dùng tròn nhỏ (32x32px). Chạm vào để chuyển nhanh đến màn hình Tài khoản hoặc mở Bottom Sheet đăng nhập.

3. **Thanh Bottom Navigation Bar (Đáy màn hình):**
   - 🏠 **Trang chủ (Home):** Banner chào buổi sáng, danh mục nghe nhanh theo chủ đề, danh sách kênh nổi bật.
   - 📻 **Kênh của tôi (My Channels):** Bộ lọc kênh, thanh tìm kiếm và quản lý các kênh đã tạo.
   - ➕ **Nút Tạo Kênh Nổi Bật (Quick Prompt):** Nút tròn phát sáng nhô cao ở giữa thanh menu giúp mở nhanh Wizard tạo kênh bằng 1 chạm ngón tay cái.
   - 👤 **Tài khoản (Profile):** Thẻ thông tin thành viên, thống kê số kênh, tùy chọn giao diện và nút đăng xuất.

4. **Trình Phát Nhạc Mini (Sticky Mini Audio Player) & Full-Screen Player:**
   - **Mini Player:** Cố định ngay trên thanh Bottom Navigation. Hiển thị đĩa than xoay tròn khi phát nhạc, tên kênh, nút Play/Pause và thanh tiến trình nghe nhỏ.
   - **Full-Screen Audio Player (Toàn màn hình):** Chạm vào Mini Player sẽ trượt mượt mà lên toàn màn hình:
     - Khung Album Art lớn tích hợp **Canvas Audio Visualizer** hiển thị sóng âm thanh động học thời gian thực.
     - Tua lùi 10s, Play/Pause phát sáng lớn, Tua nhanh 10s.
     - Chip điều chỉnh tốc độ đọc (0.85x, 1.0x, 1.25x).
     - Nút "Xem Kịch Bản" mở Bottom Sheet hiển thị lời dẫn MC và hiệu ứng `[SFX]`.

5. **Quy Trình Tạo Kênh Bằng Prompt (Vertical Mobile Flow):**
   - 4 bước được tối ưu theo chiều dọc (Vertical Layout) cho màn hình cảm ứng:
     - **Bước 1:** Nhập Prompt, chọn nhanh mẫu gợi ý, chọn chủ đề và phong cách MC.
     - **Bước 2:** Bật/tắt nguồn báo chính thống và kiểm tra Whitelist tên miền .vn.
     - **Bước 3:** Chọn hình thức phát (Live 24/7 / Podcast) và nghe thử mẫu giọng 4 MC AI (Minh Quân, Thu Hà, Tấn Phát, Mai Phương).
     - **Bước 4:** Mô phỏng Pipeline AI Editorial, xem trước kịch bản và bấm nút to "Lên Sóng Live".

---

## 🛠️ Công Nghệ & Ràng Buộc Kỹ Thuật

- **Frontend:** HTML5, CSS3, Tailwind CSS (CDN), Vanilla JavaScript (ES6 Modules) - hoàn toàn không dùng framework nặng.
- **Backend:** Python 3.10+, FastAPI, Uvicorn, BeautifulSoup4, Requests, Pydantic.
- **Database:** SQLite (`radio_vn.db` tích hợp sẵn trong Python, tự động seed 3 kênh chất lượng cao).
- **Âm thanh & TTS:** Hoàn toàn miễn phí, không tốn API key:
  - Web Audio API tạo tiếng chuông Radio Chime jingle trước mỗi bản tin.
  - Web Speech API (`SpeechSynthesis`) đọc tiếng Việt truyền cảm.
  - HTML5 Canvas Visualizer hiển thị sóng âm thanh trực tiếp.

---

## 🚀 Hướng Dẫn Chạy Dự Án

### Cách 1: Chạy Nhanh Bằng File `run.bat` (Khuyên Dùng Trên Windows)
1. Mở thư mục `d:\Radio\radio-vn-demo`.
2. Nhấp đúp chuột vào file `run.bat`.
3. Trình duyệt sẽ tự động mở `http://127.0.0.1:8000` và hiển thị giao diện Mobile App.

---

### Cách 2: Chạy Thủ Công Qua Terminal
```powershell
cd d:\Radio\radio-vn-demo\backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
Truy cập: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**
