"""
database.py - Quản lý cơ sở dữ liệu SQLite cho Radio VN.
Khởi tạo bảng người dùng, kênh phát thanh AI và các bản tin phát thanh (broadcasts).
"""

import sqlite3
import json
import hashlib
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "radio_vn.db"


def hash_password(password: str) -> str:
    """Mã hóa mật khẩu bằng SHA-256."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_db():
    """Tạo kết nối tới SQLite và cấu hình Row Factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Khởi tạo cấu trúc bảng và nạp dữ liệu mẫu ban đầu."""
    conn = get_db()
    cursor = conn.cursor()

    # Bảng người dùng
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Bảng kênh phát thanh của người dùng
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            prompt TEXT NOT NULL,
            topic TEXT NOT NULL,
            tone TEXT NOT NULL,
            content_type TEXT NOT NULL,
            sources_json TEXT NOT NULL,
            broadcast_mode TEXT NOT NULL,
            voice_code TEXT NOT NULL,
            voice_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)

    # Bảng các số phát thanh / tập radio theo kênh
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS broadcasts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            script_text TEXT NOT NULL,
            duration_est INTEGER DEFAULT 180,
            headlines_json TEXT,
            audio_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
        )
    """)

    conn.commit()

    # Tạo tài khoản demo nếu chưa có
    cursor.execute("SELECT id FROM users WHERE username = 'demo_user'")
    demo_user = cursor.fetchone()
    if not demo_user:
        cursor.execute("""
            INSERT INTO users (username, email, password_hash, full_name)
            VALUES (?, ?, ?, ?)
        """, (
            "demo_user",
            "demo@radiovn.ai",
            hash_password("demo123"),
            "Thính Giả Radio VN"
        ))
        user_id = cursor.lastrowid
        conn.commit()

        # Seed 3 kênh mẫu chất lượng cao
        seed_channels(cursor, user_id)
        conn.commit()

    conn.close()


def seed_channels(cursor, user_id: int):
    """Tạo các kênh radio mẫu ban đầu cho tài khoản demo."""
    default_channels = [
        {
            "name": "Radio Công Nghệ & Khởi Nghiệp 24/7",
            "prompt": "Kênh tin tức công nghệ AI, xu hướng lập trình và khởi nghiệp công nghệ dành cho kỹ sư và nhà phát triển tại Việt Nam.",
            "topic": "cong-nghe",
            "tone": "Sôi nổi",
            "content_type": "continuous",
            "sources": ["VnExpress Số Hóa", "GenK.vn", "Tuổi Trẻ Nhịp Sống Số"],
            "broadcast_mode": "live",
            "voice_code": "vi-VN-MinhQuan",
            "voice_name": "Minh Quân (Nam - Giọng Bắc)",
            "script": (
                "[SFX: Tiếng jingle radio công nghệ sôi động]\n\n"
                "Xin chào quý thính giả đang đồng hành cùng Radio Công Nghệ 24/7 trên sóng Radio VN! "
                "Tôi là MC Minh Quân, chúc các bạn một ngày làm việc tràn đầy năng lượng sáng tạo.\n\n"
                "[SFX: Nhạc chuyển cảnh nhẹ]\n"
                "Mở đầu bản tin hôm nay là bước tiến vượt bậc của trí tuệ nhân tạo. "
                "Theo ghi nhận từ VnExpress Số Hóa, các mô hình ngôn ngữ lớn thế hệ mới vừa được ra mắt "
                "với khả năng lập trình tự động hóa tác vụ lên đến 95%. "
                "Điều này mở ra cơ hội cực kỳ to lớn cho các startup công nghệ Việt Nam bứt phá trong kỷ nguyên số.\n\n"
                "[SFX: Hiệu ứng chuyển mục]\n"
                "Chuyển sang tiêu điểm thị trường từ GenK: Làn sóng đầu tư vào vi mạch bán dẫn và trung tâm dữ liệu "
                "xanh đang tăng tốc tại các khu công nghệ cao Hà Nội và TP.HCM. "
                "Các chuyên gia dự báo nhu cầu nhân sự công nghệ chất lượng cao sẽ bùng nổ trong nửa cuối năm nay.\n\n"
                "[SFX: Nhạc nền êm dịu kết thúc]\n"
                "Cảm ơn quý vị đã lắng nghe. Hãy bật Radio VN liên tục để không bỏ lỡ nhịp đập công nghệ mới nhất. Chúc các bạn code mượt và thành công!"
            ),
            "headlines": [
                {"title": "Mô hình AI mới nâng hiệu suất lập trình tự động lên 95%", "source": "VnExpress Số Hóa"},
                {"title": "Thị trường bán dẫn Việt Nam đón nhận làn sóng vốn FDI kỷ lục", "source": "GenK.vn"},
                {"title": "Startup Việt ứng dụng AI vào logistics tối ưu chi phí vận hành", "source": "Tuổi Trẻ Số"}
            ],
            "duration": 210
        },
        {
            "name": "Bản Tin Bác Tài & Nhịp Sống Giao Thông",
            "prompt": "Kênh radio đồng hành cùng tài xế đường dài và người lái xe giờ cao điểm: tình hình giao thông, thời tiết, kinh nghiệm lái xe an toàn và tin đời sống vui vẻ.",
            "topic": "giao-thong",
            "tone": "Vui vẻ",
            "content_type": "continuous",
            "sources": ["Thanh Niên Giao Thông", "VnExpress Thời Sự", "Tuổi Trẻ Đời Sống"],
            "broadcast_mode": "live",
            "voice_code": "vi-VN-TanPhat",
            "voice_name": "Tấn Phát (Nam - Giọng Nam Bộ)",
            "script": (
                "[SFX: Tiếng còi xe và jingle radio nhộn nhịp]\n\n"
                "A lô a lô! Thân ái chào toàn thể anh em bác tài đang lăn bánh trên khắp mọi nẻo đường! "
                "Tấn Phát của Radio VN lại tái ngộ cùng bà con đây. Chúc anh em vạn dặm bình an, vô lăng luôn vững vàng nha!\n\n"
                "[SFX: Tiếng kèn bíp bíp vui nhộn]\n"
                "Bây giờ là tình hình lưu thông đáng chú ý theo tin tức từ Thanh Niên và báo Tuổi Trẻ: "
                "Tuyến cao tốc cửa ngõ hiện đang có mật độ phương tiện khá đông do thời tiết có mưa rào nhẹ. "
                "Các bác tài chú ý giữ khoảng cách an toàn tối thiểu 35 mét, nhớ bật đèn sương mù và giảm tốc độ khi vào cua nhé!\n\n"
                "[SFX: Nhạc chuyển cảnh]\n"
                "Mẹo nhỏ đường trường hôm nay: Để chống buồn ngủ hiệu quả khi lái xe giờ trưa, "
                "anh em nhớ uống nước từng ngụm nhỏ, nhai kẹo cao su bạc hà hoặc mở cửa kính hé 2 phân cho gió tự nhiên lùa vào tỉnh táo ngay tắp lự!\n\n"
                "[SFX: Nhạc tươi vui]\n"
                "Cảm ơn anh em đã chọn Radio VN làm bạn đồng hành. Chúc mọi hành trình luôn an toàn, thượng lộ bình an!"
            ),
            "headlines": [
                {"title": "Lưu ý an toàn: Mưa dông xuất hiện tại các tuyến cao tốc cửa ngõ", "source": "Thanh Niên"},
                {"title": "Kinh nghiệm lái xe an toàn vượt cung đèo dốc trời mưa", "source": "VnExpress"},
                {"title": "Quy định mới về làn thu phí tự động không dừng ETC", "source": "Tuổi Trẻ"}
            ],
            "duration": 185
        },
        {
            "name": "Tài Chính & Đầu Tư Buổi Sáng",
            "prompt": "Bản tin tổng hợp thị trường chứng khoán, giá vàng, tỷ giá ngoại tệ và bất động sản dành cho nhà đầu tư bận rộn.",
            "topic": "kinh-doanh",
            "tone": "Trang trọng",
            "content_type": "podcast",
            "sources": ["CafeF.vn", "VietnamNet Kinh Doanh", "Tuổi Trẻ Kinh Doanh"],
            "broadcast_mode": "podcast",
            "voice_code": "vi-VN-ThuHa",
            "voice_name": "Thu Hà (Nữ - Giọng Bắc)",
            "script": (
                "[SFX: Tiếng chuông thị trường tài chính trang trọng]\n\n"
                "Kính chào quý nhà đầu tư. Đây là bản tin Tài Chính & Đầu Tư buổi sáng trên sóng Radio VN. "
                "Tôi là biên tập viên Thu Hà, hân hạnh đồng hành cùng quý vị trong bức tranh toàn cảnh kinh tế hôm nay.\n\n"
                "[SFX: Nhạc chuyển đoạn trang trọng]\n"
                "Điểm tin thị trường từ CafeF: Chỉ số VN-Index mở phiên với sắc xanh lan tỏa, "
                "dẫn dắt bởi nhóm cổ phiếu ngân hàng và bán lẻ tiêu dùng. "
                "Thanh khoản duy trì ở mức cao phản ánh tâm lý lạc quan của dòng tiền trong nước và khối ngoại.\n\n"
                "[SFX: Hiệu ứng phân tích]\n"
                "Về thị trường hàng hóa: Giá vàng SJC và vàng nhẫn 9999 có xu hướng đi ngang sau chuỗi ngày tăng nóng. "
                "Các chuyên gia tài chính khuyến nghị nhà đầu tư cá nhân nên duy trì tỷ trọng tiền mặt hợp lý, "
                "tránh tâm lý FOMO mua đuổi theo sóng ngắn hạn.\n\n"
                "[SFX: Nhạc kết thúc nhẹ nhàng]\n"
                "Bản tin tài chính sáng nay xin được khép lại tại đây. Chúc quý vị một ngày giao dịch hiệu quả và thành công. Xin kính chào và hẹn gặp lại."
            ),
            "headlines": [
                {"title": "VN-Index tăng điểm nhờ lực kéo mạnh từ nhóm cổ phiếu ngân hàng", "source": "CafeF.vn"},
                {"title": "Diễn biến giá vàng và tỷ giá ngoại tệ đầu phiên sáng", "source": "VietnamNet"},
                {"title": "Xu hướng dòng vốn FDI chảy mạnh vào chuỗi cung ứng sản xuất", "source": "Tuổi Trẻ Kinh Doanh"}
            ],
            "duration": 195
        }
    ]

    for item in default_channels:
        cursor.execute("""
            INSERT INTO channels (
                user_id, name, prompt, topic, tone, content_type,
                sources_json, broadcast_mode, voice_code, voice_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            item["name"],
            item["prompt"],
            item["topic"],
            item["tone"],
            item["content_type"],
            json.dumps(item["sources"], ensure_ascii=False),
            item["broadcast_mode"],
            item["voice_code"],
            item["voice_name"]
        ))
        channel_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO broadcasts (
                channel_id, title, script_text, duration_est, headlines_json, audio_url
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            channel_id,
            f"Bản Tin Mới Nhất - {item['name']}",
            item["script"],
            item["duration"],
            json.dumps(item["headlines"], ensure_ascii=False),
            ""
        ))


# ==========================================
# CÁC HÀM CRUD NGƯỜI DÙNG & KÊNH
# ==========================================

def get_user_by_username(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, full_name, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_user(username: str, email: str, password: str, full_name: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    try:
        cursor.execute("""
            INSERT INTO users (username, email, password_hash, full_name)
            VALUES (?, ?, ?, ?)
        """, (username, email, pwd_hash, full_name or username))
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return get_user_by_id(user_id)
    except sqlite3.IntegrityError:
        conn.close()
        return None


def verify_user(username: str, password: str):
    user = get_user_by_username(username)
    if not user:
        return None
    if user["password_hash"] == hash_password(password):
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
            "created_at": user["created_at"]
        }
    return None


def create_channel(
    user_id: int,
    name: str,
    prompt: str,
    topic: str,
    tone: str,
    content_type: str,
    sources: list,
    broadcast_mode: str,
    voice_code: str,
    voice_name: str
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO channels (
            user_id, name, prompt, topic, tone, content_type,
            sources_json, broadcast_mode, voice_code, voice_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        name,
        prompt,
        topic,
        tone,
        content_type,
        json.dumps(sources, ensure_ascii=False),
        broadcast_mode,
        voice_code,
        voice_name
    ))
    channel_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_channel_by_id(channel_id)


def get_user_channels(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.*, 
               (SELECT COUNT(*) FROM broadcasts b WHERE b.channel_id = c.id) as broadcast_count,
               (SELECT b.id FROM broadcasts b WHERE b.channel_id = c.id ORDER BY b.id DESC LIMIT 1) as latest_broadcast_id,
               (SELECT b.title FROM broadcasts b WHERE b.channel_id = c.id ORDER BY b.id DESC LIMIT 1) as latest_broadcast_title,
               (SELECT b.duration_est FROM broadcasts b WHERE b.channel_id = c.id ORDER BY b.id DESC LIMIT 1) as latest_broadcast_duration
        FROM channels c
        WHERE c.user_id = ?
        ORDER BY c.id DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()

    channels = []
    for row in rows:
        ch = dict(row)
        ch["sources"] = json.loads(ch["sources_json"]) if ch["sources_json"] else []
        channels.append(ch)
    return channels


def get_channel_by_id(channel_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM channels WHERE id = ?", (channel_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    ch = dict(row)
    ch["sources"] = json.loads(ch["sources_json"]) if ch["sources_json"] else []
    return ch


def delete_channel(channel_id: int, user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM channels WHERE id = ? AND user_id = ?", (channel_id, user_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def create_broadcast(channel_id: int, title: str, script_text: str, duration_est: int = 180, headlines: list = None, audio_url: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    headlines_json = json.dumps(headlines or [], ensure_ascii=False)
    cursor.execute("""
        INSERT INTO broadcasts (channel_id, title, script_text, duration_est, headlines_json, audio_url)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (channel_id, title, script_text, duration_est, headlines_json, audio_url))
    broadcast_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_broadcast_by_id(broadcast_id)


def get_broadcast_by_id(broadcast_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM broadcasts WHERE id = ?", (broadcast_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    bc = dict(row)
    bc["headlines"] = json.loads(bc["headlines_json"]) if bc["headlines_json"] else []
    return bc


def get_latest_broadcast(channel_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM broadcasts WHERE channel_id = ? ORDER BY id DESC LIMIT 1", (channel_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    bc = dict(row)
    bc["headlines"] = json.loads(bc["headlines_json"]) if bc["headlines_json"] else []
    return bc
