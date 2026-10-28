# 📻 Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa (AI Radio Studio)

> **Nền tảng phát thanh tin tức và âm nhạc thông minh dành riêng cho người bận rộn, nhân viên văn phòng và tài xế đường dài / giờ cao điểm tại Việt Nam.**  
> Dự án được xây dựng với kiến trúc **Prototype Mobile Application (iPhone / Android Viewport)**, sử dụng **Python FastAPI + SQLite** ở Backend và **Vanilla HTML5/CSS/JS + Tailwind CSS** ở Frontend, tích hợp **Google AI Studio (Gemini API)** để phân tích ngữ nghĩa và biên tập kịch bản phát thanh đa nguồn chuyên sâu.

---

## 📑 Mục Lục
1. [Tầm Nhìn & Giá Trị Cốt Lõi](#-tầm-nhìn--giá-trị-cốt-lõi)
2. [Kiến Trúc Hệ Thống (System Architecture)](#-kiến-trúc-hệ-thống-system-architecture)
3. [Kiến Trúc Module Hóa Frontend (Frontend Modular Architecture)](#-kiến-trúc-module-hóa-frontend-frontend-modular-architecture)
4. [Phân Tích Các Luồng Cốt Lõi (Core Flows)](#-phân-tích-các-luồng-cốt-lõi-core-flows)
5. [Đặc Điểm Giao Diện Di Động (Mobile UI/UX)](#-đặc-điểm-giao-diện-di-động-mobile-uiux)
6. [Cấu Trúc Thư Mục Dự Án](#-cấu-trúc-thư-mục-dự-án)
7. [Cấu Hình & Cài Đặt Môi Trường (.env)](#-cấu-hình--cài-đặt-môi-trường-env)
8. [Hướng Dẫn Khởi Chạy](#-hướng-dẫn-khởi-chạy)

---

## 🎯 Tầm Nhìn & Giá Trị Cốt Lõi

Trong kỷ nguyên số bùng nổ thông tin, người nghe thường xuyên phải đối mặt với hai vấn đề lớn:
1. **Quá tải thông tin và tin rác:** Khó chọn lọc được các thông tin chính thống, đáng tin cậy.
2. **Không có thời gian nhìn màn hình:** Tài xế lái xe, người tập thể thao, người nấu ăn hoặc làm việc văn phòng cần trải nghiệm rảnh tay (*hands-free, screen-free*).

**Radio VN** giải quyết triệt để vấn đề này bằng cách:
- Cho phép người dùng nhập yêu cầu bằng ngôn ngữ tự nhiên (*Prompt tự do*).
- Sử dụng mô hình **Google Gemini AI** để phân tích ngữ nghĩa, tự động nhận diện chủ đề, phong cách MC và đề xuất nguồn báo chí chính thống tại Việt Nam.
- Tự động cào dữ liệu, tổng hợp và biên tập thành một kịch bản phát thanh hoàn chỉnh dài dặn (**400 - 600+ từ**) gồm đầy đủ lời chào MC, câu chuyển đoạn âm thanh (*transitions*), phân tích tin tức đa chiều và lời kết ý nghĩa.
- Phát giọng đọc tiếng Việt truyền cảm qua **Web Speech API** kèm hiệu ứng nhạc chuông Radio (*Web Audio API*) và sóng âm trực tiếp (*HTML5 Canvas Visualizer*) mà không phát sinh chi phí bản quyền TTS ngoài.

---

## 🏛️ Kiến Trúc Hệ Thống (System Architecture)

Hệ thống được thiết kế theo mô hình **Monolithic Clean Architecture** khép kín, tinh gọn, hiệu năng cao và có tính tự phục hồi (*fault-tolerant*).

```
+-----------------------------------------------------------------------------------+
|                        CLIENT LAYER (Mobile App Viewport)                         |
|  - HTML5 Mobile Frame (390px x 844px)        - Dynamic Island & Top App Bar       |
|  - Navigation Tabs (Home, Channels, Profile) - Sticky Mini Player & Full Player   |
|  - Web Audio API (Jingle Chimes)             - Web Speech API (Chunk Streaming)   |
|  - HTML5 Canvas Visualizer (Dynamic Wave)    - 4-Step Interactive Wizard Modal    |
+-----------------------------------------------------------------------------------+
                                        │  ▲
                     HTTP / REST API    │  │  JSON Response & Static Assets
                                        ▼  │
+-----------------------------------------------------------------------------------+
|                        BACKEND LAYER (FastAPI & Uvicorn)                          |
|                                                                                   |
|  [main.py] Entrypoint & RESTful Routing                                           |
|    ├── /api/auth/*        : Xác thực người dùng & Quản lý phiên làm việc          |
|    ├── /api/channels/*    : Quản lý kênh phát thanh (CRUD & Live Refresh)         |
|    ├── /api/sources/*     : Đề xuất nguồn báo & Kiểm tra Whitelist tên miền .vn   |
|    ├── /api/ai/*          : Semantic Validation & Editorial Script Generation     |
|    └── Static Files Mount : Phục vụ trực tiếp frontend (/ -> frontend/)          |
|                                                                                   |
|  [gemini_service.py] Google AI Studio Semantic & Editorial Engine                 |
|    ├── Multi-Candidate Model Resolver: gemini-3.5-flash / 2.5-flash / 3.8-flash    |
|    ├── Dual Calling Pipeline: Google GenAI SDK & Direct HTTPS REST API            |
|    ├── Semantic Prompt Analyzer: Trích xuất topic, tone, title, feedback         |
|    └── Deep Radio Script Synthesis: Biên tập bản tin dài 400 - 600 từ chuẩn MC    |
|                                                                                   |
|  [crawler.py] Tin tức Báo chí & Domain Whitelist                                  |
|    ├── Whitelist Validator: Kiểm duyệt tên miền báo chính thống (.vn, báo lớn)   |
|    └── News Extraction: Thu thập và chuẩn hóa dữ liệu tin tức đa nguồn           |
|                                                                                   |
|  [ai_editorial.py] Radio Editorial Catalog & Sound Design                         |
|    └── Danh bạ 4 MC AI đặc thù (Minh Quân, Thu Hà, Tấn Phát, Mai Phương)          |
+-----------------------------------------------------------------------------------+
                     │                                         │
                     ▼                                         ▼
+------------------------------------------+  +-------------------------------------+
|        LOCAL PERSISTENCE LAYER           |  |       EXTERNAL CLOUD SERVICE        |
|                                          |  |                                     |
|  SQLite Database (backend/radio_vn.db)   |  |   Google AI Studio (Gemini API)     |
|    ├── Table: users                      |  |     - Semantic Prompt Analysis      |
|    ├── Table: channels                   |  |     - In-depth Radio Scripting      |
|    └── Table: broadcasts                 |  |     - Verified Source Suggestion    |
+------------------------------------------+  +-------------------------------------+
```

### Các Thành Phần Kiến Trúc Chính:
1. **FastAPI Application (`backend/main.py`):**
   - Đóng vai trò là Gateway điều phối toàn bộ REST API và Static File Hosting.
   - Sử dụng `CORSMiddleware` cho phép kết nối an toàn từ localhost, 127.0.0.1 và môi trường mobile.
   - Quản lý DTOs bằng `Pydantic` đảm bảo tính toàn vẹn dữ liệu cho mọi payload đầu vào/đầu ra.
2. **AI Service Module (`backend/gemini_service.py`):**
   - Cơ chế **Auto-Candidate Resolution**: Loại bỏ hoàn toàn lỗi `404 NotFound` bằng cách ưu tiên các model mới nhất (`gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-3.8-flash`).
   - Hỗ trợ cơ chế **Dual Engine**: Kết hợp SDK `google-generativeai` và Direct HTTPS REST API qua `requests` với timeout ngắn (10 - 15 giây), ngăn chặn tình trạng treo kết nối (*hanging*).
   - Tích hợp bộ **Local Semantic Fallback** đảm bảo ứng dụng vẫn hoạt động mượt mà ngay cả khi mất mạng hoặc chưa cấu hình API Key.
3. **Database Module (`backend/database.py`):**
   - Sử dụng SQLite (`backend/radio_vn.db`) nhẹ, không cần cài đặt dịch vụ ngoài.
   - Tự động kích hoạt cơ chế `PRAGMA foreign_keys = ON` và Row Factory trả về định dạng Dictionary tiện lợi.
   - Khởi tạo bảng tự động và nạp sẵn dữ liệu mẫu (Seed Data) chuẩn phong cách phát thanh Việt Nam.
4. **Crawler & Whitelist Module (`backend/crawler.py`):**
   - Danh sách Trắng (*Whitelist*) các cơ quan báo chí uy tín tại Việt Nam: VnExpress, Tuổi Trẻ, Thanh Niên, VietNamNet, VOV, VTV, Báo Giao Thông, CafeF, GenK, v.v.
   - Ngăn chặn tin giả và các tên miền không rõ nguồn gốc.

---

## 🎨 Kiến Trúc Module Hóa Frontend (Frontend Modular Architecture)

Frontend được xây dựng theo chuẩn **Single Page Application (SPA)** thuần túy (*Vanilla JavaScript ES6 Modules*) mà không phụ thuộc vào các framework nặng (React, Vue, Angular), giúp tối ưu 100% tốc độ tải và dễ dàng đóng gói thành Mobile App (qua Capacitor/Cordova/PWA).

```
frontend/
├── index.html       # Cấu trúc giao diện chuẩn Mobile App Viewport (390px x 844px)
├── styles.css       # Design System: Glassmorphism, Neon Glow, Equalizer, Canvas Art
└── app.js           # Single Source of Truth & Logic điều khiển ứng dụng
      ├── State Management (state store)
      ├── RadioAudioEngine (Web Speech & Web Audio APIs)
      ├── Canvas Audio Visualizer (Waveform Rendering)
      ├── Auth Gate & Onboarding Flow
      ├── Step-by-Step Channel Creation Wizard
      └── Sticky Mini Player & Fullscreen Player Controller
```

### 1. State Store Tập Trung (`state` trong `app.js`):
Toàn bộ trạng thái ứng dụng được quản lý đồng nhất trong một đối tượng `state` duy nhất:
- `user`: Thông tin phiên đăng nhập (lưu đồng bộ trong `localStorage`).
- `channels`: Danh sách kênh radio của người dùng, bộ lọc (`all`, `live`, `podcast`) và từ khóa tìm kiếm.
- `activeChannel` & `activeBroadcast`: Kênh và số phát thanh đang phát sóng.
- `isPlaying`, `currentTime`, `duration`, `playbackSpeed`, `volume`: Trạng thái trình phát.
- `wizard`: Dữ liệu từng bước trong quy trình tạo kênh (Prompt, chủ đề, nguồn báo, giọng đọc, kịch bản mẫu).

### 2. Audio Engine Đột Phá Chống Timeout 15s (`RadioAudioEngine`):
- **Khắc phục lỗi ngắt tiếng của Chrome/Edge:** Trình duyệt thường tự động ngắt `window.speechSynthesis` nếu một câu đọc kéo dài quá 15 giây. `RadioAudioEngine` giải quyết triệt để bằng thuật toán **Sentence Chunking** — tự động bóc tách kịch bản 400 - 600 từ thành các câu ngữ nghĩa ngắn, phát tuần tự qua hàng đợi và duy trì một **Heartbeat Timer** định kỳ để ngăn Chrome thu hồi bộ nhớ.
- **Web Audio API Jingle Synthesizer:** Tự động tổng hợp hợp âm Radio Chime 3 nốt (C5 -> E5 -> G5) trước mỗi bản tin mà không cần nạp file âm thanh MP3 từ ngoài.

### 3. HTML5 Canvas Dynamic Waveform Visualizer:
- Khung vẽ Canvas `220x42px` kết xuất 28 cột sóng âm thanh đối xứng với hiệu ứng chuyển màu (*Linear Gradient*) từ xanh dương sang tím neon, dao động động học theo thời gian thực dựa trên nhịp độ đọc và tốc độ phát thanh.

---

## 🔄 Phân Tích Các Luồng Cốt Lõi (Core Flows)

### Luồng 1: Xác Thực Bắt Buộc & Onboarding Gate (Authentication Gate)
```
[Khởi động Ứng dụng]
        │
        ▼
[Kiểm tra LocalStorage có User Token?]
   ├── Có  ──► [Nạp Kênh & Hiển thị Trang Chủ]
   └── Không ─► [Khóa giao diện - Hiển thị Màn hình Đăng Nhập / Đăng Ký]
                     │
                     ├── Đăng nhập bằng tài khoản
                     └── Hoặc bấm "Đăng nhập nhanh tài khoản Demo" (1-Click)
                               │
                               ▼
        [Lần đầu đăng nhập? (isOnboarded == false)]
           ├── Đúng ──► [Chuyển THẲNG đến Màn hình "Tạo Kênh Mới"]
           └── Sai   ──► [Chuyển về Trang Chủ Dashboard]
```

---

### Luồng 2: Quy Trình 4 Bước Tạo Kênh Phát Thanh (Step-by-Step Wizard)

```
 [ BƯỚC 1: NHẬP PROMPT & AI DUYỆT PROMPT ]
  - Người dùng nhập Prompt tự do hoặc chọn 1 trong 6 Thẻ Gợi Ý Nhanh (Quick Tags).
  - Bấm "Gửi Prompt Để AI Duyệt" ──► Gửi POST /api/ai/validate-prompt.
  - Gemini Semantic Analysis trả về: valid, topic_category, topic_label, tone, title, feedback.
  - Hiển thị phản hồi AI dạng thẻ xanh thành công và mở khóa nút "Tiếp tục".
                        │
                        ▼
 [ BƯỚC 2: AI GỢI Ý & DUYỆT NGUỒN BÁO CHÍNH THỐNG ]
  - Gọi GET /api/sources/suggest?topic=...&prompt=...
  - Gemini & Crawler đề xuất 5-8 website báo chí uy tín (.vn) phù hợp với chủ đề.
  - Người dùng có thể Bật/Tắt từng nguồn hoặc nhập URL báo chí mới để kiểm tra Whitelist.
                        │
                        ▼
 [ BƯỚC 3: CHỌN GIỌNG ĐỌC MC & HÌNH THỨC PHÁT SỐNG ]
  - Chọn 1 trong 4 giọng đọc AI (Minh Quân, Thu Hà, Tấn Phát, Mai Phương).
  - Có nút "Nghe thử mẫu giọng" để nghe trực tiếp chất giọng Bắc / Nam.
  - Chọn Hình thức phát sóng duy nhất: 🔴 24/24 Live Stream | ⏰ Khung giờ | 🎙️ Podcast On-Demand.
                        │
                        ▼
 [ BƯỚC 4: AI BIÊN TẬP KỊCH BẢN CHUYÊN SÂU & LÊN SÓNG ]
  - Gọi POST /api/generate-script (hoặc /api/ai/editorial-preview).
  - Gemini tổng hợp tin tức thời gian thực và sinh kịch bản dài 400 - 600 từ gồm 4 phần hoàn chỉnh.
  - Xem trước kịch bản có các thẻ hiệu ứng [SFX], ước tính thời lượng đọc.
  - Bấm "Lưu Kênh & Bắt Đầu Nghe" ──► Lưu kênh vào DB, phát sóng ngay lập tức.
```

---

### Luồng 3: Trải Nghiệm Phát Thanh & Đồng Bộ Trình Phát (Audio Player Sync)
- **Sticky Mini Player:** Nằm cố định ngay trên thanh Bottom Nav, hiển thị đĩa than xoay tròn khi phát nhạc, tên kênh, headline tin tức và nút bấm nghe nhanh.
- **Fullscreen Player:** Chạm vào Mini Player sẽ trượt mượt mà lên toàn màn hình với sóng âm Canvas Visualizer, nút tua ±10s, chọn tốc độ phát (0.8x, 1.0x, 1.25x) và nút mở kịch bản chi tiết (*Script Bottom Sheet*).

---

## 📱 Đặc Điểm Giao Diện Di Động (Mobile UI/UX)

- **Chuẩn Viewport Mobile:** Tối ưu hóa cho khung hình `390px x 844px` (iPhone 14/15/16). Trên máy tính, giao diện được căn giữa với viền kim loại sang trọng, Dynamic Island và ánh sáng nền mờ ảo; trên thiết bị di động thật, ứng dụng tự động mở rộng 100% màn hình với `viewport-fit=cover`.
- **Thanh Bottom Navigation:** Thiết kế công thái học (*thumb-friendly*), đặt nút tạo kênh nhanh (+) ở vị trí nhô cao trung tâm giúp thao tác bằng một tay dễ dàng.
- **Phong Cách Thẩm Mỹ Cao Cấp:** Giao diện Dark Theme hiện đại kết hợp Glassmorphism mờ kính, viền phát sáng Cyan/Indigo neon, phông chữ `Plus Jakarta Sans` chuẩn quốc tế.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```
d:/Radio/radio-vn-demo/
├── .env                       # Biến môi trường ở thư mục gốc (GEMINI_API_KEY, GEMINI_MODEL)
├── .env.example               # Mẫu cấu hình biến môi trường chuẩn
├── .gitignore                 # Cấu hình bỏ qua file nhạy cảm và cache
├── README.md                  # Tài liệu tổng quan dự án (File này)
├── project_rules.md           # Bộ quy tắc kỹ thuật và tiêu chuẩn phát triển
├── map.md                     # Bản đồ chi tiết vị trí và nhiệm vụ của mọi file
├── run.bat                    # Script khởi chạy 1-click tự động trên Windows
├── backend/                   # Mã nguồn Backend Python FastAPI
│   ├── .env                   # File môi trường riêng của backend
│   ├── .env.example           # Mẫu cấu hình môi trường backend
│   ├── main.py                # Server FastAPI chính, REST API & Static File Mounting
│   ├── gemini_service.py      # Tích hợp Gemini AI, Semantic Analysis & Kịch bản 400-600 từ
│   ├── ai_editorial.py        # Danh bạ giọng đọc MC AI & Sound Design
│   ├── crawler.py             # Cào tin tức báo chí & Kiểm duyệt Whitelist tên miền .vn
│   ├── database.py            # Quản lý SQLite database (bảng users, channels, broadcasts)
│   ├── radio_vn.db            # Cơ sở dữ liệu SQLite cục bộ
│   └── requirements.txt       # Danh sách thư viện Python cần thiết
├── frontend/                  # Mã nguồn giao diện Mobile Prototype
│   ├── index.html             # Cấu trúc màn hình di động, Wizard 4 bước & Player
│   ├── styles.css             # Định kiểu giao diện, hiệu ứng ánh sáng & Glassmorphism
│   └── app.js                 # State store, Web Audio/Speech engine, Canvas visualizer
├── contexts/                  # Tài liệu ghi nhận quyết định kiến trúc & ngữ cảnh
│   ├── architecture_decisions.md   # Ghi nhận các quyết định kiến trúc (ADR)
│   ├── gemini_integration.md       # Ngữ cảnh cấu hình và kết nối Google Gemini API
│   ├── frontend_audio_engine.md    # Chi tiết kỹ thuật Speech Synthesis & Canvas Visualizer
│   └── database_schema.md          # Lược đồ cơ sở dữ liệu và quan hệ bảng SQLite
└── deliverables/              # Tài liệu bàn giao phiên bản và sản phẩm
    ├── README.md              # Quy định lưu trữ sản phẩm bàn giao
    └── release_notes_v1.0.md  # Biên bản bàn giao phiên bản Prototype v1.0
```

---

## ⚙️ Cấu Hình & Cài Đặt Môi Trường (.env)

Hệ thống hỗ trợ tự động tìm kiếm file cấu hình ở cả thư mục `backend/.env` và `.env` ở thư mục gốc.

Tạo hoặc chỉnh sửa file `.env` với nội dung:
```env
# ========================================================
# Radio VN AI Studio - Environment Variables (.env)
# ========================================================

# Khóa API Google AI Studio (Gemini API)
# Lấy API Key miễn phí tại: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Cấu hình Model Gemini chuẩn mới nhất (gemini-3.5-flash / gemini-2.5-flash)
GEMINI_MODEL=gemini-3.5-flash

# Cổng khởi chạy Server
PORT=8000
```

> **Lưu ý:** Nếu chưa có API Key, hệ thống sẽ tự động kích hoạt **Bộ phân tích ngữ nghĩa dự phòng (Local Semantic Fallback)** để đảm bảo người dùng vẫn trải nghiệm đầy đủ các tính năng mà không bị gián đoạn.

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Khởi Chạy 1-Click Bằng `run.bat` (Khuyên Dùng Trên Windows)
1. Mở thư mục dự án `d:\Radio\radio-vn-demo`.
2. Nhấp đúp chuột vào file **`run.bat`**.
3. File sẽ tự chuyển vào thư mục backend, khởi chạy Uvicorn server tại `http://127.0.0.1:8000` và tự động mở trình duyệt hiển thị giao diện Mobile App.

### Cách 2: Khởi Chạy Thủ Công Qua Terminal / PowerShell
```powershell
# 1. Chuyển vào thư mục backend
cd d:\Radio\radio-vn-demo\backend

# 2. Cài đặt các thư viện cần thiết (nếu chạy lần đầu)
pip install -r requirements.txt

# 3. Khởi chạy Uvicorn Server
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Truy cập ứng dụng tại: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**  
Tài khoản Demo có sẵn: Bấm nút **"Đăng Nhập Nhanh Bằng Tài Khoản Demo"** trên màn hình đầu tiên để vào thẳng ứng dụng.
