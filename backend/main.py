"""
main.py - FastAPI Backend cho dự án Demo "Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa".
Cung cấp RESTful API cho xác thực, quản lý kênh, kiểm tra Whitelist, cào tin và AI Editorial.
"""

import os
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import database
import crawler
import ai_editorial

# Khởi tạo cơ sở dữ liệu khi khởi động
database.init_db()

app = FastAPI(
    title="Radio VN - AI Personalized Radio API",
    description="Backend API cho nền tảng phát thanh tin tức AI cá nhân hóa Radio VN",
    version="1.0.0"
)

# Cấu hình CORS để Frontend gọi API thuận tiện từ mọi nguồn (localhost, 127.0.0.1, file://)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thư mục Frontend
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ==========================================
# PYDANTIC SCHEMAS (DATA TRANSFER OBJECTS)
# ==========================================

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=4)
    full_name: Optional[str] = "Thính Giả Radio VN"


class LoginRequest(BaseModel):
    username: str
    password: str


class DomainCheckRequest(BaseModel):
    url: str


class ChannelCreateRequest(BaseModel):
    user_id: Optional[int] = 1
    name: str = Field(..., min_length=2)
    prompt: str = Field(..., min_length=3)
    topic: str = "cong-nghe"
    tone: str = "Vui vẻ"
    content_type: str = "continuous"  # continuous | podcast | quick
    sources: List[str] = []
    broadcast_mode: str = "live"       # live | podcast | schedule
    voice_code: str = "vi-VN-MinhQuan"
    voice_name: str = "Minh Quân (Nam - Giọng Bắc)"


class EditorialPreviewRequest(BaseModel):
    name: str = "Kênh Tin Tức Mới"
    prompt: str
    topic: str = "cong-nghe"
    tone: str = "Vui vẻ"
    voice_code: str = "vi-VN-MinhQuan"
    content_type: str = "continuous"
    sources: List[str] = []


# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    """Đăng ký tài khoản người dùng mới."""
    existing = database.get_user_by_username(req.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập đã được sử dụng. Vui lòng chọn tên khác."
        )

    user = database.create_user(req.username, req.email, req.password, req.full_name)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tạo tài khoản lúc này."
        )

    return {
        "success": True,
        "message": "Đăng ký tài khoản thành công!",
        "user": user,
        "token": f"mock_token_{user['id']}_{user['username']}"
    }


@app.post("/api/auth/login")
def login(req: LoginRequest):
    """Đăng nhập và trả về phiên làm việc."""
    user = database.verify_user(req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác."
        )

    return {
        "success": True,
        "message": "Đăng nhập thành công!",
        "user": user,
        "token": f"mock_token_{user['id']}_{user['username']}"
    }


@app.get("/api/auth/me")
def get_current_user(user_id: int = Query(default=1)):
    """Lấy thông tin tài khoản hiện tại."""
    user = database.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại.")
    return {"user": user}


# ==========================================
# CRAWLER & WHITELIST ENDPOINTS
# ==========================================

@app.get("/api/sources/suggest")
def get_suggested_sources(topic: str = Query(default="cong-nghe")):
    """Lấy danh sách các trang báo gợi ý theo chủ đề và kiểm tra Whitelist sẵn."""
    sources = crawler.TOPIC_DEFAULT_SOURCES.get(topic, crawler.TOPIC_DEFAULT_SOURCES["cong-nghe"])
    enriched = []
    for s in sources:
        check = crawler.check_domain_whitelist(s["domain"])
        enriched.append({
            **s,
            "whitelist_info": check
        })
    return {"topic": topic, "sources": enriched}


@app.post("/api/sources/check-domain")
def verify_domain_whitelist(req: DomainCheckRequest):
    """Kiểm tra URL người dùng nhập vào có thuộc Whitelist báo chí uy tín hay không."""
    if not req.url or len(req.url.strip()) < 3:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp URL hợp lệ.")
    
    result = crawler.check_domain_whitelist(req.url)
    return result


@app.get("/api/voices")
def get_voices():
    """Lấy danh sách các giọng đọc AI Tiếng Việt được cấu hình."""
    return {"voices": ai_editorial.AI_VOICES_CATALOG}


# ==========================================
# AI EDITORIAL PREVIEW (WIZARD BƯỚC 4)
# ==========================================

@app.post("/api/ai/editorial-preview")
def preview_ai_editorial(req: EditorialPreviewRequest):
    """
    Mô phỏng Pipeline AI Editorial:
    1. Cào tóm tắt tin tức từ các nguồn đã chọn.
    2. Ghép kịch bản dẫn Radio có câu chào, lời chuyển đoạn (transition) và lời kết.
    """
    # 1. Cào tin tức
    news_items = crawler.crawl_news_from_sources(
        sources_list=req.sources if req.sources else [req.topic],
        topic=req.topic,
        prompt=req.prompt,
        max_total_items=3
    )

    # 2. Biên tập kịch bản phát thanh AI
    editorial_result = ai_editorial.build_editorial_radio_script(
        channel_name=req.name,
        prompt=req.prompt,
        topic=req.topic,
        tone=req.tone,
        voice_code=req.voice_code,
        content_type=req.content_type,
        news_items=news_items
    )

    return {
        "success": True,
        "preview": editorial_result,
        "crawled_news": news_items
    }


# ==========================================
# CHANNELS & BROADCASTS ENDPOINTS
# ==========================================

@app.get("/api/channels")
def list_channels(user_id: int = Query(default=1)):
    """Lấy danh sách các kênh radio của người dùng."""
    channels = database.get_user_channels(user_id)
    return {"channels": channels}


@app.post("/api/channels", status_code=status.HTTP_201_CREATED)
def create_channel(req: ChannelCreateRequest):
    """
    Tạo kênh phát thanh mới từ Wizard:
    1. Lưu thông tin kênh vào DB
    2. Tự động chạy Pipeline cào tin & sinh bản tin phát sóng đầu tiên
    """
    # Tạo kênh trong DB
    channel = database.create_channel(
        user_id=req.user_id or 1,
        name=req.name,
        prompt=req.prompt,
        topic=req.topic,
        tone=req.tone,
        content_type=req.content_type,
        sources=req.sources,
        broadcast_mode=req.broadcast_mode,
        voice_code=req.voice_code,
        voice_name=req.voice_name
    )

    # Thu thập tin tức theo nguồn đã cấu hình
    news_items = crawler.crawl_news_from_sources(
        sources_list=req.sources if req.sources else [req.topic],
        topic=req.topic,
        prompt=req.prompt,
        max_total_items=3
    )

    # Sinh kịch bản số phát sóng đầu tiên
    editorial_result = ai_editorial.build_editorial_radio_script(
        channel_name=req.name,
        prompt=req.prompt,
        topic=req.topic,
        tone=req.tone,
        voice_code=req.voice_code,
        content_type=req.content_type,
        news_items=news_items
    )

    # Lưu bản tin vào DB
    broadcast = database.create_broadcast(
        channel_id=channel["id"],
        title=f"Số Ra Mắt - {req.name}",
        script_text=editorial_result["full_script"],
        duration_est=editorial_result["duration_seconds"],
        headlines=news_items
    )

    return {
        "success": True,
        "message": f"Kênh '{req.name}' đã được khởi tạo thành công!",
        "channel": channel,
        "broadcast": broadcast
    }


@app.get("/api/channels/{channel_id}")
def get_channel_detail(channel_id: int):
    """Lấy chi tiết kênh và bản tin phát thanh mới nhất."""
    channel = database.get_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại.")
    
    latest_broadcast = database.get_latest_broadcast(channel_id)
    return {
        "channel": channel,
        "latest_broadcast": latest_broadcast
    }


@app.delete("/api/channels/{channel_id}")
def delete_channel(channel_id: int, user_id: int = Query(default=1)):
    """Xóa kênh phát thanh."""
    success = database.delete_channel(channel_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại hoặc bạn không có quyền xóa.")
    return {"success": True, "message": "Đã xóa kênh thành công."}


@app.post("/api/channels/{channel_id}/generate-broadcast")
def generate_fresh_broadcast(channel_id: int):
    """Làm mới bản tin cho kênh: Cào lại tin tức thời gian thực và sinh kịch bản phát sóng mới."""
    channel = database.get_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại.")

    news_items = crawler.crawl_news_from_sources(
        sources_list=channel.get("sources", []),
        topic=channel.get("topic", "cong-nghe"),
        prompt=channel.get("prompt", ""),
        max_total_items=3
    )

    editorial_result = ai_editorial.build_editorial_radio_script(
        channel_name=channel["name"],
        prompt=channel["prompt"],
        topic=channel["topic"],
        tone=channel["tone"],
        voice_code=channel["voice_code"],
        content_type=channel["content_type"],
        news_items=news_items
    )

    broadcast = database.create_broadcast(
        channel_id=channel["id"],
        title=f"Bản Tin Trực Tiếp 24/7 - {channel['name']}",
        script_text=editorial_result["full_script"],
        duration_est=editorial_result["duration_seconds"],
        headlines=news_items
    )

    return {
        "success": True,
        "message": "Đã cập nhật bản tin phát thanh trực tiếp mới nhất!",
        "broadcast": broadcast
    }


@app.get("/api/health")
def health_check():
    """Kiểm tra tình trạng hoạt động của hệ thống."""
    return {
        "status": "healthy",
        "service": "Radio VN AI Studio API",
        "database": "SQLite Connected",
        "crawler": "Ready"
    }


# ==========================================
# STATIC FILES SERVING (FRONTEND)
# ==========================================
if FRONTEND_DIR.exists():
    # Mount frontend files at root to serve index.html, app.js, styles.css seamlessly
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

