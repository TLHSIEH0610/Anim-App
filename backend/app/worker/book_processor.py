import os
# Optional: Sentry error tracking for worker jobs
try:
    import sentry_sdk
    from sentry_sdk.integrations.rq import RqIntegration
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        environment=os.getenv("SENTRY_ENV", "local"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        integrations=[RqIntegration()],
    )
except Exception:
    pass
import json
import re
import time
import platform
import secrets
import copy
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from app.models import (
    Book,
    BookPage,
    BookWorkflowSnapshot,
    WorkflowDefinition,
    StoryTemplate,
    StoryTemplatePage,
    ControlNetImage,
)
from app.comfyui_client import ComfyUIClient

from reportlab.lib.pagesizes import A4, letter
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.utils import ImageReader
from reportlab.platypus.tables import TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage
import textwrap
from typing import Dict, Optional, Any

from app.storage import move_to

# This pipeline is template-driven and Qwen-only.


AGE_DESCRIPTORS = {
    "3-5": "preschool-aged",
    "6-8": "elementary-aged",
    "9-12": "preteen",
}

GENDER_WORDS = {
    "male": "boy",
    "female": "girl",
    "neutral": "child",
}

# Use database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://animapp:password@db:5432/animapp")
_engine = create_engine(DATABASE_URL)
_Session = sessionmaker(bind=_engine)

# Configuration
COMFYUI_SERVER = os.getenv("COMFYUI_SERVER", "127.0.0.1:8188")

# RunPod fallback removed.

# RQ Redis for cooperative cancellation
try:
    import redis as _rq_redis_mod  # type: ignore
    REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
    _rq_redis = _rq_redis_mod.from_url(REDIS_URL)
except Exception:  # pragma: no cover
    _rq_redis = None  # type: ignore

def _set_run_token(book_id: int) -> None:
    try:
        if _rq_redis is not None:
            import uuid
            token = uuid.uuid4().hex
            _rq_redis.set(f"book:run:{book_id}", token)
            _rq_redis.delete(f"book:cancel:{book_id}")
    except Exception:
        pass

def _get_run_token(book_id: int):
    try:
        if _rq_redis is None:
            return None
        v = _rq_redis.get(f"book:run:{book_id}")
        if v is None:
            return None
        return v.decode() if isinstance(v, (bytes, bytearray)) else str(v)
    except Exception:
        return None

def _is_cancelled(book_id: int) -> bool:
    try:
        if _rq_redis is None:
            return False
        return bool(_rq_redis.get(f"book:cancel:{book_id}"))
    except Exception:
        return False

def _should_abort(book_id: int, token) -> bool:
    try:
        if _is_cancelled(book_id):
            return True
        cur = _get_run_token(book_id)
        if token is not None and cur is not None and token != cur:
            return True
        return False
    except Exception:
        return False



def _normalized_template_params(book: Book) -> Dict[str, str]:
    params = book.template_params or {}
    if not isinstance(params, dict):
        return {}
    return params


def _build_pronouns(gender: str | None) -> Dict[str, str]:
    mapping = {
        "male": {"they": "he", "them": "him", "their": "his", "theirs": "his"},
        "female": {"they": "she", "them": "her", "their": "her", "theirs": "hers"},
        "neutral": {"they": "they", "them": "them", "their": "their", "theirs": "theirs"},
    }
    base = mapping.get((gender or "neutral").lower(), mapping["neutral"])
    return {
        **base,
        "They": base["they"].capitalize(),
        "Them": base["them"].capitalize(),
        "Their": base["their"].capitalize(),
        "Theirs": base["theirs"].capitalize(),
    }


def _format_template_text(text: str, replacements: Dict[str, str]) -> str:
    if not text:
        return text
    for key, value in replacements.items():
        # Support both "{Name}" and "{{ name }}" placeholder styles (case-insensitive for the latter).
        try:
            text = text.replace(f"{{{key}}}", value)
        except Exception:
            pass
        try:
            pattern = r"\{\{\s*" + re.escape(str(key)) + r"\s*\}\}"
            text = re.sub(pattern, value, text)
        except Exception:
            pass
    return text


def _age_descriptor(age: Optional[str]) -> str:
    return AGE_DESCRIPTORS.get((age or "").strip(), "young")


def _gender_word(gender: Optional[str]) -> str:
    return GENDER_WORDS.get((gender or "neutral").lower(), "child")


def _build_prompt_description(description: str, age: Optional[str], gender: Optional[str]) -> str:
    age_adj = _age_descriptor(age)
    gender_word = _gender_word(gender)
    desc = (description or "").strip()
    if not desc:
        return f"a {age_adj} {gender_word}"

    lowered = desc.lower()
    connectors = (
        "in ", "inside", "with", "while", "standing", "sitting", "floating", "kneeling",
        "seated", "holding", "playing", "running", "walking", "exploring", "sharing",
    )

    if lowered.startswith(("a ", "an ", "the ")):
        return f"a {age_adj} {gender_word} {desc}"
    if any(lowered.startswith(conn) for conn in connectors):
        return f"a {age_adj} {gender_word} {desc}"
    return f"a {age_adj} {gender_word} {desc}"


def _load_story_template(slug: Optional[str]) -> Optional[StoryTemplate]:
    if not slug:
        return None
    session = _Session()
    try:
        return (
            session.query(StoryTemplate)
            .options(joinedload(StoryTemplate.pages))
            .filter(StoryTemplate.slug == slug, StoryTemplate.is_active.is_(True))
            .first()
        )
    finally:
        session.close()


def _build_story_from_template(book: Book, template: StoryTemplate) -> tuple[Dict[str, Any], Dict[int, Dict[str, str]]]:
    params = _normalized_template_params(book)
    name = (params.get("name") or book.character_description or "").strip()
    if not name:
        raise ValueError("template_params.name is required for template-driven books")
    gender = params.get("gender", "neutral")
    pronouns = _build_pronouns(gender)
    gender_word = _gender_word(gender)

    replacements = {
        "Name": name,
        "name": name,
        "they": pronouns["they"],
        "them": pronouns["them"],
        "their": pronouns["their"],
        "theirs": pronouns["theirs"],
        "They": pronouns["They"],
        "Them": pronouns["Them"],
        "Their": pronouns["Their"],
        "Theirs": pronouns["Theirs"],
        "gender": gender_word,
        "Gender": gender_word.capitalize(),
    }

    age_value = (
        params.get("age")
        or book.target_age
        or template.age
        or ""
    )
    age_value = str(age_value) if age_value is not None else ""
    replacements["age"] = age_value
    replacements["Age"] = age_value

    template_pages = sorted(template.pages, key=lambda p: p.page_number)
    if not template_pages:
        raise ValueError(f"Story template '{template.slug}' has no pages configured")

    pages = []
    overrides: Dict[int, Dict[str, Any]] = {}

    def _normalize_extra_text(raw: Optional[str]) -> list[dict]:
        if not raw:
            return []
        defaults = {
            "text": "",
            "font_size": 60,
            "fill_color_hex": "#FFFFFF",
            "stroke_color_hex": "#000000",
            "x_shift": 0,
            "y_shift": -40,
            "vertical_alignment": "top",
        }
        try:
            data = json.loads(raw)
        except Exception:
            data = None
        if isinstance(data, list):
            source = data
        elif isinstance(data, dict):
            source = [data]
        elif isinstance(data, str):
            source = [{"text": data}]
        else:
            source = [{"text": str(data)}]

        items: list[dict] = []
        for item in source:
            if not isinstance(item, dict):
                item = {"text": str(item)}
            cfg = defaults.copy()
            text_raw = str(item.get("text", "") or "")
            cfg["text"] = _format_template_text(text_raw, replacements) if text_raw else ""
            try:
                cfg["font_size"] = int(item.get("font_size", cfg["font_size"]))
            except Exception:
                pass
            try:
                cfg["fill_color_hex"] = str(item.get("fill_color_hex", cfg["fill_color_hex"]) or cfg["fill_color_hex"])
            except Exception:
                pass
            try:
                cfg["stroke_color_hex"] = str(item.get("stroke_color_hex", cfg["stroke_color_hex"]) or cfg["stroke_color_hex"])
            except Exception:
                pass
            try:
                cfg["x_shift"] = int(item.get("x_shift", cfg["x_shift"]))
            except Exception:
                pass
            try:
                cfg["y_shift"] = int(item.get("y_shift", cfg["y_shift"]))
            except Exception:
                pass
            try:
                va = item.get("vertical_alignment", defaults["vertical_alignment"])
                cfg["vertical_alignment"] = str(va or defaults["vertical_alignment"])
            except Exception:
                cfg["vertical_alignment"] = defaults["vertical_alignment"]
            items.append(cfg)
        return items

    # Optional cover page: now detected by workflow slug, not page_number.
    # Any template page whose workflow_slug is 'qwen_cover' is treated as the cover.
    cover_candidates = [
        p
        for p in template_pages
        if ((getattr(p, "workflow_slug", None) or "").strip().lower() == "qwen_cover")
    ]
    body_templates = [p for p in template_pages if p not in cover_candidates]

    if cover_candidates:
        cover_t = cover_candidates[0]
        cover_story = _format_template_text(cover_t.story_text, replacements)
        # Use description for Qwen-era workflows; legacy image_prompt is ignored.
        cover_pos_raw = getattr(cover_t, "positive_prompt", None) or ""
        cover_pos = _format_template_text(cover_pos_raw, replacements) if cover_pos_raw else ""
        cover_neg_raw = getattr(cover_t, "negative_prompt", None) or ""
        cover_neg = _format_template_text(cover_neg_raw, replacements) if cover_neg_raw else ""
        cover_pose_raw = getattr(cover_t, "pose_prompt", None) or ""
        cover_pose = _format_template_text(cover_pose_raw, replacements) if cover_pose_raw else ""
        # For Qwen workflows, this slug now represents the story/body image for the cover.
        cover_story_image_slug = getattr(cover_t, "story_image", None) or cover_t.keypoint_image
        # For Qwen and modern flows, we do not default to a special "cover" workflow slug;
        # if no explicit workflow is set on the cover template row, the main template
        # workflow_slug will be used instead.
        raw_cover_wf = getattr(cover_t, "workflow_slug", None)
        if isinstance(raw_cover_wf, str):
            raw_cover_wf = raw_cover_wf.strip() or None
        cover_workflow = raw_cover_wf
        cover_extra_text = _normalize_extra_text(getattr(cover_t, "cover_text", None))

        pages.append({
            "page": 0,
            "text": cover_story,
            "image_description": "",
            "image_kp": cover_story_image_slug,
            "story_image": cover_story_image_slug,
            "workflow": cover_workflow,
            "seed": getattr(cover_t, 'seed', None) if getattr(cover_t, 'seed', None) not in ("", None) else None,
            "extra_text": cover_extra_text,
        })

        cov_override: Dict[str, Any] = {}
        if cover_pos.strip():
            cov_override["positive"] = cover_pos.strip()
        if cover_neg.strip():
            cov_override["negative"] = cover_neg.strip()
        if cover_story_image_slug:
            # Historically this was keyed as "keypoint"; retain that for compatibility
            # but also expose a clearer "story_image" key for Qwen workflows.
            cov_override["keypoint"] = cover_story_image_slug
            cov_override["story_image"] = cover_story_image_slug
        if cover_pose and cover_pose.strip():
            cov_override["pose"] = cover_pose.strip()
        if cover_workflow:
            cov_override["workflow"] = cover_workflow
        seed_val = getattr(cover_t, 'seed', None)
        try:
            cov_seed = int(seed_val) if seed_val not in (None, "") else None
        except (TypeError, ValueError):
            cov_seed = None
        if cov_seed is not None:
            cov_override["seed"] = cov_seed
        if cover_extra_text:
            cov_override["extra_text"] = cover_extra_text
        overrides[0] = cov_override

    if not body_templates:
        body_templates = template_pages

    for index in range(book.page_count):
        page_number = index + 1
        page_template = body_templates[index % len(body_templates)]

        story_text = _format_template_text(page_template.story_text, replacements)
        positive_raw = getattr(page_template, "positive_prompt", None) or ""
        positive_prompt = _format_template_text(positive_raw, replacements) if positive_raw else ""
        negative_raw = getattr(page_template, "negative_prompt", None) or ""
        negative_prompt = _format_template_text(negative_raw, replacements) if negative_raw else ""
        pose_raw = getattr(page_template, "pose_prompt", None) or ""
        pose_prompt = _format_template_text(pose_raw, replacements) if pose_raw else ""
        story_image_slug = getattr(page_template, "story_image", None) or page_template.keypoint_image
        page_extra_text = _normalize_extra_text(getattr(page_template, "cover_text", None))

        workflow_override_slug = getattr(page_template, "workflow_slug", None)
        if isinstance(workflow_override_slug, str):
            workflow_override_slug = workflow_override_slug.strip() or None
        elif workflow_override_slug is not None:
            workflow_override_slug = str(workflow_override_slug).strip() or None

        raw_seed = getattr(page_template, "seed", None)
        try:
            seed_value = int(raw_seed) if raw_seed not in (None, "") else None
        except (TypeError, ValueError):
            seed_value = None

        pages.append(
            {
                "page": page_number,
                "text": story_text,
                "image_description": "",
                "image_kp": story_image_slug,
                "story_image": story_image_slug,
                "workflow": workflow_override_slug,
                "seed": seed_value,
                "extra_text": page_extra_text,
            }
        )

        override: Dict[str, Any] = {}
        if positive_prompt.strip():
            override["positive"] = positive_prompt.strip()
        if negative_prompt.strip():
            override["negative"] = negative_prompt.strip()
        if story_image_slug:
            # Preserve legacy "keypoint" key for non-Qwen workflows while
            # introducing a clearer "story_image" key for Qwen pipelines.
            override["keypoint"] = story_image_slug
            override["story_image"] = story_image_slug
        if pose_prompt and pose_prompt.strip():
            override["pose"] = pose_prompt.strip()
        if workflow_override_slug:
            override["workflow"] = workflow_override_slug
        if seed_value is not None:
            override["seed"] = seed_value
        if page_extra_text:
            override["extra_text"] = page_extra_text
        overrides[page_number] = override

    story_data = {
        "title": book.title,
        "pages": pages,
        "age_group": book.target_age or template.age,
        "theme": template.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "template",
        "model": template.workflow_slug,
    }

    return story_data, overrides


def _randomize_k_sampler_seeds(workflow: Dict[str, Any], seed: Optional[int] = None) -> None:
    """Assign deterministic or random seeds to every KSampler node."""
    if seed is not None:
        fixed_seed = int(seed)
        for node in workflow.values():
            if node.get("class_type") == "KSampler":
                inputs = node.get("inputs", {})
                if "seed" in inputs:
                    inputs["seed"] = fixed_seed
        return

    rng = secrets.SystemRandom()
    for node in workflow.values():
        if node.get("class_type") == "KSampler":
            inputs = node.get("inputs", {})
            if "seed" in inputs:
                inputs["seed"] = rng.getrandbits(64)


def get_media_root() -> Path:
    """Get media root directory based on platform"""
    media_root = os.getenv("MEDIA_ROOT")
    
    if media_root:
        return Path(media_root)
    
    # Platform-specific defaults
    system = platform.system().lower()
    if system == "windows":
        return Path.home() / "Documents" / "AnimApp" / "media"
    elif system == "darwin":  # macOS
        return Path.home() / "Documents" / "AnimApp" / "media"
    else:  # Linux/Docker
        return Path("/data/media")

class BookComposer:
    """PDF book generation using ReportLab"""
    
    def __init__(self):
        self.page_width, self.page_height = A4
        # Reduce margins to allow larger content while keeping a neat frame
        self.margin = 0.5 * inch
        # Register friendly fonts (Bitstream Vera is bundled with ReportLab)
        try:
            pdfmetrics.registerFont(TTFont('Vera', 'Vera.ttf'))
            pdfmetrics.registerFont(TTFont('Vera-Bold', 'VeraBd.ttf'))
            pdfmetrics.registerFont(TTFont('Vera-It', 'VeraIt.ttf'))
            # Optional override via env: PDF_FONT_TTF, PDF_FONT_BOLD_TTF, PDF_FONT_IT_TTF, PDF_FONT_NAME
            import os
            base_name = os.getenv('PDF_FONT_NAME')
            regular_ttf = os.getenv('PDF_FONT_TTF')
            bold_ttf = os.getenv('PDF_FONT_BOLD_TTF')
            it_ttf = os.getenv('PDF_FONT_IT_TTF')
            if base_name and regular_ttf:
                try:
                    pdfmetrics.registerFont(TTFont(base_name, regular_ttf))
                    if bold_ttf:
                        pdfmetrics.registerFont(TTFont(f"{base_name}-Bold", bold_ttf))
                    if it_ttf:
                        pdfmetrics.registerFont(TTFont(f"{base_name}-It", it_ttf))
                except Exception as fe:
                    print(f"[PDF] Custom font registration failed: {fe}")
        except Exception as e:
            # Fallback silently to built-ins if fonts not found
            print(f"[PDF] Font registration warning: {e}")
        
    def create_book_pdf(self, book_data: dict, pages_data: list, output_path: str) -> str:
        """
        Create a PDF book from book data and page content
        
        Args:
            book_data: Dict with book metadata (title, theme, etc.)
            pages_data: List of dicts with page content and images
            output_path: Where to save the PDF
        
        Returns:
            Path to the generated PDF
        """
        try:
            # Ensure output directory exists
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)

            story = []
            styles = getSampleStyleSheet()
            
            # Custom styles for children's books
            title_style = ParagraphStyle(
                'BookTitle',
                parent=styles['Heading1'],
                fontSize=36,
                spaceAfter=30,
                textColor=colors.HexColor('#2E86AB'),
                alignment=TA_CENTER,
                fontName='Vera-Bold'
            )
            
            subtitle_style = ParagraphStyle(
                'BookSubtitle',
                parent=styles['Normal'],
                fontSize=20,
                spaceAfter=20,
                textColor=colors.HexColor('#A23B72'),
                alignment=TA_CENTER,
                fontName='Vera-It'
            )
            
            story_style = ParagraphStyle(
                'StoryText',
                parent=styles['Normal'],
                fontSize=22,
                spaceAfter=16,
                alignment=TA_CENTER,
                fontName='Vera',
                leading=30,
                leftIndent=8,
                rightIndent=8
            )
            
            # Page number will be drawn on the canvas (bottom-right), not as a flowable
            
            # Cover is handled inside the unified loop below
            
            # Story pages (including cover if present).
            # Treat special Qwen workflows ('qwen_cover', 'qwen_end') as full-image pages.
            special_full_image = {"qwen_cover", "qwen_end"}
            pages_for_body = sorted(pages_data, key=lambda p: (p.get('page_number') is None, p.get('page_number')))
            has_cover = any(
                isinstance(p.get("workflow"), str)
                and p.get("workflow", "").strip().lower() == "qwen_cover"
                for p in pages_for_body
            )
            # Count only non-cover pages as "body" for page numbering.
            total_body_pages = sum(
                1
                for p in pages_for_body
                if not (
                    isinstance(p.get("workflow"), str)
                    and p.get("workflow", "").strip().lower() == "qwen_cover"
                )
            )

            class _FullBleedImage(Flowable):
                """Draw an image to fully cover the page (no padding), cropping as needed."""

                def __init__(self, image_path: str, page_w: float, page_h: float):
                    super().__init__()
                    self.image_path = image_path
                    self.page_w = page_w
                    self.page_h = page_h

                def wrap(self, availWidth, availHeight):
                    return (self.page_w, self.page_h)

                def drawOn(self, canv, x, y, _sW=0):  # type: ignore[override]
                    canv.saveState()
                    try:
                        reader = ImageReader(self.image_path)
                        iw, ih = reader.getSize()
                        iw = float(iw or 1)
                        ih = float(ih or 1)
                        scale = max(self.page_w / iw, self.page_h / ih)
                        dw = iw * scale
                        dh = ih * scale
                        dx = (self.page_w - dw) / 2.0
                        dy = (self.page_h - dh) / 2.0
                        canv.drawImage(
                            reader,
                            dx,
                            dy,
                            width=dw,
                            height=dh,
                            preserveAspectRatio=False,
                            mask="auto",
                        )
                    except Exception:
                        pass
                    canv.restoreState()

            # PDF layout:
            # - Full-bleed template for special full-image pages (cover/end), no margins/padding.
            # - Body template for regular pages, with a content margin frame.
            first_wf = ((pages_for_body[0].get("workflow") or "") if pages_for_body else "").strip().lower()
            default_template_id = "FullBleed" if first_wf in special_full_image else "Body"

            doc = BaseDocTemplate(output_path, pagesize=A4)
            full_frame = Frame(
                0,
                0,
                self.page_width,
                self.page_height,
                leftPadding=0,
                rightPadding=0,
                topPadding=0,
                bottomPadding=0,
                id="full",
            )
            body_frame = Frame(
                self.margin,
                self.margin,
                self.page_width - (2 * self.margin),
                self.page_height - (2 * self.margin),
                leftPadding=0,
                rightPadding=0,
                topPadding=0,
                bottomPadding=0,
                id="body",
            )

            def _on_page(canvas, doc_obj):
                canvas.saveState()
                try:
                    canvas.setFillColor(colors.HexColor('#FFF8E1'))
                except Exception:
                    canvas.setFillColor(colors.whitesmoke)
                canvas.rect(0, 0, self.page_width, self.page_height, stroke=0, fill=1)

                # Draw a subtle page number at bottom-right for BODY pages only.
                try:
                    tpl_id = getattr(getattr(doc_obj, "pageTemplate", None), "id", None)
                    if tpl_id in {"Body", "BodyBleedImage"}:
                        pg = canvas.getPageNumber()
                        if not (has_cover and pg == 1):
                            display_num = pg - (1 if has_cover else 0)
                            canvas.setFillColor(colors.grey)
                            canvas.setFont('Helvetica', 10)
                            x = self.page_width - self.margin
                            y = self.margin * 0.55
                            canvas.drawRightString(x, y, f"{display_num}")
                except Exception:
                    pass
                canvas.restoreState()

            full_tpl = PageTemplate(id="FullBleed", frames=[full_frame], onPage=_on_page)
            body_tpl = PageTemplate(id="Body", frames=[body_frame], onPage=_on_page)
            # Body pages: full-bleed frame so images can be edge-to-edge, while text is inset via padding.
            body_bleed_tpl = PageTemplate(id="BodyBleedImage", frames=[full_frame], onPage=_on_page)
            doc.addPageTemplates(
                [full_tpl, body_tpl, body_bleed_tpl]
                if default_template_id == "FullBleed"
                else [body_tpl, body_bleed_tpl, full_tpl]
            )

            visible_page_index = 0
            for pidx, page_data in enumerate(pages_for_body):
                wf_slug = (page_data.get("workflow") or "").strip().lower()
                pgnum = page_data.get('page_number')

                target_template_id = (
                    "FullBleed" if wf_slug in special_full_image else "BodyBleedImage"
                )
                if pidx > 0:
                    story.append(NextPageTemplate(target_template_id))
                    story.append(PageBreak())

                # Full-image pages for special workflows (cover + end).
                if wf_slug in special_full_image:
                    img_path = page_data.get('image_path')
                    if (not img_path or not os.path.exists(img_path)) and (book_data.get('preview_image_path')):
                        img_path = book_data.get('preview_image_path')
                    if img_path and os.path.exists(img_path):
                        try:
                            # Full-bleed: fill the page (crop if needed), no padding.
                            story.append(_FullBleedImage(img_path, self.page_width, self.page_height))
                        except Exception:
                            pass
                    else:
                        # Fallback title if no image available
                        story.append(Spacer(1, 36))
                        story.append(Paragraph(book_data['title'], title_style))
                        story.append(Paragraph(f"A {book_data.get('theme', 'wonderful')} story for ages {book_data.get('target_age', '6-8')}", subtitle_style))
                    continue

                visible_page_index += 1
                i = visible_page_index
                # Full page frame for image, but keep text inset margins as before.
                content_width = self.page_width
                content_height = self.page_height

                # Reserve footer area only when there is a following body page
                page_num_block = 18 if i < total_body_pages else 0
                # Small safety to counter rounding differences
                safety = 4
                available_h = max(content_height - page_num_block - safety, 0)

                # Build the page contents as a single shrink-to-fit block to avoid auto page breaks
                text_content = (page_data.get('text_content') or '').strip()
                paragraph = Paragraph(text_content if text_content else "(Illustration)", story_style)

                block_items = []
                # Image (if present)
                img_path = page_data.get('image_path')
                if img_path and os.path.exists(img_path):
                    try:
                        with PILImage.open(img_path) as pil_img:
                            orig_w, orig_h = pil_img.size
                        aspect = orig_w / float(orig_h or 1)
                        # Aim for full width; height will be adjusted if needed by KeepInFrame shrink
                        img_w = self.page_width
                        img_h = img_w / aspect
                        block_items.append(Image(img_path, width=img_w, height=img_h, hAlign='CENTER'))
                        block_items.append(Spacer(1, 12))
                    except Exception as e:
                        print(f"Warning: Could not add image for page {i}: {e}")
                        block_items.append(Spacer(1, 8))
                else:
                    block_items.append(Spacer(1, 8))

                # Text: keep the same paragraph styling, but inset the block to match body margins.
                text_block = Table([[paragraph]], colWidths=[self.page_width])
                text_block.setStyle(
                    TableStyle(
                        [
                            ("LEFTPADDING", (0, 0), (0, 0), self.margin),
                            ("RIGHTPADDING", (0, 0), (0, 0), self.margin),
                            ("TOPPADDING", (0, 0), (0, 0), 0),
                            ("BOTTOMPADDING", (0, 0), (0, 0), 0),
                        ]
                    )
                )
                block_items.append(text_block)
                block_items.append(Spacer(1, 10))

                try:
                    from reportlab.platypus import KeepInFrame
                    # Keep content pinned to the top of the body frame so pages don't look like they
                    # have extra "padding" above the illustration.
                    story.append(
                        KeepInFrame(
                            content_width,
                            available_h,
                            block_items,
                            mode="shrink",
                            hAlign="CENTER",
                            vAlign="TOP",
                        )
                    )
                except Exception:
                    story.extend(block_items)
            
            doc.build(story)
            
            return output_path
            
        except Exception as e:
            raise Exception(f"Failed to create PDF: {str(e)}")
    
    def resize_image_for_page(self, image_path: str, max_width: float = None, max_height: float = None) -> Image:
        """
        Resize image to fit page while maintaining aspect ratio
        
        Args:
            image_path: Path to the image file
            max_width: Maximum width (defaults to page width - margins)
            max_height: Maximum height (defaults to 60% of page height)
        
        Returns:
            ReportLab Image object
        """
        if max_width is None:
            max_width = self.page_width - (2 * self.margin)
        if max_height is None:
            # Default: allow image to occupy up to ~78% of the content height
            max_height = (self.page_height - (2 * self.margin)) * 0.78
        
        try:
            # Open image to get dimensions
            with PILImage.open(image_path) as pil_img:
                original_width, original_height = pil_img.size
                
            # Calculate scaling factor
            width_scale = max_width / original_width
            height_scale = max_height / original_height
            # Prefer large images; allow mild upscale up to 1.15x to avoid tiny renders
            scale = min(width_scale, height_scale)
            if scale < 1.0:
                pass
            else:
                scale = min(scale, 1.15)
            
            final_width = original_width * scale
            final_height = original_height * scale
            
            return Image(
                image_path, 
                width=final_width,
                height=final_height,
                hAlign='CENTER'
            )
            
        except Exception as e:
            # Return placeholder if image processing fails
            print(f"Warning: Could not process image {image_path}: {e}")
            return Image(image_path, width=4*inch, height=3*inch, hAlign='CENTER')

def create_childbook(book_id: int):
    """
    Complete children's book creation pipeline
    
    This is the main worker function called by RQ
    """
    session = _Session()
    book = session.query(Book).get(book_id)
    
    if not book:
        print(f"Book {book_id} not found")
        return
    
    print(f"Starting book creation for book {book_id}: '{book.title}'")
    
    try:
        comfyui_client = ComfyUIClient(COMFYUI_SERVER)
        # Preflight: check whether local ComfyUI is reachable before we attempt uploads/prompts.
        try:
            comfy_reachable = comfyui_client._is_reachable(comfyui_client.base_url)
        except Exception:
            comfy_reachable = False
        if not comfy_reachable:
            print("ComfyUI not reachable; will use RunPod fallback for image generation.")
        book_composer = BookComposer()
        template_prompt_overrides: Dict[int, Dict[str, Any]] = {}
        template_obj: Optional[StoryTemplate] = None
        workflow_slug = "base"
        is_template = (book.story_source or "").strip().lower() == "template"
        if not is_template:
            raise Exception("Only template-driven books are supported")
        template_obj = _load_story_template(book.template_key)
        if not template_obj:
            raise Exception("Story template not found or inactive")
        if not book.target_age:
            book.target_age = template_obj.age
        # Keep template-based books in sync with the current template page count.
        # Note: `book.page_count` is the number of non-cover pages (body + end).
        try:
            tpl_pages = list(template_obj.pages or [])
            non_cover_count = len(
                [
                    p
                    for p in tpl_pages
                    if str(getattr(p, "workflow_slug", "") or "").strip().lower()
                    not in {"qwen_cover"}
                ]
            )
            if non_cover_count <= 0:
                non_cover_count = len(tpl_pages)
            if non_cover_count > 0 and book.page_count != non_cover_count:
                book.page_count = non_cover_count
                session.commit()
        except Exception:
            pass
        story_data, template_prompt_overrides = _build_story_from_template(book, template_obj)
        workflow_slug = template_obj.workflow_slug or "base"

        # Stage 1: Generate story text
        my_run_token = _get_run_token(book_id)
        print("Stage 1: Generating story...")
        book.status = "generating_story"
        book.progress_percentage = 10.0
        session.commit()
        if _should_abort(book.id, my_run_token):
            print(f"[Abort] Cancelled before story generation for book {book_id}")
            return

        # Template-only: story_data is derived from the DB-backed template.

        # Save story data
        book.story_data = json.dumps(story_data)
        book.story_generated_at = datetime.now(timezone.utc)
        book.progress_percentage = 20.0
        session.commit()
        
        print(f"Story generated with {len(story_data['pages'])} pages")
        
        # Stage 2: Create page records and generate images
        print("Stage 2: Generating images...")
        book.status = "generating_images"
        book.progress_percentage = 25.0
        session.commit()
        
        # Create page records
        for page_data in story_data['pages']:
            page = BookPage(
                book_id=book.id,
                page_number=page_data['page'],
                text_content=page_data['text'],
                image_description=page_data['image_description'],
                image_status="pending"
            )
            session.add(page)
        
        session.commit()
        
        # Generate images for each page
        session.query(BookWorkflowSnapshot).filter_by(book_id=book.id).delete()
        session.commit()

        pages = session.query(BookPage).filter_by(book_id=book.id).order_by(BookPage.page_number).all()
        total_pages = len(pages)
        
        for i, page in enumerate(pages):
            if _should_abort(book.id, my_run_token):
                print(f"[Abort] Cancelled during images stage for book {book_id}")
                return
            try:
                print(f"Generating image for page {page.page_number}...")
                page.image_status = "processing"
                page.image_started_at = datetime.now(timezone.utc)
                session.commit()
                
                prompt_override = template_prompt_overrides.get(page.page_number, {})
                keypoint_slug = prompt_override.get("keypoint")

                positive_raw = prompt_override.get("positive")
                positive_override = (
                    str(positive_raw).strip() if positive_raw is not None else ""
                ) or None
                page.enhanced_prompt = positive_override or ""

                negative_raw = prompt_override.get("negative")
                negative_override = (
                    str(negative_raw).strip() if negative_raw is not None else ""
                ) or None
                session.commit()

                # Try to generate image with ComfyUI
                try:
                    if _should_abort(book.id, my_run_token):
                        print(f"[Abort] Cancelled before ComfyUI call (page {page.page_number}) for book {book_id}")
                        return
                    # Load appropriate workflow
                    workflow_override_slug = prompt_override.get("workflow")
                    effective_workflow_slug = (workflow_override_slug or workflow_slug)
                    workflow, workflow_version, workflow_slug_active = get_childbook_workflow(effective_workflow_slug)
                    print(f"🔍 Debug ComfyUI workflow for page {page.page_number}:")
                    print(f"   Theme: {book.theme}")
                    if workflow_override_slug:
                        print(f"   Workflow override: {workflow_override_slug}")
                    print(f"   Workflow slug: {workflow_slug_active}")
                    print(f"   Workflow version: {workflow_version}")
                    print(f"   Workflow loaded successfully with {len(workflow)} nodes")

                    try:
                        image_paths = json.loads(book.original_image_paths) if book.original_image_paths else []
                    except:
                        image_paths = [book.original_image_paths] if book.original_image_paths else []

                    print(f"Using {len(image_paths)} reference image(s) for character consistency")

                    # In Qwen workflows, this slug represents the story/body image.
                    story_image_slug = prompt_override.get("story_image") or keypoint_slug
                    story_image_path: Optional[str] = None
                    if story_image_slug:
                        si_record = (
                            session.query(ControlNetImage)
                            .filter(ControlNetImage.slug == story_image_slug)
                            .first()
                        )
                        if si_record and si_record.image_path and os.path.exists(si_record.image_path):
                            story_image_path = si_record.image_path
                        else:
                            print(f"Story image '{story_image_slug}' not found or missing path")

                    # Generate image with ComfyUI
                    print(f"Starting ComfyUI processing for page {page.page_number}...")
                    print(
                        f"Using prompt override: {bool(positive_override)} (page {page.page_number})"
                    )

                    seed_override = prompt_override.get("seed")
                    _randomize_k_sampler_seeds(workflow, seed_override)

                    # Apply per-page extra text overlays to Text Overlay nodes when configured.
                    extra_text_cfgs = prompt_override.get("extra_text") or []
                    if extra_text_cfgs:
                        try:
                            overlay_nodes = [
                                nid
                                for nid, node in workflow.items()
                                if isinstance(node, dict) and node.get("class_type") == "Text Overlay"
                            ]
                            defaults = {
                                "text": "",
                                "font_size": 60,
                                "fill_color_hex": "#FFFFFF",
                                "stroke_color_hex": "#000000",
                                "x_shift": 0,
                                "y_shift": -40,
                                "vertical_alignment": "top",
                            }
                            for idx, item in enumerate(extra_text_cfgs):
                                if idx >= len(overlay_nodes):
                                    break
                                nid = overlay_nodes[idx]
                                node = workflow.get(nid)
                                if not (node and isinstance(node.get("inputs"), dict)):
                                    continue
                                cfg = defaults.copy()
                                if isinstance(item, dict):
                                    try:
                                        cfg.update(item)
                                    except Exception:
                                        pass
                                inputs = node["inputs"]
                                inputs["text"] = str(cfg.get("text", "") or "")
                                try:
                                    inputs["font_size"] = int(cfg.get("font_size", defaults["font_size"]))
                                except Exception:
                                    inputs["font_size"] = defaults["font_size"]
                                inputs["fill_color_hex"] = cfg.get("fill_color_hex", defaults["fill_color_hex"]) or defaults["fill_color_hex"]
                                inputs["stroke_color_hex"] = cfg.get("stroke_color_hex", defaults["stroke_color_hex"]) or defaults["stroke_color_hex"]
                                try:
                                    inputs["x_shift"] = int(cfg.get("x_shift", defaults["x_shift"]))
                                    inputs["y_shift"] = int(cfg.get("y_shift", defaults["y_shift"]))
                                except Exception:
                                    inputs["x_shift"] = defaults["x_shift"]
                                    inputs["y_shift"] = defaults["y_shift"]
                                va = cfg.get("vertical_alignment", defaults["vertical_alignment"])
                                inputs["vertical_alignment"] = str(va or defaults["vertical_alignment"])
                            print(f"Applied extra text overlays (count={len(extra_text_cfgs)}) for page {page.page_number}")
                        except Exception as ov_err:
                            print(f"Warning: failed to apply extra text overlays: {ov_err}")

                    result = None
                    primary_error: Optional[Exception] = None
                    if 'comfy_reachable' in locals() and comfy_reachable:
                        try:
                            custom_prompt = positive_override
                            control_prompt_arg = negative_override

                            result = comfyui_client.process_image_to_animation(
                                image_paths,
                                copy.deepcopy(workflow),
                                custom_prompt,
                                control_prompt_arg,
                                story_image_path=story_image_path,
                            )
                        except Exception as e:
                            primary_error = e
                    else:
                        print(f"Skipping local ComfyUI for page {page.page_number} (not reachable).")
                        if primary_error:
                            raise primary_error
                        raise Exception("ComfyUI not reachable; cannot generate images.")

                    workflow_payload = result.get("workflow")
                    vae_preview_path = result.get("vae_preview_path")

                    # Reorganize image storage
                    if result.get("status") == "success" and result.get("output_path"):
                        final_output_path = Path(result["output_path"])
                        target_dir = Path(get_media_root()) / "outputs"
                        new_name = f"{book.id}_page_{page.page_number}"
                        new_output_path = move_to(str(final_output_path), str(target_dir), new_name)
                        result["output_path"] = new_output_path
                        page.image_path = new_output_path
                        # Use special cover workflow as preview image when available
                        if (
                            isinstance(template_prompt_overrides.get(page.page_number), dict)
                            and (template_prompt_overrides[page.page_number].get("workflow") or "").strip().lower() == "qwen_cover"
                        ):
                            book.preview_image_path = new_output_path
                            session.commit()

                    if vae_preview_path:
                        target_dir = Path(get_media_root()) / "intermediates"
                        new_name = f"{book.id}_controlnet_{page.page_number}"
                        new_vae_path = move_to(vae_preview_path, str(target_dir), new_name)
                        vae_preview_path = new_vae_path
                        result["vae_preview_path"] = new_vae_path

                    if workflow_payload is not None:
                        try:
                            serialized_workflow = json.loads(json.dumps(workflow_payload))
                        except TypeError:
                            serialized_workflow = workflow_payload

                        snapshot = BookWorkflowSnapshot(
                            book_id=book.id,
                            page_number=page.page_number,
                            prompt_id=result.get("prompt_id"),
                            workflow_json=serialized_workflow,
                            vae_image_path=vae_preview_path,
                            workflow_version=workflow_version,
                            workflow_slug=workflow_slug_active,
                        )
                        session.add(snapshot)
                        session.commit()
                    print(f"ComfyUI result for page {page.page_number}: {result}")
                    
                    if result.get("status") == "success":
                        page.image_status = "completed"
                        print(f"✅ Image generated for page {page.page_number}")
                    else:
                        raise Exception(f"Image generation failed: {result.get('error', 'Unknown error')}")
                        
                except Exception as comfy_error:
                    session.rollback()
                    print(f"ComfyUI failed for page {page.page_number}: {comfy_error}")
                    page.image_status = "failed"
                    page.image_error = str(comfy_error)
                    session.commit()
                    raise
                
                page.image_completed_at = datetime.now(timezone.utc)
                session.commit()
                
                # Update progress
                progress = 25.0 + (50.0 * (i + 1) / total_pages)
                book.progress_percentage = progress
                session.commit()
                
            except Exception as page_error:
                session.rollback()
                print(f"Failed to process page {page.page_number}: {page_error}")
                page.image_status = "failed"
                page.image_error = str(page_error)
                session.commit()
                raise
        
        if _should_abort(book.id, my_run_token):
            print(f"[Abort] Cancelled after images stage for book {book_id}")
            return
        book.images_completed_at = datetime.now(timezone.utc)
        book.progress_percentage = 80.0
        session.commit()
        
        # Stage 3: Compose PDF
        print("Stage 3: Creating PDF...")
        book.status = "composing"
        book.progress_percentage = 85.0
        session.commit()
        if _should_abort(book.id, my_run_token):
            print(f"[Abort] Cancelled before composing for book {book_id}")
            return
        
        # Prepare data for PDF generation
        media_root = get_media_root()
        books_dir = media_root / "books"
        books_dir.mkdir(parents=True, exist_ok=True)
        
        pdf_filename = f"book_{book.id}_{book.title.replace(' ', '_')}.pdf"
        pdf_path = books_dir / pdf_filename
        
        # Get all pages with their data
        pages = session.query(BookPage).filter_by(book_id=book.id).order_by(BookPage.page_number).all()

        # Best-effort: enrich pages with workflow slug from story_data so the
        # PDF composer can treat special Qwen cover/end pages as full-image.
        page_meta_by_number: Dict[int, Dict[str, Any]] = {}
        try:
            if book.story_data:
                sd = json.loads(book.story_data)
                if isinstance(sd, dict):
                    for pg in sd.get("pages", []):
                        try:
                            num = int(pg.get("page"))
                        except Exception:
                            continue
                        page_meta_by_number[num] = pg if isinstance(pg, dict) else {}
        except Exception:
            page_meta_by_number = {}

        pages_data = []
        for page in pages:
            meta = page_meta_by_number.get(page.page_number) or {}
            pages_data.append(
                {
                    "text_content": page.text_content,
                    "image_path": page.image_path,
                    "page_number": page.page_number,
                    "workflow": (meta.get("workflow") if isinstance(meta, dict) else None),
                }
            )
        
        # Create PDF
        pdf_path_str = book_composer.create_book_pdf(
            {
                'title': book.title,
                'theme': book.theme,
                'target_age': book.target_age,
                'preview_image_path': book.preview_image_path,
            },
            pages_data,
            str(pdf_path)
        )
        
        book.pdf_path = pdf_path_str
        book.pdf_generated_at = datetime.now(timezone.utc)
        book.progress_percentage = 95.0
        session.commit()
        
        # Stage 4: Finalize
        print("Stage 4: Finalizing...")
        book.status = "completed"
        book.progress_percentage = 100.0
        book.completed_at = datetime.now(timezone.utc)
        session.commit()
        
        print(f"✅ Book creation completed successfully for '{book.title}'")
        print(f"PDF saved to: {pdf_path_str}")
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Book creation failed for book {book_id}: {error_msg}")
        # Explicitly capture in Sentry (in addition to RQ integration) and log to console
        try:
            import sentry_sdk  # type: ignore
            evt = sentry_sdk.capture_exception(e)  # type: ignore
            try:
                print(f"[Sentry] worker job exception captured: book={book_id} event_id={evt}")
            except Exception:
                pass
        except Exception:
            # Sentry not configured or import failed; ignore
            pass

        book.status = "failed"
        book.error_message = error_msg
        book.completed_at = datetime.now(timezone.utc)
        session.commit()
        
        raise
        
    finally:
        session.close()
def _reset_book_state(book: Book):
    book.status = "creating"
    book.progress_percentage = 0.0
    book.error_message = None
    book.story_data = None
    book.story_generated_at = None
    book.images_completed_at = None
    book.pdf_generated_at = None
    book.completed_at = None
    book.pdf_path = None
    book.preview_image_path = None


def admin_regenerate_book(book_id: int, new_prompt: Optional[str] = None):
    """Reset book assets and trigger a fresh generation"""
    session = _Session()
    try:
        book = session.query(Book).get(book_id)
        if not book:
            print(f"Admin regenerate: book {book_id} not found")
            return

        if new_prompt is not None:
            book.positive_prompt = new_prompt.strip()

        pages = session.query(BookPage).filter(BookPage.book_id == book.id).all()
        for page in pages:
            if page.image_path and os.path.exists(page.image_path):
                try:
                    os.remove(page.image_path)
                except FileNotFoundError:
                    pass

        if book.pdf_path and os.path.exists(book.pdf_path):
            try:
                os.remove(book.pdf_path)
            except FileNotFoundError:
                pass

        session.query(BookPage).filter(BookPage.book_id == book.id).delete()

        _reset_book_state(book)
        session.commit()
    except Exception as exc:
        session.rollback()
        raise exc
    finally:
        session.close()

    # Invalidate any older runs and clear cancel flag
    _set_run_token(book_id)
    create_childbook(book_id)

def get_childbook_workflow(slug: Optional[str]) -> tuple[Dict[str, Any], int, str]:
    slug = slug or "base"
    session = _Session()
    try:
        definition = (
            session.query(WorkflowDefinition)
            .filter(WorkflowDefinition.slug == slug, WorkflowDefinition.is_active.is_(True))
            .order_by(WorkflowDefinition.version.desc())
            .first()
        )
        if not definition:
            raise Exception(f"Workflow definition '{slug}' not found")
        content = definition.content if isinstance(definition.content, dict) else json.loads(definition.content)
        return copy.deepcopy(content), definition.version, definition.slug
    finally:
        session.close()


def create_placeholder_image(page_number: int, book_title: str) -> str:
    """Create a placeholder image when ComfyUI is not available"""
    try:
        from PIL import Image, ImageDraw, ImageFont
        
        # Create a simple placeholder image
        width, height = 800, 600
        img = Image.new('RGB', (width, height), color='#E8F4FD')
        draw = ImageDraw.Draw(img)
        
        # Try to use a nice font, fall back to default
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 40)
            small_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        except:
            font = ImageFont.load_default()
            small_font = ImageFont.load_default()
        
        # Draw placeholder content
        text = f"Page {page_number}"
        subtitle = f"Illustration for\n{book_title}"
        
        # Center the text
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (width - text_width) // 2
        y = (height - text_height) // 2 - 50
        
        # Draw main text
        draw.text((x, y), text, fill='#2E86AB', font=font)
        
        # Draw subtitle
        bbox2 = draw.textbbox((0, 0), subtitle, font=small_font)
        text_width2 = bbox2[2] - bbox2[0]
        x2 = (width - text_width2) // 2
        y2 = y + text_height + 20
        
        draw.text((x2, y2), subtitle, fill='#666666', font=small_font)
        
        # Draw a simple border
        draw.rectangle([10, 10, width-10, height-10], outline='#CCCCCC', width=3)
        
        # Save placeholder
        media_root = get_media_root()
        placeholders_dir = media_root / "placeholders"
        placeholders_dir.mkdir(parents=True, exist_ok=True)
        
        placeholder_path = placeholders_dir / f"placeholder_page_{page_number}.png"
        img.save(placeholder_path)
        
        return str(placeholder_path)
        
    except Exception as e:
        print(f"Failed to create placeholder image: {e}")
        return None

# Note: keep this module import-safe; do not execute local test code here.
