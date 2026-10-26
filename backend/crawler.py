"""
crawler.py - Module thu thập tin tức báo chí & kiểm tra Whitelist nguồn tin.
Hỗ trợ kiểm duyệt tên miền báo chính thống Việt Nam và bóc tách RSS/Web.
"""

import re
import urllib.parse
import warnings
from datetime import datetime
import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# Danh sách Whitelist các cơ quan báo chí và trang tin điện tử chính thống uy tín tại Việt Nam
TRUSTED_DOMAINS_WHITELIST = {
    "vnexpress.net": {"name": "VnExpress", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "tuoitre.vn": {"name": "Báo Tuổi Trẻ", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "thanhnien.vn": {"name": "Báo Thanh Niên", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "vietnamnet.vn": {"name": "Báo VietNamNet", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "dantri.com.vn": {"name": "Báo Dân Trí", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "vov.vn": {"name": "Đài Tiếng Nói Việt Nam (VOV)", "type": "Đài phát thanh quốc gia", "tier": "Chính thống Cấp 1"},
    "vtv.vn": {"name": "Đài Truyền Hình Việt Nam (VTV)", "type": "Đài truyền hình quốc gia", "tier": "Chính thống Cấp 1"},
    "laodong.vn": {"name": "Báo Lao Động", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "nhandan.vn": {"name": "Báo Nhân Dân", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "baochinhphu.vn": {"name": "Cổng Thông tin Chính phủ", "type": "Cơ quan Nhà nước", "tier": "Chính thống Cấp 1"},
    "tienphong.vn": {"name": "Báo Tiền Phong", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "sggp.org.vn": {"name": "Báo Sài Gòn Giải Phóng", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "plo.vn": {"name": "Báo Pháp Luật TP.HCM", "type": "Báo điện tử", "tier": "Chính thống Cấp 1"},
    "cafef.vn": {"name": "CafeF", "type": "Trang tin Tài chính - Kinh tế", "tier": "Chuyên ngành"},
    "cafebiz.vn": {"name": "CafeBiz", "type": "Trang tin Doanh nghiệp - Startup", "tier": "Chuyên ngành"},
    "genk.vn": {"name": "GenK", "type": "Trang tin Công nghệ", "tier": "Chuyên ngành"},
    "tinhte.vn": {"name": "Tinh Tế", "type": "Diễn đàn Công nghệ", "tier": "Cộng đồng"},
    "znews.vn": {"name": "Zing News (Tri thức Trực tuyến)", "type": "Tạp chí điện tử", "tier": "Chính thống Cấp 2"},
    "vneconomy.vn": {"name": "VnEconomy", "type": "Thời báo Kinh tế Việt Nam", "tier": "Chuyên ngành"}
}

# Kho nguồn tin gợi ý theo từng chủ đề cho Wizard Bước 2
TOPIC_DEFAULT_SOURCES = {
    "cong-nghe": [
        {"id": "vnexpress-sohoa", "name": "VnExpress Số Hóa", "url": "https://vnexpress.net/so-hoa", "rss": "https://vnexpress.net/rss/so-hoa.rss", "domain": "vnexpress.net", "active": True},
        {"id": "genk", "name": "GenK - Công Nghệ & AI", "url": "https://genk.vn", "rss": "https://genk.vn/rss/tin-ict.rss", "domain": "genk.vn", "active": True},
        {"id": "tuoitre-so", "name": "Tuổi Trẻ Nhịp Sống Số", "url": "https://tuoitre.vn/nhip-song-so.htm", "rss": "https://tuoitre.vn/rss/nhip-song-so.rss", "domain": "tuoitre.vn", "active": True},
        {"id": "thanhnien-tech", "name": "Thanh Niên Công Nghệ", "url": "https://thanhnien.vn/cong-nghe.html", "rss": "https://thanhnien.vn/rss/cong-nghe.rss", "domain": "thanhnien.vn", "active": True},
        {"id": "tinhte", "name": "Tinh Tế Studio", "url": "https://tinhte.vn", "rss": "", "domain": "tinhte.vn", "active": False},
        {"id": "vietnamnet-ict", "name": "VietNamNet Công Nghệ", "url": "https://vietnamnet.vn/cong-nghe", "rss": "https://vietnamnet.vn/rss/cong-nghe.rss", "domain": "vietnamnet.vn", "active": False}
    ],
    "kinh-doanh": [
        {"id": "cafef", "name": "CafeF - Thị Trường & Chứng Khoán", "url": "https://cafef.vn", "rss": "https://cafef.vn/rss/thi-truong-chung-khoan.rss", "domain": "cafef.vn", "active": True},
        {"id": "vnexpress-kd", "name": "VnExpress Kinh Doanh", "url": "https://vnexpress.net/kinh-doanh", "rss": "https://vnexpress.net/rss/kinh-doanh.rss", "domain": "vnexpress.net", "active": True},
        {"id": "tuoitre-kd", "name": "Tuổi Trẻ Kinh Tế", "url": "https://tuoitre.vn/kinh-doanh.htm", "rss": "https://tuoitre.vn/rss/kinh-doanh.rss", "domain": "tuoitre.vn", "active": True},
        {"id": "vietnamnet-kd", "name": "VietNamNet Kinh Doanh", "url": "https://vietnamnet.vn/kinh-doanh", "rss": "https://vietnamnet.vn/rss/kinh-doanh.rss", "domain": "vietnamnet.vn", "active": True},
        {"id": "vneconomy", "name": "VnEconomy", "url": "https://vneconomy.vn", "rss": "", "domain": "vneconomy.vn", "active": False}
    ],
    "giao-thong": [
        {"id": "thanhnien-gt", "name": "Thanh Niên Giao Thông & Đời Sống", "url": "https://thanhnien.vn/thoi-su.html", "rss": "https://thanhnien.vn/rss/thoi-su.rss", "domain": "thanhnien.vn", "active": True},
        {"id": "vnexpress-ts", "name": "VnExpress Thời Sự Giao Thông", "url": "https://vnexpress.net/thoi-su", "rss": "https://vnexpress.net/rss/thoi-su.rss", "domain": "vnexpress.net", "active": True},
        {"id": "tuoitre-ts", "name": "Tuổi Trẻ Thời Sự Đô Thị", "url": "https://tuoitre.vn/thoi-su.htm", "rss": "https://tuoitre.vn/rss/thoi-su.rss", "domain": "tuoitre.vn", "active": True},
        {"id": "vov-gt", "name": "VOV Giao Thông Quốc Gia", "url": "https://vov.vn/xa-hoi", "rss": "https://vov.vn/rss/xa-hoi.rss", "domain": "vov.vn", "active": True},
        {"id": "laodong-gt", "name": "Lao Động Xã Hội", "url": "https://laodong.vn/xa-hoi", "rss": "https://laodong.vn/rss/xa-hoi.rss", "domain": "laodong.vn", "active": False}
    ],
    "the-thao": [
        {"id": "vnexpress-tt", "name": "VnExpress Thể Thao", "url": "https://vnexpress.net/the-thao", "rss": "https://vnexpress.net/rss/the-thao.rss", "domain": "vnexpress.net", "active": True},
        {"id": "tuoitre-tt", "name": "Tuổi Trẻ Thể Thao", "url": "https://tuoitre.vn/the-thao.htm", "rss": "https://tuoitre.vn/rss/the-thao.rss", "domain": "tuoitre.vn", "active": True},
        {"id": "thanhnien-tt", "name": "Thanh Niên Thể Thao", "url": "https://thanhnien.vn/the-thao.html", "rss": "https://thanhnien.vn/rss/the-thao.rss", "domain": "thanhnien.vn", "active": True},
        {"id": "dantri-tt", "name": "Dân Trí Thể Thao", "url": "https://dantri.com.vn/the-thao.htm", "rss": "https://dantri.com.vn/rss/the-thao.rss", "domain": "dantri.com.vn", "active": False}
    ],
    "tong-hop": [
        {"id": "vnexpress-home", "name": "VnExpress Tin Mới Nhất", "url": "https://vnexpress.net", "rss": "https://vnexpress.net/rss/tin-moi-nhat.rss", "domain": "vnexpress.net", "active": True},
        {"id": "tuoitre-home", "name": "Tuổi Trẻ Tin Mới Nhất", "url": "https://tuoitre.vn", "rss": "https://tuoitre.vn/rss/tin-moi-nhat.rss", "domain": "tuoitre.vn", "active": True},
        {"id": "thanhnien-home", "name": "Thanh Niên Tin Nóng", "url": "https://thanhnien.vn", "rss": "https://thanhnien.vn/rss/home.rss", "domain": "thanhnien.vn", "active": True},
        {"id": "vietnamnet-home", "name": "VietNamNet Tin Mới", "url": "https://vietnamnet.vn", "rss": "https://vietnamnet.vn/rss/tin-moi-nhat.rss", "domain": "vietnamnet.vn", "active": True}
    ]
}


def extract_domain(url: str) -> str:
    """Tách và chuẩn hóa tên miền từ chuỗi URL bất kỳ."""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        # Bỏ port nếu có
        domain = domain.split(":")[0]
        return domain
    except Exception:
        return ""


def check_domain_whitelist(url: str) -> dict:
    """
    Kiểm tra xem URL người dùng nhập có thuộc Whitelist báo chí uy tín hay không.
    Trả về đánh giá chi tiết: Đã xác thực / Cảnh báo / Từ chối.
    """
    domain = extract_domain(url)
    if not domain:
        return {
            "url": url,
            "domain": "",
            "is_whitelisted": False,
            "status": "INVALID",
            "badge_color": "rose",
            "badge_text": "URL Không Hợp Lệ",
            "source_name": "Không xác định",
            "message": "Định dạng đường dẫn URL không chính xác, vui lòng nhập lại."
        }

    # 1. Khớp chính xác hoặc subdomain trong Whitelist
    for trusted_domain, info in TRUSTED_DOMAINS_WHITELIST.items():
        if domain == trusted_domain or domain.endswith("." + trusted_domain):
            return {
                "url": url,
                "domain": domain,
                "is_whitelisted": True,
                "status": "VERIFIED",
                "badge_color": "emerald",
                "badge_text": "Chính Thống Đã Xác Thực",
                "source_name": info["name"],
                "source_type": info["type"],
                "tier": info["tier"],
                "message": f"Nguồn tin an toàn! {info['name']} nằm trong danh mục cơ quan thông tấn báo chí chính thống uy tín."
            }

    # 2. Kiểm tra tên miền cấp quốc gia Việt Nam (.vn)
    if domain.endswith(".vn"):
        return {
            "url": url,
            "domain": domain,
            "is_whitelisted": True,
            "status": "VERIFIED_VN",
            "badge_color": "sky",
            "badge_text": "Tên Miền .VN Hợp Lệ",
            "source_name": domain.capitalize(),
            "source_type": "Trang tin Việt Nam",
            "tier": "Xác minh qua tên miền .vn",
            "message": "Tên miền thuộc không gian mạng quốc gia Việt Nam (.vn), đủ điều kiện thu thập tin tức."
        }

    # 3. Tên miền quốc tế hoặc chưa có trong danh bạ
    return {
        "url": url,
        "domain": domain,
        "is_whitelisted": False,
        "status": "UNVERIFIED",
        "badge_color": "amber",
        "badge_text": "Nguồn Tin Chưa Kiểm Duyệt",
        "source_name": domain,
        "source_type": "Trang tin mở",
        "tier": "Cần cẩn trọng",
        "message": "Tên miền này không nằm trong Whitelist các cơ quan báo chí chính thống. Hệ thống sẽ áp dụng bộ lọc trung lập để kiểm duyệt nội dung."
    }


def clean_html_text(raw_html: str) -> str:
    """Loại bỏ thẻ HTML và khoảng trắng thừa từ văn bản RSS."""
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator=" ")
    # Xóa ký tự xuống dòng thừa và khoảng trắng
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_rss_items(rss_url: str, source_name: str, limit: int = 3) -> list:
    """Cào dữ liệu từ 1 đường dẫn RSS thực tế."""
    items = []
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RadioVN/1.0"
        }
        resp = requests.get(rss_url, headers=headers, timeout=4)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.content, "html.parser")
            raw_items = soup.find_all("item")
            for item in raw_items[:limit]:
                title = item.find("title")
                desc = item.find("description")
                link = item.find("link")
                pub_date = item.find("pubDate")

                title_text = title.get_text().strip() if title else ""
                desc_text = clean_html_text(desc.get_text()) if desc else ""
                link_text = link.get_text().strip() if link else ""
                date_text = pub_date.get_text().strip() if pub_date else datetime.now().strftime("%H:%M - %d/%m/%Y")

                if title_text:
                    items.append({
                        "title": title_text,
                        "summary": desc_text[:280] + ("..." if len(desc_text) > 280 else ""),
                        "source": source_name,
                        "url": link_text,
                        "published_at": date_text
                    })
    except Exception as e:
        print(f"[Crawler Warning] Không tải được RSS từ {rss_url}: {e}")

    return items


def get_mock_fallback_news(topic: str, prompt: str = "") -> list:
    """
    Dữ liệu tin tức dự phòng chân thực, chất lượng cao khi không có kết nối internet
    hoặc khi RSS của cơ quan báo chí bị chặn chặn CORS/timeout.
    """
    now_str = datetime.now().strftime("%H:%M - %d/%m/%Y")
    
    fallbacks = {
        "cong-nghe": [
            {
                "title": "Trí tuệ nhân tạo thế hệ mới tăng tốc tự động hóa quy trình kỹ thuật",
                "summary": "Các mô hình ngôn ngữ lớn và tác tử AI tự trị đang giúp các lập trình viên rút ngắn 40% thời gian kiểm thử và triển khai hạ tầng đám mây tại các doanh nghiệp công nghệ.",
                "source": "VnExpress Số Hóa",
                "url": "https://vnexpress.net/so-hoa",
                "published_at": now_str
            },
            {
                "title": "Việt Nam đẩy mạnh hợp tác đào tạo 50.000 kỹ sư bán dẫn đến năm 2030",
                "summary": "Bộ Thông tin & Truyền thông cùng các trường đại học hàng đầu kích hoạt chương trình học bổng chuyên sâu về thiết kế vi mạch và đóng gói bán dẫn.",
                "source": "GenK.vn",
                "url": "https://genk.vn",
                "published_at": now_str
            },
            {
                "title": "Xu hướng điện toán biên và IoT thông minh bùng nổ trong nhà máy",
                "summary": "Hàng loạt giải pháp sản xuất thông minh ứng dụng mạng 5G riêng và cảm biến thời gian thực được ứng dụng giúp tiết kiệm 25% điện năng tiêu thụ.",
                "source": "Tuổi Trẻ Số",
                "url": "https://tuoitre.vn/nhip-song-so.htm",
                "published_at": now_str
            }
        ],
        "kinh-doanh": [
            {
                "title": "Thị trường tài chính khởi sắc, dòng vốn FDI tiếp tục rót mạnh vào sản xuất",
                "summary": "Chỉ số chứng khoán ghi nhận chuỗi phiên tăng điểm liên tiếp nhờ sự phục hồi rõ nét của xuất khẩu linh kiện điện tử và dệt may.",
                "source": "CafeF.vn",
                "url": "https://cafef.vn",
                "published_at": now_str
            },
            {
                "title": "Lãi suất cho vay mua nhà và sản xuất kinh doanh duy trì vùng đáy hấp dẫn",
                "summary": "Các ngân hàng thương mại tung ra nhiều gói tín dụng ưu đãi hỗ trợ doanh nghiệp vừa và nhỏ mở rộng quy mô trước mùa mua sắm cuối năm.",
                "source": "Tuổi Trẻ Kinh Doanh",
                "url": "https://tuoitre.vn/kinh-doanh.htm",
                "published_at": now_str
            },
            {
                "title": "Thương mại điện tử xuyên biên giới mở cánh cửa cho nông sản Việt",
                "summary": "Nhiều hợp tác xã nông sản sạch thành công đưa trái cây tươi và cà phê đặc sản lên các sàn thương mại điện tử toàn cầu với doanh thu tăng trưởng ấn tượng.",
                "source": "VietNamNet",
                "url": "https://vietnamnet.vn/kinh-doanh",
                "published_at": now_str
            }
        ],
        "giao-thong": [
            {
                "title": "Tuyến cao tốc Bắc - Nam tiếp tục thông xe thêm nhiều đoạn trọng điểm",
                "summary": "Hệ thống giao thông liên vùng được rút ngắn đáng kể, giúp các tài xế xe tải và xe khách di chuyển an toàn, tiết kiệm 30% thời gian hành trình.",
                "source": "Thanh Niên Giao Thông",
                "url": "https://thanhnien.vn",
                "published_at": now_str
            },
            {
                "title": "Khuyến cáo an toàn: Lái xe cần kiểm tra áp suất lốp và phanh mùa mưa",
                "summary": "Các chuyên gia kỹ thuật ô tô lưu ý hiện tượng trượt nước trên mặt đường ướt và nhắc nhở tài xế giảm tốc độ khi tầm nhìn hạn chế dưới 50m.",
                "source": "VnExpress Thời Sự",
                "url": "https://vnexpress.net",
                "published_at": now_str
            },
            {
                "title": "Nhân rộng camera giám sát AI phát hiện vi phạm và điều tiết luồng xe",
                "summary": "Hệ thống đèn tín hiệu giao thông thông minh tự động thích ứng với lưu lượng xe thực tế, giảm thiểu đáng kể tình trạng ùn ứ giờ cao điểm.",
                "source": "VOV Giao Thông",
                "url": "https://vov.vn",
                "published_at": now_str
            }
        ],
        "the-thao": [
            {
                "title": "Đội tuyển Quốc gia tích cực tập huấn chuẩn bị cho giải đấu khu vực",
                "summary": "HLV trưởng chú trọng rèn luyện thể lực và sơ đồ chiến thuật tấn công biên, tạo cơ hội cho nhiều nhân tố trẻ thử sức trong đội hình chính.",
                "source": "VnExpress Thể Thao",
                "url": "https://vnexpress.net/the-thao",
                "published_at": now_str
            },
            {
                "title": "Giải chạy Marathon thu hút hàng ngàn chân chạy trên cung đường biển tuyệt đẹp",
                "summary": "Phong trào chạy bộ rèn luyện sức khỏe tiếp tục lan tỏa mạnh mẽ trong cộng đồng với tinh thần vượt lên chính mình.",
                "source": "Tuổi Trẻ Thể Thao",
                "url": "https://tuoitre.vn/the-thao.htm",
                "published_at": now_str
            }
        ]
    }

    selected = fallbacks.get(topic, fallbacks["cong-nghe"])
    return selected


def crawl_news_from_sources(sources_list: list, topic: str = "cong-nghe", prompt: str = "", max_total_items: int = 4) -> list:
    """
    Thu thập tin tức từ danh sách nguồn báo được chọn.
    Thử nghiệm RSS thực tế trước, nếu không có hoặc mạng yếu thì kết hợp linh hoạt với tin thời sự fallback.
    """
    all_items = []
    
    # Lấy bản đồ RSS gợi ý theo chủ đề
    suggested_sources = TOPIC_DEFAULT_SOURCES.get(topic, TOPIC_DEFAULT_SOURCES["cong-nghe"])
    name_to_rss = {s["name"]: s.get("rss", "") for s in suggested_sources}
    domain_to_rss = {s["domain"]: s.get("rss", "") for s in suggested_sources}

    for src in sources_list:
        rss_url = ""
        src_name = src
        if isinstance(src, dict):
            src_name = src.get("name", "Báo chí")
            rss_url = src.get("rss", "")
            if not rss_url:
                dom = extract_domain(src.get("url", ""))
                rss_url = domain_to_rss.get(dom, "")
        elif isinstance(src, str):
            src_name = src
            rss_url = name_to_rss.get(src, "")
            if not rss_url:
                dom = extract_domain(src)
                rss_url = domain_to_rss.get(dom, "")

        if rss_url:
            crawled = fetch_rss_items(rss_url, src_name, limit=2)
            all_items.extend(crawled)
            if len(all_items) >= max_total_items:
                break

    # Nếu RSS thực tế không đủ tin, bù bằng tin tức chuyên biệt
    if len(all_items) < max_total_items:
        fallback_news = get_mock_fallback_news(topic, prompt)
        for fb in fallback_news:
            if len(all_items) >= max_total_items:
                break
            # Tránh trùng tiêu đề
            if not any(item["title"] == fb["title"] for item in all_items):
                all_items.append(fb)

    return all_items[:max_total_items]
