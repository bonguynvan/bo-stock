"""Single-user investment playbook (editable process notes)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends

from app.database import get_db
from app.models import Playbook, User
from app.routers.auth import get_current_user
from app.schemas.playbook import PlaybookOut, PlaybookUpdate
from app.schemas.stock import Envelope

router = APIRouter(prefix="/playbook", tags=["playbook"])

DEFAULT_CONTENT = """## Quy Trình Đầu Tư — V-Investment OS

Công cụ chỉ trình bày dữ liệu & phân tích khách quan để bạn TỰ quyết định — không khuyến nghị mua/bán. Đọc quy trình này trước mỗi lần cân nhắc, và luôn tìm thêm phương án trước khi xuống tiền.

## Bước 0 — Tìm ý tưởng (tab Screener / Nền tảng)
- Mở tab "Nền tảng vững" để có sẵn danh sách mã nền tảng tốt, hoặc
- Dùng bộ lọc nhanh trên Screener: "Rẻ so với lịch sử" / "Cổ tức cao" / "Tăng trưởng"
- Đặt bộ lọc: ROE > 15%, P/E < 20, Vốn hóa > 1.000 tỷ, sàn HOSE
- Sắp xếp theo cột "La bàn DH" (Compass dài hạn) — ưu tiên điểm cao
- Bấm ⭐ để lưu mã quan tâm vào danh sách theo dõi

## Bước 1 — Chất lượng nền tảng (đọc theo chuỗi, không phải 1 năm)
- ROE bền vững nhiều năm chứ không chỉ 1-2 năm đột biến?
- Trả cổ tức đều đặn qua các năm?
- Đòn bẩy Nợ/Vốn CSH ở mức thấp/an toàn?
- La bàn Dài hạn ≥ 65?

## Bước 2 — Định giá (rẻ/đắt so với chính nó & so với ngành)
- P/E hiện tại so với P/E trung bình 5 năm của chính mã (cột "P/E vs LS") — đang rẻ hơn lịch sử?
- Giá hiện tại nằm trong hay trên vùng giá trị ước tính (PE×EPS, PB×BVPS, Graham)?
- So sánh ngành: ROE / biên lợi nhuận vượt trội hay dưới trung vị ngành?

## Bước 3 — Đọc BCTC sâu (bấm "Hướng dẫn đọc" để xem chi tiết)
- Tải & phân tích 3-5 BCTC NĂM (kiểm toán) — đọc theo chuỗi để thấy xu hướng
- Xác nhận: doanh thu / LNST / dòng tiền HĐKD tăng đều, dòng tiền luôn dương
- Đọc BCTC QUÝ gần nhất — hiện trạng có đang đi đúng hướng so với cùng kỳ?
- Đọc "Tóm tắt để cân nhắc": điểm mạnh, điểm cần cân nhắc, câu hỏi cần tự trả lời

## Bước 4 — Tin tức & diễn biến gần đây
- Tin gần đây có red flag mới không (thay lãnh đạo, phát hành, kiện tụng, thay đổi cổ tức)?
- Các "Diễn biến gần đây" trong Tóm tắt đã được kiểm chứng với nguồn gốc chưa?

## Bước 5 — Hiểu công ty (Vòng tròn năng lực)
- Giải thích được mô hình kinh doanh trong 1 câu?
- Rủi ro lớn nhất là gì? Phụ thuộc vào khách hàng/đối tác nào?
- Ngành này mình có theo dõi được tin tức thường xuyên không?

## Bước 6 — Bối cảnh danh mục (tab Phân tích, trước khi mua)
- Thêm mã này có làm danh mục quá tập trung không? (1 mã > 25% hoặc 1 ngành > 40%)
- Danh mục đang so với VN-Index thế nào?
- Tỷ trọng dự kiến cho mã này đã hợp lý chưa?

## Bước 7 — Tìm thêm phương án & phản biện (TRƯỚC KHI ra quyết định)
- Đã trả lời hết "câu hỏi cần tự trả lời" chưa?
- Có mã KHÁC tốt hơn cho cùng mục tiêu không? So sánh ít nhất 2-3 lựa chọn
- Nếu luận điểm SAI thì dấu hiệu sẽ là gì? (điều kiện phủ định)
- Mức giá nào là quá đắt để mua? (kỷ luật giá, biên an toàn)
- Ghi Nhật ký: luận điểm, giá kỳ vọng, catalyst, điều kiện thoát
- Xuất báo cáo PDF để lưu lại & đọc lại sau

## Nhắc nhở
- Quyết định và rủi ro cuối cùng là của bạn — không có lệnh nào phải vội.
- Công cụ hỗ trợ nghiên cứu, không thay bạn quyết định.
"""


async def _get_or_create(db: AsyncSession, user_id: int) -> Playbook:
    row = (
        await db.execute(
            select(Playbook)
            .where(Playbook.user_id == user_id)
            .order_by(Playbook.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        row = Playbook(content=DEFAULT_CONTENT, user_id=user_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _to_out(row: Playbook) -> PlaybookOut:
    return PlaybookOut(
        content=row.content,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.get("", response_model=Envelope[PlaybookOut])
async def get_playbook(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[PlaybookOut]:
    return Envelope(data=_to_out(await _get_or_create(db, user.id)))


@router.put("", response_model=Envelope[PlaybookOut])
async def update_playbook(
    body: PlaybookUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[PlaybookOut]:
    row = await _get_or_create(db, user.id)
    row.content = body.content
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))
