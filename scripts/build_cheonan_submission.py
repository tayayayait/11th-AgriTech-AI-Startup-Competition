from __future__ import annotations

import html
import math
import os
import shutil
from pathlib import Path

from PIL import Image, ImageEnhance
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
ASSET_DIR = ROOT / "tmp" / "pdfs" / "cheonan-submission-assets"
OUTPUT_PDF = OUTPUT_DIR / "유창재_FieldGuardAI_천안형농업위험선제대응_통합본.pdf"

W, H = 960, 540

GREEN = colors.HexColor("#103F34")
DARK = colors.HexColor("#162B25")
MINT = colors.HexColor("#B9E3D1")
MINT_DARK = colors.HexColor("#16745F")
MINT_PALE = colors.HexColor("#EAF5EF")
OFFWHITE = colors.HexColor("#F7F8F5")
WHITE = colors.white
BLUE = colors.HexColor("#5A98B3")
BLUE_PALE = colors.HexColor("#EAF3F7")
ORANGE = colors.HexColor("#ECAA2E")
ORANGE_PALE = colors.HexColor("#FFF3D8")
RED = colors.HexColor("#D45C4E")
RED_DARK = colors.HexColor("#A83E35")
RED_PALE = colors.HexColor("#FBE9E6")
GRAY_900 = colors.HexColor("#1D2D28")
GRAY_700 = colors.HexColor("#536761")
GRAY_500 = colors.HexColor("#7C8F89")
GRAY_300 = colors.HexColor("#CDD8D3")
GRAY_200 = colors.HexColor("#E1E8E4")
GRAY_100 = colors.HexColor("#EEF2EF")


def register_fonts() -> None:
    regular_candidates = [
        Path(r"C:\Windows\Fonts\malgun.ttf"),
        Path(r"C:\Windows\Fonts\NanumGothic.ttf"),
    ]
    bold_candidates = [
        Path(r"C:\Windows\Fonts\malgunbd.ttf"),
        Path(r"C:\Windows\Fonts\NanumGothicBold.ttf"),
    ]

    regular = next(path for path in regular_candidates if path.exists())
    bold = next(path for path in bold_candidates if path.exists())
    pdfmetrics.registerFont(TTFont("Korean", str(regular)))
    pdfmetrics.registerFont(TTFont("Korean-Bold", str(bold)))


def rgb(value: colors.Color) -> tuple[int, int, int]:
    return tuple(round(component * 255) for component in (value.red, value.green, value.blue))


def make_assets() -> dict[str, Path]:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    deck_dir = ROOT / "tmp" / "pdfs" / "prior-deck"
    crops = {
        "dashboard": (deck_dir / "page-05.png", (72, 205, 968, 730)),
        "tasks": (deck_dir / "page-06.png", (0, 198, 967, 785)),
        "diagnosis": (deck_dir / "page-07.png", (47, 205, 691, 659)),
        "consult": (deck_dir / "page-07.png", (719, 204, 1381, 658)),
        "pesticide": (deck_dir / "page-08.png", (52, 186, 1415, 706)),
    }

    results: dict[str, Path] = {}
    for name, (source, box) in crops.items():
        if not source.exists():
            raise FileNotFoundError(f"Rendered prior-deck page is missing: {source}")
        image = Image.open(source).convert("RGB").crop(box)
        image = ImageEnhance.Sharpness(image).enhance(1.15)
        target = ASSET_DIR / f"{name}.jpg"
        image.save(target, "JPEG", quality=91, optimize=True)
        results[name] = target

    map_source = ROOT / "field-new-farmmap-ui-final.png"
    if not map_source.exists():
        raise FileNotFoundError(f"Farmmap screenshot is missing: {map_source}")
    map_image = Image.open(map_source).convert("RGB")
    map_target = ASSET_DIR / "farmmap.jpg"
    map_image.save(map_target, "JPEG", quality=88, optimize=True)
    results["farmmap"] = map_target

    return results


def paragraph(
    c: canvas.Canvas,
    value: str,
    x: float,
    y_top: float,
    width: float,
    *,
    size: float = 12,
    leading: float | None = None,
    color: colors.Color = GRAY_900,
    font: str = "Korean",
    align: int = TA_LEFT,
    max_height: float = 1000,
) -> float:
    style = ParagraphStyle(
        name="p",
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.35,
        textColor=color,
        alignment=align,
        wordWrap="CJK",
        splitLongWords=True,
        allowWidows=0,
        allowOrphans=0,
        spaceAfter=0,
        spaceBefore=0,
    )
    safe = html.escape(value).replace("\n", "<br/>")
    flowable = Paragraph(safe, style)
    _, height = flowable.wrap(width, max_height)
    flowable.drawOn(c, x, y_top - height)
    return height


def rich_paragraph(
    c: canvas.Canvas,
    markup: str,
    x: float,
    y_top: float,
    width: float,
    *,
    size: float = 12,
    leading: float | None = None,
    color: colors.Color = GRAY_900,
    font: str = "Korean",
    align: int = TA_LEFT,
    max_height: float = 1000,
) -> float:
    style = ParagraphStyle(
        name="rich",
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.35,
        textColor=color,
        alignment=align,
        wordWrap="CJK",
        splitLongWords=True,
        allowWidows=0,
        allowOrphans=0,
    )
    flowable = Paragraph(markup, style)
    _, height = flowable.wrap(width, max_height)
    flowable.drawOn(c, x, y_top - height)
    return height


def rounded_rect(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    fill: colors.Color = WHITE,
    stroke: colors.Color | None = None,
    radius: float = 12,
    line_width: float = 1,
) -> None:
    c.saveState()
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(line_width)
    c.roundRect(x, y, width, height, radius, fill=1, stroke=1 if stroke else 0)
    c.restoreState()


def pill(
    c: canvas.Canvas,
    label: str,
    x: float,
    y: float,
    width: float,
    *,
    fill: colors.Color = MINT_PALE,
    color: colors.Color = MINT_DARK,
    size: float = 9,
) -> None:
    rounded_rect(c, x, y, width, 23, fill=fill, radius=11.5)
    c.setFillColor(color)
    c.setFont("Korean-Bold", size)
    c.drawCentredString(x + width / 2, y + 7.2, label)


def draw_title(
    c: canvas.Canvas,
    kicker: str,
    title: str,
    subtitle: str | None = None,
    *,
    page_no: int,
    title_size: float = 29,
) -> None:
    c.setFillColor(OFFWHITE)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(MINT_DARK)
    c.setFont("Korean-Bold", 9)
    c.drawString(44, 503, kicker)
    paragraph(
        c,
        title,
        44,
        480,
        870,
        size=title_size,
        leading=title_size * 1.13,
        font="Korean-Bold",
        color=DARK,
    )
    if subtitle:
        paragraph(c, subtitle, 44, 428, 870, size=11.5, color=GRAY_700)
    c.setFillColor(GRAY_500)
    c.setFont("Korean", 7.5)
    c.drawString(44, 19, "FIELDGUARD AI  ·  2026 천안시 AI·데이터 기반 정책 아이디어 경진대회")
    c.drawRightString(916, 19, f"{page_no:02d}")


def draw_image_cover(
    c: canvas.Canvas,
    path: Path,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    radius: float = 10,
    border: colors.Color = GRAY_200,
    position: str = "center",
) -> None:
    image = Image.open(path)
    iw, ih = image.size
    scale = max(width / iw, height / ih)
    sw, sh = width / scale, height / scale
    if position == "top":
        left = 0
        top = 0
    else:
        left = max(0, (iw - sw) / 2)
        top = max(0, (ih - sh) / 2)
    crop = image.crop((left, top, left + sw, top + sh)).convert("RGB")
    temp = ASSET_DIR / f"_fit_{path.stem}_{round(width)}x{round(height)}_{position}.jpg"
    crop.save(temp, "JPEG", quality=90, optimize=True)

    c.saveState()
    path_obj = c.beginPath()
    path_obj.roundRect(x, y, width, height, radius)
    c.clipPath(path_obj, stroke=0, fill=0)
    c.drawImage(ImageReader(str(temp)), x, y, width=width, height=height, mask="auto")
    c.restoreState()
    c.setStrokeColor(border)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, radius, fill=0, stroke=1)


def link_text(
    c: canvas.Canvas,
    label: str,
    url: str,
    x: float,
    y: float,
    *,
    size: float = 9,
    color: colors.Color = BLUE,
) -> None:
    c.setFillColor(color)
    c.setFont("Korean", size)
    c.drawString(x, y, label)
    width = pdfmetrics.stringWidth(label, "Korean", size)
    c.linkURL(url, (x, y - 2, x + width, y + size + 2), relative=0)


def draw_metric_card(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    value: str,
    label: str,
    note: str,
    *,
    accent: colors.Color = MINT_DARK,
) -> None:
    rounded_rect(c, x, y, width, height, fill=WHITE, stroke=GRAY_200, radius=12)
    c.setFillColor(accent)
    c.setFont("Korean-Bold", 28)
    c.drawString(x + 16, y + height - 38, value)
    paragraph(c, label, x + 16, y + height - 49, width - 32, size=11, font="Korean-Bold")
    paragraph(c, note, x + 16, y + 36, width - 32, size=8.5, color=GRAY_700)


def draw_data_table(
    c: canvas.Canvas,
    *,
    x: float,
    y_top: float,
    widths: list[float],
    headers: list[str],
    rows: list[list[str]],
    row_heights: list[float],
    font_size: float = 8.1,
) -> None:
    header_h = 31
    total_w = sum(widths)
    c.setFillColor(GREEN)
    c.roundRect(x, y_top - header_h, total_w, header_h, 7, fill=1, stroke=0)
    cursor_x = x
    for header, width in zip(headers, widths):
        paragraph(
            c,
            header,
            cursor_x + 8,
            y_top - 8,
            width - 16,
            size=8.5,
            leading=10.5,
            color=WHITE,
            font="Korean-Bold",
        )
        cursor_x += width

    cursor_y = y_top - header_h
    for row_idx, (row, row_h) in enumerate(zip(rows, row_heights)):
        fill = WHITE if row_idx % 2 == 0 else colors.HexColor("#F0F5F2")
        c.setFillColor(fill)
        c.rect(x, cursor_y - row_h, total_w, row_h, fill=1, stroke=0)
        cursor_x = x
        for col_idx, (cell, width) in enumerate(zip(row, widths)):
            paragraph(
                c,
                cell,
                cursor_x + 8,
                cursor_y - 8,
                width - 16,
                size=font_size if col_idx else font_size + 0.3,
                leading=font_size * 1.28,
                color=GRAY_900 if col_idx != 3 else GRAY_700,
                font="Korean-Bold" if col_idx == 0 else "Korean",
                max_height=row_h - 12,
            )
            cursor_x += width
        c.setStrokeColor(GRAY_200)
        c.setLineWidth(0.5)
        c.line(x, cursor_y - row_h, x + total_w, cursor_y - row_h)
        cursor_y -= row_h

    cursor_x = x
    c.setStrokeColor(GRAY_200)
    c.setLineWidth(0.5)
    for width in widths:
        c.line(cursor_x, y_top - header_h, cursor_x, cursor_y)
        cursor_x += width
    c.line(x + total_w, y_top - header_h, x + total_w, cursor_y)
    c.roundRect(x, cursor_y, total_w, y_top - cursor_y, 7, fill=0, stroke=1)


def add_cover(c: canvas.Canvas) -> None:
    c.setFillColor(GREEN)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Soft contour-like field lines.
    c.saveState()
    c.setStrokeColor(colors.Color(1, 1, 1, alpha=0.08))
    c.setLineWidth(1.1)
    for offset in range(-120, 900, 48):
        path = c.beginPath()
        path.moveTo(offset, 0)
        path.curveTo(offset + 130, 135, offset - 45, 300, offset + 190, 540)
        c.drawPath(path, stroke=1, fill=0)
    c.restoreState()

    pill(c, "TRACK 04 · 농림/축산", 52, 474, 144, fill=MINT, color=GREEN, size=9)
    c.setFillColor(WHITE)
    c.setFont("Korean-Bold", 43)
    c.drawString(52, 380, "천안의 농업 위험을,")
    c.setFillColor(MINT)
    c.drawString(52, 325, "오늘의 작업으로 바꿉니다.")

    paragraph(
        c,
        "천안형 필지 맞춤 농업위험 선제대응 서비스",
        54,
        272,
        610,
        size=18,
        font="Korean-Bold",
        color=WHITE,
    )
    paragraph(
        c,
        "공공데이터 · 설명 가능한 위험 산정 · 현장 작업 카드 · 공식 근거 연결",
        54,
        239,
        650,
        size=11.5,
        color=colors.HexColor("#D8ECE4"),
    )

    rounded_rect(c, 52, 74, 850, 92, fill=colors.Color(1, 1, 1, alpha=0.08), radius=14)
    c.setFillColor(MINT)
    c.setFont("Korean-Bold", 15)
    c.drawString(73, 132, "FIELDGUARD AI")
    c.setFillColor(WHITE)
    c.setFont("Korean", 10.5)
    c.drawString(73, 105, "데이터 분석 기획서 및 시각화 통합본  ·  참가자 유창재  ·  2026.08")
    c.drawRightString(880, 105, "천안시 정책 적용안")
    c.showPage()


def add_cheonan_context(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "01  지역 문제를 데이터로 정의",
        "천안 농업 관련 지목 155.57㎢, 도시 면적의 24.5%",
        "2025년 9월 천안시 공식 농업 통계에서 전·답·과수원을 합산했습니다.",
        page_no=2,
    )

    draw_metric_card(c, 44, 293, 215, 112, "155.57㎢", "농업 관련 지목", "전 50.38 + 답 90.16 + 과수원 15.03", accent=MINT_DARK)
    draw_metric_card(c, 274, 293, 215, 112, "24.5%", "천안시 면적 중 비중", "155.57 ÷ 636.13 × 100", accent=BLUE)
    draw_metric_card(c, 504, 293, 215, 112, "12개", "읍·면 정책 확장 단위", "4개 읍 + 8개 면", accent=ORANGE)
    draw_metric_card(c, 734, 293, 182, 112, "90.16㎢", "답(논)", "농업 관련 지목의 58.0%", accent=RED)

    c.setFillColor(GRAY_900)
    c.setFont("Korean-Bold", 12)
    c.drawString(44, 261, "농업 관련 지목 구성")
    bars = [("답", 90.16, MINT_DARK), ("전", 50.38, BLUE), ("과수원", 15.03, ORANGE)]
    max_value = 100
    for idx, (label, value, color) in enumerate(bars):
        y = 222 - idx * 44
        c.setFillColor(GRAY_700)
        c.setFont("Korean-Bold", 10)
        c.drawString(44, y + 7, label)
        c.setFillColor(GRAY_200)
        c.roundRect(92, y, 560, 21, 10.5, fill=1, stroke=0)
        c.setFillColor(color)
        c.roundRect(92, y, 560 * value / max_value, 21, 10.5, fill=1, stroke=0)
        c.setFillColor(GRAY_900)
        c.setFont("Korean-Bold", 10)
        c.drawString(666, y + 6, f"{value:.2f}㎢")
    paragraph(
        c,
        "정책 질문  |  넓고 분산된 농지를 ‘시 전체 평균’이 아니라 필지·작물·시간대별 위험 우선순위로 어떻게 바꿀 것인가?",
        44,
        89,
        872,
        size=11.5,
        leading=16,
        font="Korean-Bold",
        color=GREEN,
    )
    paragraph(
        c,
        "출처: 천안시 공식 농업·행정 통계(2025.09/공표 기준). 단순 합산·비율은 본 기획서 계산.",
        44,
        51,
        872,
        size=7.8,
        color=GRAY_500,
    )
    c.showPage()


def add_problem(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "02  정책 문제",
        "정보는 많지만, 농가가 먼저 할 일은 흩어져 있습니다.",
        "기상·영농·병해충·농약 정보가 서로 다른 기준과 화면에 있어 현장 판단 비용이 커집니다.",
        page_no=3,
    )

    rounded_rect(c, 44, 122, 398, 286, fill=WHITE, stroke=GRAY_200, radius=16)
    pill(c, "현재", 64, 363, 58, fill=GRAY_100, color=GRAY_700)
    current = [
        ("01", "기상 수치 확인", "강수·기온·풍속·습도를 따로 해석"),
        ("02", "영농자료 탐색", "작물·시기별 작업 정보를 다시 검색"),
        ("03", "병해충 후보 확인", "사진과 공식 도감을 별도 비교"),
        ("04", "농약 기준 재확인", "등록 여부·희석배수·수확 전 기준 확인"),
    ]
    for idx, (num, title, note) in enumerate(current):
        y = 320 - idx * 58
        pill(c, num, 64, y, 38, fill=GRAY_100, color=GRAY_700, size=8)
        paragraph(c, title, 116, y + 21, 135, size=10.3, font="Korean-Bold")
        paragraph(c, note, 252, y + 21, 164, size=8.3, color=GRAY_700)

    rounded_rect(c, 470, 122, 446, 286, fill=GREEN, radius=16)
    pill(c, "제안", 492, 363, 58, fill=MINT, color=GREEN)
    c.setFillColor(WHITE)
    c.setFont("Korean-Bold", 18)
    c.drawString(492, 326, "필지 단위 ‘오늘의 작업 카드’")
    proposal = [
        "무엇부터 할지  |  위험 우선순위",
        "현장에서 볼 것  |  확인 체크리스트",
        "왜 필요한지     |  기상·공식자료 근거",
        "다음 판단에 남길 것  |  완료 기록",
    ]
    for idx, line in enumerate(proposal):
        y = 287 - idx * 36
        c.setFillColor(MINT if idx < 3 else ORANGE)
        c.circle(503, y + 5, 4.2, fill=1, stroke=0)
        paragraph(c, line, 517, y + 13, 370, size=10.2, color=WHITE if idx < 3 else ORANGE_PALE)
    rounded_rect(c, 492, 130, 401, 32, fill=colors.Color(1, 1, 1, alpha=0.09), radius=9)
    paragraph(c, "정보 확인 → 실행 → 기록까지 한 흐름", 512, 154, 360, size=10.5, font="Korean-Bold", color=MINT)

    paragraph(
        c,
        "정책 목표  |  위험을 ‘예측 점수’로 끝내지 않고, 근거가 연결된 행동과 기록으로 전환한다.",
        44,
        92,
        872,
        size=12,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_policy_model(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "03  제안 서비스와 정책 운영",
        "농가 화면은 실행을 돕고, 행정 화면은 지원 우선순위를 만듭니다.",
        "현재 구현된 농가 기능을 기반으로 천안시 농업기술센터용 익명·집계 운영 화면을 확장합니다.",
        page_no=4,
    )

    left_x, right_x = 44, 511
    rounded_rect(c, left_x, 117, 421, 289, fill=WHITE, stroke=GRAY_200, radius=16)
    rounded_rect(c, right_x, 117, 405, 289, fill=MINT_PALE, stroke=MINT, radius=16)
    pill(c, "현재 구현", left_x + 20, 361, 87, fill=GREEN, color=WHITE)
    pill(c, "정책 확장안", right_x + 20, 361, 94, fill=ORANGE_PALE, color=colors.HexColor("#9B6A09"))

    paragraph(c, "농가용 FieldGuard AI", left_x + 20, 330, 375, size=17, font="Korean-Bold", color=GREEN)
    farmer_steps = [
        ("1", "필지 등록", "Farmmap 기반 PNU·좌표·면적"),
        ("2", "위험 확인", "기상·병해충 확인 우선순위"),
        ("3", "작업 실행", "체크리스트·공식 근거·완료 기록"),
        ("4", "안전 확인", "사진 후보·PSIS 등록기준·상담"),
    ]
    for idx, (num, title, note) in enumerate(farmer_steps):
        y = 281 - idx * 45
        c.setFillColor(MINT_DARK)
        c.circle(left_x + 31, y + 6, 11, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Korean-Bold", 8.5)
        c.drawCentredString(left_x + 31, y + 3, num)
        paragraph(c, title, left_x + 52, y + 18, 98, size=10.2, font="Korean-Bold")
        paragraph(c, note, left_x + 148, y + 18, 235, size=8.4, color=GRAY_700)

    paragraph(c, "천안시 농업기술센터 운영", right_x + 20, 330, 360, size=17, font="Korean-Bold", color=GREEN)
    center_steps = [
        ("A", "읍·면 위험 분포", "개인 필지 비공개, 권역별 집계"),
        ("B", "지원 우선순위", "반복·복합 위험이 큰 작물·권역"),
        ("C", "현장지도 연계", "공식자료·교육·상담 자원 연결"),
        ("D", "정책 성과", "알림→작업→완료 전환율 측정"),
    ]
    for idx, (num, title, note) in enumerate(center_steps):
        y = 281 - idx * 45
        c.setFillColor(ORANGE)
        c.circle(right_x + 31, y + 6, 11, fill=1, stroke=0)
        c.setFillColor(GREEN)
        c.setFont("Korean-Bold", 8.5)
        c.drawCentredString(right_x + 31, y + 3, num)
        paragraph(c, title, right_x + 52, y + 18, 108, size=10.2, font="Korean-Bold")
        paragraph(c, note, right_x + 160, y + 18, 218, size=8.4, color=GRAY_700)

    c.setStrokeColor(MINT_DARK)
    c.setLineWidth(2)
    c.line(465, 250, 503, 250)
    c.line(495, 256, 503, 250)
    c.line(495, 244, 503, 250)
    paragraph(c, "익명 집계", 468, 237, 35, size=7.5, color=MINT_DARK, font="Korean-Bold", align=TA_CENTER)

    paragraph(
        c,
        "운영 원칙  |  농가의 정확한 위치·사진·상담 내용은 동의와 권한에 따라 보호하고, 행정에는 최소 단위 집계만 제공합니다.",
        44,
        85,
        872,
        size=10.5,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_data_plan_spatial(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "04  데이터 분석 기획 ①",
        "지역·필지·기상을 합쳐 ‘어디에, 언제’ 위험한지 계산합니다.",
        "모든 원천은 공식 페이지 또는 합법적 API를 사용하고, 수집시점·주요 컬럼·URL을 함께 기록합니다.",
        page_no=5,
        title_size=27,
    )
    rows = [
        [
            "팜맵(Farmmap)",
            "API 요청시점\n선택 필지",
            "PNU, 중심좌표, 면적,\n지목·공간 도형",
            "농림수산식품교육문화정보원 공식 안내\nhttps://agis.epis.or.kr/ASD/guide/faq.do?bbsSn=3",
        ],
        [
            "기상청 단기예보",
            "실시간·단기예보\n발표/예보시각",
            "격자좌표, 강수, 기온,\n풍속, 습도, 예보시각",
            "공공데이터포털 공식 OpenAPI\nhttps://www.data.go.kr/data/15084084/openapi.do",
        ],
    ]
    draw_data_table(
        c,
        x=44,
        y_top=397,
        widths=[137, 115, 220, 400],
        headers=["데이터", "수집 시점·범위", "주요 컬럼·가공", "출처 URL·이용 원칙"],
        rows=rows,
        row_heights=[88, 88],
        font_size=7.8,
    )
    rounded_rect(c, 44, 118, 872, 65, fill=WHITE, stroke=GRAY_200, radius=12)
    paragraph(c, "결합 기준", 62, 164, 83, size=9, font="Korean-Bold", color=GREEN)
    paragraph(c, "PNU·좌표 → 기상청 격자 변환 → 필지별 최신 관측·예보 연결", 153, 164, 330, size=8.5, color=GRAY_700)
    paragraph(c, "보존 기준", 517, 164, 83, size=9, font="Korean-Bold", color=GREEN)
    paragraph(c, "원천값·변환값·수집시각을 함께 저장하여 재현 가능하게 관리", 608, 164, 280, size=8.5, color=GRAY_700)
    paragraph(
        c,
        "결합키  |  PNU·좌표 → 기상청 격자 변환 → 필지별 최신 관측/예보를 연결합니다. 원천값·변환값·수집시각을 함께 보존합니다.",
        44,
        91,
        872,
        size=9.5,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_data_plan_agronomy(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "04  데이터 분석 기획 ②",
        "영농·병해충·농약 데이터는 행동의 근거와 안전기준을 보강합니다.",
        "생성형 AI는 원천데이터가 아니라 공식 후보를 정리하는 해석 계층으로 제한합니다.",
        page_no=6,
        title_size=27,
    )
    rows = [
        [
            "농사로 영농기술",
            "최신·주간자료\n작물/시기",
            "작물, 기간, 작업,\n자료명, 원문 URL",
            "농촌진흥청 공식 OpenAPI\nhttps://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00191",
        ],
        [
            "NCPMS 병해충",
            "현재 카탈로그\n작물별 조회",
            "cropCode, 후보 ID,\n공식 이미지·상세",
            "국가농작물병해충관리시스템\nhttps://ncpms.rda.go.kr/\n※ 카탈로그 수는 발생 건수로 해석하지 않음",
        ],
        [
            "PSIS 농약안전정보",
            "현재 등록정보\n후보별 조회",
            "작물, 병해충, 제품/성분,\n희석배수, 살포·수확 전 기준",
            "농촌진흥청 농약안전정보시스템\nhttps://psis.rda.go.kr/psis/\n※ 등록정보 확인이 추천보다 우선",
        ],
        [
            "Gemini 해석 계층",
            "사용자 요청시\n구조화 출력",
            "공식 후보 필터, 설명,\n사진 관찰요약·상담요약",
            "Google 공식 문서\nhttps://ai.google.dev/gemini-api/docs\n※ 독립 근거·확정 진단·처방으로 사용하지 않음",
        ],
    ]
    draw_data_table(
        c,
        x=44,
        y_top=397,
        widths=[137, 115, 220, 400],
        headers=["데이터", "수집 시점·범위", "주요 컬럼·가공", "출처 URL·이용 원칙"],
        rows=rows,
        row_heights=[65, 70, 70, 70],
        font_size=7.65,
    )
    paragraph(
        c,
        "추적 필드  |  sourceId · sourceTitle · sourceUrl · fetchedAt · 원천/정규화 버전을 작업 카드와 함께 저장합니다.",
        44,
        80,
        872,
        size=9.5,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_pipeline(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "05  분석 설계",
        "원천 → 정규화 → 위험 산정 → 행동 카드까지 근거를 끊지 않습니다.",
        "점수만 남기지 않고 어떤 값과 공식자료가 어떤 행동을 만들었는지 재현 가능하게 설계했습니다.",
        page_no=7,
        title_size=27,
    )

    stages = [
        ("01", "필지 선택", "Farmmap\nPNU·좌표·면적", MINT_PALE, MINT_DARK),
        ("02", "공간 변환", "위·경도 →\n기상청 격자", BLUE_PALE, BLUE),
        ("03", "조건 결합", "기상 관측·예보\n작물·시기", ORANGE_PALE, colors.HexColor("#A36B00")),
        ("04", "위험 산정", "규칙 기반\n확인 우선순위", RED_PALE, RED),
        ("05", "근거 보강", "농사로·NCPMS\nPSIS", MINT_PALE, MINT_DARK),
        ("06", "행동 카드", "우선순위·체크\n근거·완료기록", GREEN, WHITE),
    ]
    start_x = 44
    gap = 12
    box_w = 134
    box_h = 142
    for idx, (num, name, note, fill, accent) in enumerate(stages):
        x = start_x + idx * (box_w + gap)
        rounded_rect(c, x, 243, box_w, box_h, fill=fill, stroke=GRAY_200 if idx != 5 else GREEN, radius=14)
        pill(c, num, x + 14, 346, 38, fill=accent if idx != 5 else MINT, color=WHITE if idx != 5 else GREEN, size=8)
        paragraph(c, name, x + 14, 329, box_w - 28, size=12, font="Korean-Bold", color=accent)
        paragraph(c, note, x + 14, 291, box_w - 28, size=9, leading=13, color=GRAY_700 if idx != 5 else WHITE)
        if idx < len(stages) - 1:
            c.setStrokeColor(GRAY_500)
            c.setLineWidth(1.2)
            ax = x + box_w + 2
            c.line(ax, 313, ax + 8, 313)
            c.line(ax + 4, 317, ax + 8, 313)
            c.line(ax + 4, 309, ax + 8, 313)

    rounded_rect(c, 44, 116, 872, 102, fill=WHITE, stroke=GRAY_200, radius=14)
    c.setFillColor(GREEN)
    c.setFont("Korean-Bold", 12)
    c.drawString(64, 187, "데이터 계보(lineage)")
    lineage = [
        ("RAW", "원천 응답·수집시각"),
        ("NORMALIZED", "단위·좌표·코드 정규화"),
        ("DERIVED", "요인점수·종합점수·위험등급"),
        ("PRESENTED", "작업 카드·근거 링크·완료 상태"),
    ]
    lx = 64
    for idx, (title, note) in enumerate(lineage):
        width = 188
        rounded_rect(c, lx, 137, width, 39, fill=GRAY_100 if idx < 3 else MINT_PALE, radius=8)
        c.setFillColor(MINT_DARK if idx < 3 else GREEN)
        c.setFont("Korean-Bold", 7.5)
        c.drawString(lx + 10, 159, title)
        paragraph(c, note, lx + 10, 153, width - 20, size=7.6, color=GRAY_700)
        if idx < 3:
            c.setStrokeColor(GRAY_500)
            c.line(lx + width + 3, 156, lx + width + 15, 156)
        lx += 208
    paragraph(
        c,
        "분석 단위  |  필지 × 기준시각 × 작물. 동일 필지라도 시각과 작물이 달라지면 별도 판단으로 기록합니다.",
        44,
        92,
        872,
        size=9.5,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_scoring(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "06  설명 가능한 위험 산정",
        "가장 큰 위험에 복합요인의 25%를 더해 확인 우선순위를 만듭니다.",
        "이 점수는 재해 발생확률이 아니라, 현장 확인 순서를 정하기 위한 규칙 기반 지표입니다.",
        page_no=8,
        title_size=27,
    )

    rounded_rect(c, 44, 132, 350, 268, fill=GREEN, radius=16)
    pill(c, "실제 코드 기반", 66, 358, 104, fill=MINT, color=GREEN)
    paragraph(c, "종합점수", 66, 329, 280, size=13, font="Korean-Bold", color=WHITE)
    rich_paragraph(
        c,
        "<b>min(100, 최고 요인점수<br/>+ 0.25 × 나머지 요인점수 합)</b>",
        66,
        297,
        288,
        size=16,
        leading=23,
        color=MINT,
        font="Korean",
    )
    levels = [
        ("낮음", "0–39", MINT),
        ("주의", "40–69", BLUE),
        ("높음", "70–89", ORANGE),
        ("심각", "90–100", RED),
    ]
    for idx, (label, score, color) in enumerate(levels):
        x = 66 + (idx % 2) * 143
        y = 198 - (idx // 2) * 51
        rounded_rect(c, x, y, 132, 39, fill=colors.Color(1, 1, 1, alpha=0.08), radius=8)
        c.setFillColor(color)
        c.circle(x + 15, y + 19.5, 4, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Korean-Bold", 9)
        c.drawString(x + 27, y + 21, label)
        c.setFont("Korean", 8.5)
        c.drawString(x + 27, y + 8, score)

    rounded_rect(c, 420, 132, 496, 268, fill=WHITE, stroke=GRAY_200, radius=16)
    c.setFillColor(GREEN)
    c.setFont("Korean-Bold", 12)
    c.drawString(440, 371, "기상 요인별 점수 기준")
    headers = ["요인", "기준값 → 점수"]
    rows = [
        ["강수", "20mm→55 · 30→70 · 50→80 · 80→90"],
        ["고온", "33℃→55 · 35→75 · 38→90"],
        ["저온", "0℃→55 · -5→75 · -10→90"],
        ["풍속", "6m/s→45 · 9→70 · 14→90"],
        ["습도", "80%→40 · 85→55 · 95→75"],
    ]
    draw_data_table(
        c,
        x=440,
        y_top=351,
        widths=[82, 382],
        headers=headers,
        rows=rows,
        row_heights=[35, 35, 35, 35, 35],
        font_size=8.6,
    )
    paragraph(
        c,
        "코드 근거  |  src/domain/weather/weatherRisk.ts · src/domain/risk/risk.ts",
        44,
        94,
        872,
        size=9.3,
        font="Korean-Bold",
        color=GREEN,
    )
    paragraph(
        c,
        "병해충 확인 우선순위는 기상 위험·요인·공식 후보 근거를 조합하되, NCPMS 후보 수 자체는 발생 위험으로 가산하지 않습니다.",
        44,
        72,
        872,
        size=8.5,
        color=GRAY_700,
    )
    c.showPage()


def add_scenario_chart(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "07  코드 재현 시나리오 시각화",
        "복합 강수·습도 조건은 단일 고온보다 높은 확인 우선순위를 만듭니다.",
        "아래 값은 관측 통계가 아니라 현재 프로그램의 점수 로직을 동일 입력으로 재실행한 시나리오입니다.",
        page_no=9,
        title_size=27,
    )
    scenarios = [
        ("정상 조건", "위험 요인 없음", 0, MINT_DARK),
        ("강풍", "풍속 10m/s", 70, BLUE),
        ("고온", "기온 35℃", 75, ORANGE),
        ("강수+고습", "강수 50mm · 습도 95%", 99, RED),
        ("복합 위험", "강수 30mm · 34℃ · 10m/s · 90%", 100, RED_DARK),
    ]

    chart_x = 240
    chart_w = 610
    y0 = 345
    row_gap = 56
    for idx, (name, inputs, score, color) in enumerate(scenarios):
        y = y0 - idx * row_gap
        paragraph(c, name, 44, y + 17, 90, size=10.3, font="Korean-Bold")
        paragraph(c, inputs, 116, y + 17, 116, size=7.8, leading=10, color=GRAY_700, align=TA_RIGHT)
        c.setFillColor(GRAY_200)
        c.roundRect(chart_x, y, chart_w, 21, 10.5, fill=1, stroke=0)
        if score:
            c.setFillColor(color)
            c.roundRect(chart_x, y, chart_w * score / 100, 21, 10.5, fill=1, stroke=0)
        c.setFillColor(color)
        c.setFont("Korean-Bold", 10)
        c.drawString(chart_x + chart_w + 12, y + 6, f"{score}")

    # Scale and level bands.
    scale_y = 85
    c.setStrokeColor(GRAY_300)
    c.setLineWidth(0.8)
    for tick in [0, 40, 70, 90, 100]:
        x = chart_x + chart_w * tick / 100
        c.line(x, 100, x, 113)
        c.setFillColor(GRAY_500)
        c.setFont("Korean", 7.5)
        c.drawCentredString(x, scale_y, str(tick))
    bands = [
        (0, 40, MINT_PALE, "낮음"),
        (40, 70, BLUE_PALE, "주의"),
        (70, 90, ORANGE_PALE, "높음"),
        (90, 100, RED_PALE, "심각"),
    ]
    for start, end, fill, label in bands:
        x = chart_x + chart_w * start / 100
        width = chart_w * (end - start) / 100
        c.setFillColor(fill)
        c.rect(x, 114, width, 16, fill=1, stroke=0)
        c.setFillColor(GRAY_700)
        c.setFont("Korean-Bold", 7)
        c.drawCentredString(x + width / 2, 119, label)

    paragraph(
        c,
        "해석  |  단일 수치보다 여러 위험요인이 동시에 나타날 때 현장 확인 순서를 앞당기는 구조입니다.",
        44,
        61,
        872,
        size=9.2,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_action_matrix(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "08  분석 결과를 정책 행동으로 전환",
        "같은 점수라도 위험 원인에 따라 확인 항목과 공식 근거가 달라집니다.",
        "작업 카드는 처방이 아니라, 농가가 먼저 확인하고 공식 기준으로 판단하도록 돕는 안전한 안내입니다.",
        page_no=10,
        title_size=27,
    )

    cards = [
        (
            "강수·고습",
            "배수로·저지대·시설 유입 확인",
            "병징 촬영, 잎 뒷면·포장 습윤상태 기록",
            "기상청 + 농사로 + NCPMS",
            BLUE_PALE,
            BLUE,
        ),
        (
            "고온",
            "관수 상태·차광·환기설비 확인",
            "작물별 고온기 관리자료 원문 확인",
            "기상청 + 농사로",
            ORANGE_PALE,
            colors.HexColor("#A36B00"),
        ),
        (
            "강풍",
            "지주·비닐·고정장치·낙과 위험 확인",
            "작업 전 안전확보, 위험시간대 회피",
            "기상청 + 농사로",
            MINT_PALE,
            MINT_DARK,
        ),
        (
            "병해충 의심",
            "사진 후보와 공식 도감 비교",
            "농약은 등록 여부·희석·살포·수확 전 기준 재확인",
            "NCPMS + PSIS",
            RED_PALE,
            RED,
        ),
    ]
    positions = [(44, 255), (490, 255), (44, 102), (490, 102)]
    for (title, action, check, source, fill, accent), (x, y) in zip(cards, positions):
        rounded_rect(c, x, y, 426, 135, fill=fill, stroke=GRAY_200, radius=14)
        pill(c, title, x + 16, y + 96, 90, fill=accent, color=WHITE, size=8.5)
        paragraph(c, action, x + 16, y + 87, 392, size=11, font="Korean-Bold", color=GREEN)
        paragraph(c, "확인  " + check, x + 16, y + 53, 392, size=8.5, color=GRAY_700)
        paragraph(c, "근거  " + source, x + 16, y + 28, 392, size=8.1, font="Korean-Bold", color=accent)

    paragraph(
        c,
        "완료 기록  |  확인 여부 · 사진 · 메모 · 완료시각을 남겨 다음 알림과 현장지도에 활용합니다.",
        44,
        79,
        872,
        size=9.3,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_ui_dashboard(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    draw_title(
        c,
        "09  현재 구현 화면 ①",
        "필지별 위험의 이유와 공간 기준을 실제 서비스에서 확인할 수 있습니다.",
        "아래는 현재 동작 중인 프로그램 화면이며, 화면 속 농가·지역 값은 개발·시연용 데이터입니다.",
        page_no=11,
        title_size=26,
    )

    rounded_rect(c, 44, 116, 568, 282, fill=WHITE, stroke=GRAY_200, radius=14)
    pill(c, "실제 대시보드", 58, 365, 92, fill=GREEN, color=WHITE)
    draw_image_cover(c, assets["dashboard"], 58, 135, 540, 218, radius=8, position="top")
    paragraph(
        c,
        "오늘 위험도 · 기상 위험 · 병해충 확인 권고 · 근거 이유를 같은 필지 기준으로 표시",
        58,
        130,
        540,
        size=7.8,
        color=GRAY_700,
    )

    rounded_rect(c, 628, 116, 288, 282, fill=WHITE, stroke=GRAY_200, radius=14)
    pill(c, "실제 팜맵 등록", 642, 365, 92, fill=MINT, color=GREEN)
    draw_image_cover(c, assets["farmmap"], 642, 171, 260, 182, radius=8)
    paragraph(c, "지역·지목·면적 필터 → 선택 필지의 PNU·좌표·면적 연결", 642, 160, 260, size=8.3, color=GRAY_700)
    rounded_rect(c, 642, 129, 260, 29, fill=MINT_PALE, radius=7)
    paragraph(c, "천안 적용: 시군구 필터를 ‘천안시’로 설정", 652, 149, 240, size=8, font="Korean-Bold", color=MINT_DARK)

    link_text(
        c,
        "실행 서비스  https://agri-tech-ai-startup-competiti.vercel.app/",
        "https://agri-tech-ai-startup-competiti.vercel.app/",
        44,
        82,
        size=8.5,
    )
    c.showPage()


def add_ui_actions(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    draw_title(
        c,
        "09  현재 구현 화면 ②",
        "위험 신호를 작업·사진 확인·농약 안전기준까지 연결합니다.",
        "AI의 역할은 공식 후보를 정리하는 데 한정하고, 최종 판단은 원문·현장 확인으로 이어집니다.",
        page_no=12,
        title_size=26,
    )

    rounded_rect(c, 44, 112, 416, 288, fill=WHITE, stroke=GRAY_200, radius=14)
    pill(c, "작업 카드", 58, 366, 77, fill=GREEN, color=WHITE)
    draw_image_cover(c, assets["tasks"], 58, 136, 388, 218, radius=8, position="top")
    paragraph(c, "우선순위 · 확인 항목 · 근거 링크 · 완료 기록", 58, 130, 388, size=8.2, color=GRAY_700)

    rounded_rect(c, 476, 260, 440, 140, fill=WHITE, stroke=GRAY_200, radius=14)
    pill(c, "사진 후보 + 공식자료", 490, 366, 122, fill=MINT, color=GREEN)
    draw_image_cover(c, assets["diagnosis"], 490, 278, 412, 77, radius=7, position="top")
    paragraph(c, "확정 진단이 아니라 의심 후보·추가 촬영·NCPMS 확인 지원", 490, 272, 412, size=7.8, color=GRAY_700)

    rounded_rect(c, 476, 112, 440, 132, fill=WHITE, stroke=GRAY_200, radius=14)
    pill(c, "PSIS 등록기준", 490, 210, 95, fill=ORANGE_PALE, color=colors.HexColor("#8C5C00"))
    draw_image_cover(c, assets["pesticide"], 490, 130, 412, 69, radius=7, position="top")
    paragraph(c, "등록 여부·희석배수·살포시기·수확 전 안전기준 우선 확인", 490, 124, 412, size=7.8, color=GRAY_700)

    paragraph(
        c,
        "안전 원칙  |  AI 판단 단독 제공 금지 · 공식 원문 링크 · 상담 전환 · 불확실성 표시",
        44,
        80,
        872,
        size=9.3,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_roadmap(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "10  천안시 실행 로드맵",
        "2개 읍·면 실증에서 시작해 천안 12개 읍·면으로 확장합니다.",
        "현재 구현 기능을 먼저 검증하고, 행정 집계 화면은 참여농가 동의·비식별 기준을 확정한 뒤 구축합니다.",
        page_no=13,
        title_size=26,
    )

    phases = [
        (
            "0–3개월",
            "실증 설계",
            ["2개 읍·면·핵심작물 선정", "참여농가 필지·작물 등록", "기상→작업카드 품질 검수", "개인정보·운영 기준 확정"],
            MINT_PALE,
            MINT_DARK,
        ),
        (
            "4–6개월",
            "현장 검증",
            ["위험 알림·작업 완료율 측정", "농업기술센터 상담 연계", "오경보·누락 사례 개선", "권역별 익명 집계 시범"],
            BLUE_PALE,
            BLUE,
        ),
        (
            "7–12개월",
            "확장 운영",
            ["4읍·8면 단계 확대", "작물별 작업카드 표준화", "교육·방제지원 우선순위 활용", "성과 공개·다음 연도 고도화"],
            ORANGE_PALE,
            colors.HexColor("#9B6A09"),
        ),
    ]
    for idx, (period, title, bullets, fill, accent) in enumerate(phases):
        x = 44 + idx * 295
        rounded_rect(c, x, 190, 276, 215, fill=fill, stroke=GRAY_200, radius=16)
        pill(c, period, x + 18, 367, 78, fill=accent, color=WHITE)
        paragraph(c, title, x + 18, 349, 240, size=15, font="Korean-Bold", color=GREEN)
        for bullet_idx, item in enumerate(bullets):
            y = 304 - bullet_idx * 34
            c.setFillColor(accent)
            c.circle(x + 25, y + 4, 3.4, fill=1, stroke=0)
            paragraph(c, item, x + 36, y + 12, 216, size=8.8, color=GRAY_700)
        if idx < 2:
            c.setStrokeColor(GRAY_500)
            c.setLineWidth(1.2)
            ax = x + 279
            c.line(ax, 298, ax + 11, 298)
            c.line(ax + 7, 302, ax + 11, 298)
            c.line(ax + 7, 294, ax + 11, 298)

    rounded_rect(c, 44, 112, 872, 57, fill=WHITE, stroke=GRAY_200, radius=12)
    roles = [
        ("천안시", "정책·예산·데이터 협의"),
        ("농업기술센터", "작물 기준·현장지도·검증"),
        ("참여농가", "필지 등록·작업 수행·피드백"),
        ("FieldGuard AI", "데이터 결합·알림·기록·모니터링"),
    ]
    rx = 60
    for idx, (role, work) in enumerate(roles):
        if idx:
            c.setStrokeColor(GRAY_200)
            c.line(rx - 14, 126, rx - 14, 155)
        paragraph(c, role, rx, 154, 86, size=8.7, font="Korean-Bold", color=GREEN)
        paragraph(c, work, rx + 76, 154, 120, size=7.8, color=GRAY_700)
        rx += 212
    paragraph(
        c,
        "확장 기준  |  기술 완성도가 아니라 현장 사용성·근거 추적성·개인정보 보호 기준을 모두 통과한 단계만 확대합니다.",
        44,
        82,
        872,
        size=8.9,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_kpi(c: canvas.Canvas) -> None:
    draw_title(
        c,
        "11  성과지표·심사기준 대응·한계",
        "실증 목표와 데이터가 말하지 않는 범위를 함께 공개합니다.",
        "아래 수치는 달성 실적이 아니라 6개월 실증의 정책 목표값입니다.",
        page_no=14,
        title_size=26,
    )

    metrics = [
        ("100%", "근거 URL 연결", "모든 작업 카드"),
        ("≥95%", "데이터 파이프라인 성공", "정상 API 응답 기준"),
        ("≤5분", "갱신→카드 반영", "실증 운영 목표"),
        ("≥60%", "작업 완료 전환", "발행 카드 대비"),
        ("30%↓", "판단 소요시간", "사용자 설문 기준"),
    ]
    for idx, (value, label, note) in enumerate(metrics):
        x = 44 + idx * 176
        rounded_rect(c, x, 318, 160, 84, fill=WHITE, stroke=GRAY_200, radius=12)
        c.setFillColor([MINT_DARK, BLUE, ORANGE, RED, GREEN][idx])
        c.setFont("Korean-Bold", 20)
        c.drawString(x + 13, 365, value)
        paragraph(c, label, x + 13, 351, 134, size=8.7, font="Korean-Bold")
        paragraph(c, note, x + 13, 332, 134, size=7.2, color=GRAY_500)

    rounded_rect(c, 44, 116, 425, 181, fill=MINT_PALE, stroke=MINT, radius=14)
    c.setFillColor(GREEN)
    c.setFont("Korean-Bold", 12)
    c.drawString(61, 268, "예선 5개 기준에 대한 설계 답변")
    criteria = [
        ("주제 적합성", "농림/축산 트랙 · 천안 12개 읍·면"),
        ("창의성", "공공데이터→위험→행동→완료 기록"),
        ("아이디어 기획력", "단계·역할·KPI가 있는 실증 로드맵"),
        ("데이터 이해·적정성", "시점·컬럼·URL·계보·시나리오 구분"),
        ("활용 가능성", "농가 실행 + 센터 익명 집계 확장"),
    ]
    for idx, (name, answer) in enumerate(criteria):
        y = 235 - idx * 28
        paragraph(c, name, 61, y + 12, 96, size=8.2, font="Korean-Bold", color=MINT_DARK)
        paragraph(c, answer, 156, y + 12, 292, size=7.9, color=GRAY_700)

    rounded_rect(c, 490, 116, 426, 181, fill=RED_PALE, stroke=colors.HexColor("#F1C9C3"), radius=14)
    c.setFillColor(RED_DARK)
    c.setFont("Korean-Bold", 12)
    c.drawString(507, 268, "한계와 안전장치")
    safeguards = [
        "시나리오 점수는 관측 통계·예측 정확도가 아닌 코드 재현값",
        "도시 전체 위험지도는 참여 필지 데이터가 쌓인 뒤 익명 집계",
        "AI 사진 결과는 확정 진단·농약 처방이 아닌 후보·확인 지원",
        "등록농약·영농기술은 원문 갱신을 반영하도록 정기 점검",
        "정확한 필지 위치·사진·상담은 최소수집·권한분리·동의 적용",
    ]
    for idx, item in enumerate(safeguards):
        y = 234 - idx * 29
        c.setFillColor(RED)
        c.circle(512, y + 5, 3.2, fill=1, stroke=0)
        paragraph(c, item, 523, y + 13, 373, size=7.9, color=GRAY_700)

    paragraph(
        c,
        "평가 원칙  |  점수 자체보다 ‘왜 이 카드가 만들어졌고 실제 행동으로 이어졌는가’를 핵심 성과로 봅니다.",
        44,
        84,
        872,
        size=9.2,
        font="Korean-Bold",
        color=GREEN,
    )
    c.showPage()


def add_references(c: canvas.Canvas) -> None:
    c.setFillColor(GREEN)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(MINT)
    c.setFont("Korean-Bold", 9)
    c.drawString(44, 503, "12  근거 및 제출 정보")
    c.setFillColor(WHITE)
    c.setFont("Korean-Bold", 29)
    c.drawString(44, 462, "공식 데이터에서 시작해, 현장 행동으로 끝냅니다.")
    paragraph(
        c,
        "접근일 2026.08.04  |  아래 URL은 PDF에서 클릭할 수 있습니다.",
        44,
        430,
        872,
        size=10.5,
        color=colors.HexColor("#D8ECE4"),
    )

    references = [
        ("팜맵 공식 안내", "https://agis.epis.or.kr/ASD/guide/faq.do?bbsSn=3"),
        ("기상청 단기예보 OpenAPI", "https://www.data.go.kr/data/15084084/openapi.do"),
        ("농사로 OpenAPI", "https://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00191"),
        ("NCPMS", "https://ncpms.rda.go.kr/"),
        ("PSIS", "https://psis.rda.go.kr/psis/"),
        ("Gemini API 공식 문서", "https://ai.google.dev/gemini-api/docs"),
        ("FieldGuard AI 실행 서비스", "https://agri-tech-ai-startup-competiti.vercel.app/"),
    ]
    col_x = [44, 493]
    for idx, (name, url) in enumerate(references):
        col = 0 if idx < 5 else 1
        row = idx if idx < 5 else idx - 5
        x = col_x[col]
        y = 383 - row * 55
        c.setFillColor(MINT)
        c.setFont("Korean-Bold", 9)
        c.drawString(x, y, name)
        paragraph(c, url, x, y - 7, 410, size=7.2, leading=9.3, color=WHITE)
        c.linkURL(url, (x, y - 37, x + 410, y + 12), relative=0)

    rounded_rect(c, 44, 64, 872, 66, fill=colors.Color(1, 1, 1, alpha=0.09), radius=12)
    c.setFillColor(MINT)
    c.setFont("Korean-Bold", 15)
    c.drawString(64, 103, "FIELDGUARD AI")
    c.setFillColor(WHITE)
    c.setFont("Korean", 10)
    c.drawString(64, 81, "천안형 필지 맞춤 농업위험 선제대응 서비스  ·  데이터 분석 기획서 및 시각화 통합본")
    link_text(
        c,
        "프로그램 바로가기",
        "https://agri-tech-ai-startup-competiti.vercel.app/",
        798,
        83,
        size=9,
        color=MINT,
    )
    c.setFillColor(colors.HexColor("#C6DDD4"))
    c.setFont("Korean", 7.5)
    c.drawString(44, 19, "FIELDGUARD AI  ·  참가자 유창재")
    c.drawRightString(916, 19, "15")
    c.showPage()


def build_pdf() -> Path:
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    assets = make_assets()

    if OUTPUT_PDF.exists():
        OUTPUT_PDF.unlink()
    pdf = canvas.Canvas(str(OUTPUT_PDF), pagesize=(W, H), pageCompression=1)
    pdf.setTitle("FieldGuard AI 천안형 농업위험 선제대응 통합본")
    pdf.setAuthor("유창재")
    pdf.setSubject("2026년 천안시 AI·데이터 기반 정책 아이디어 경진대회 데이터 분석 기획서 및 시각화")
    pdf.setCreator("FieldGuard AI")

    add_cover(pdf)
    add_cheonan_context(pdf)
    add_problem(pdf)
    add_policy_model(pdf)
    add_data_plan_spatial(pdf)
    add_data_plan_agronomy(pdf)
    add_pipeline(pdf)
    add_scoring(pdf)
    add_scenario_chart(pdf)
    add_action_matrix(pdf)
    add_ui_dashboard(pdf, assets)
    add_ui_actions(pdf, assets)
    add_roadmap(pdf)
    add_kpi(pdf)
    add_references(pdf)
    pdf.save()
    return OUTPUT_PDF


if __name__ == "__main__":
    path = build_pdf()
    print(path)
    print(f"{path.stat().st_size / (1024 * 1024):.2f} MB")
