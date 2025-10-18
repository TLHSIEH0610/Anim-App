import os
import json
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
from app.story_generator import OllamaStoryGenerator, enhance_childbook_prompt
from reportlab.lib.pagesizes import A4, letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Image, Spacer, PageBreak, Table
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from PIL import Image as PILImage
import textwrap
from typing import Dict, Optional, Any

from app.storage import move_to

BASE_INSTANT_PROMPT = (
    "Genrih Valk illustration, children's book illustration, watercolor style, "
    "soft pastel colors, whimsical art, storybook character, friendly cartoon style, "
    "hand-drawn illustration, warm lighting, child-friendly art style"
)

DEFAULT_NEGATIVE_PROMPT = "text, watermark, low quality, medium quality, blurry, censored, wrinkles, distorted"

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
OLLAMA_SERVER = os.getenv("OLLAMA_SERVER", "http://localhost:11434")


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
    for key, value in replacements.items():
        text = text.replace(f"{{{key}}}", value)
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
    name = params.get("name") or (book.character_description or "The hero")
    name = name.strip() or "The hero"
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
        or template.default_age
        or ""
    )
    age_value = str(age_value) if age_value is not None else ""
    replacements["age"] = age_value
    replacements["Age"] = age_value

    template_pages = sorted(template.pages, key=lambda p: p.page_number)
    if not template_pages:
        raise ValueError(f"Story template '{template.slug}' has no pages configured")

    pages = []
    overrides: Dict[int, Dict[str, str]] = {}

    for index in range(book.page_count):
        page_number = index + 1
        page_template = template_pages[index % len(template_pages)]

        story_text = _format_template_text(page_template.story_text, replacements)
        image_prompt = _format_template_text(page_template.image_prompt, replacements)
        positive_prompt = _format_template_text(page_template.positive_prompt, replacements) if page_template.positive_prompt else ""
        negative_prompt = _format_template_text(page_template.negative_prompt, replacements) if getattr(page_template, "negative_prompt", None) else ""
        pose_prompt = _format_template_text(page_template.pose_prompt, replacements) if page_template.pose_prompt else ""
        keypoint_slug = page_template.keypoint_image

        pages.append(
            {
                "page": page_number,
                "text": story_text,
                "image_description": image_prompt,
                "image_kp": keypoint_slug,
            }
        )

        override: Dict[str, str] = {}
        if positive_prompt.strip():
            override["positive"] = positive_prompt.strip()
        if negative_prompt.strip():
            override["negative"] = negative_prompt.strip()
        if keypoint_slug:
            override["keypoint"] = keypoint_slug
        if pose_prompt and pose_prompt.strip():
            override["pose"] = pose_prompt.strip()
        overrides[page_number] = override

    story_data = {
        "title": book.title,
        "pages": pages,
        "age_group": book.target_age or template.default_age,
        "theme": template.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "template",
        "model": template.workflow_slug,
    }

    return story_data, overrides


def _randomize_k_sampler_seeds(workflow: Dict[str, Any]) -> None:
    """Assign fresh 64-bit seeds to every KSampler node for variability."""
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
        self.margin = 0.75 * inch
        
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
            
            doc = SimpleDocTemplate(
                output_path,
                pagesize=A4,
                rightMargin=self.margin,
                leftMargin=self.margin,
                topMargin=self.margin,
                bottomMargin=self.margin
            )
            
            story = []
            styles = getSampleStyleSheet()
            
            # Custom styles for children's books
            title_style = ParagraphStyle(
                'BookTitle',
                parent=styles['Heading1'],
                fontSize=28,
                spaceAfter=30,
                textColor=colors.HexColor('#2E86AB'),
                alignment=TA_CENTER,
                fontName='Helvetica-Bold'
            )
            
            subtitle_style = ParagraphStyle(
                'BookSubtitle',
                parent=styles['Normal'],
                fontSize=16,
                spaceAfter=20,
                textColor=colors.HexColor('#A23B72'),
                alignment=TA_CENTER,
                fontName='Helvetica-Oblique'
            )
            
            story_style = ParagraphStyle(
                'StoryText',
                parent=styles['Normal'],
                fontSize=14,
                spaceAfter=16,
                alignment=TA_CENTER,
                fontName='Helvetica',
                leading=22,
                leftIndent=20,
                rightIndent=20
            )
            
            page_number_style = ParagraphStyle(
                'PageNumber',
                parent=styles['Normal'],
                fontSize=12,
                textColor=colors.grey,
                alignment=TA_CENTER,
                fontName='Helvetica'
            )
            
            # Title page
            story.append(Spacer(1, 50))
            story.append(Paragraph(book_data['title'], title_style))
            story.append(Paragraph(f"A {book_data.get('theme', 'wonderful')} story for ages {book_data.get('target_age', '6-8')}", subtitle_style))
            story.append(Spacer(1, 100))
            
            # Add decorative element if we have the first page image
            if pages_data and pages_data[0].get('image_path') and os.path.exists(pages_data[0]['image_path']):
                try:
                    cover_img = self.resize_image_for_page(pages_data[0]['image_path'], max_width=4*inch, max_height=4*inch)
                    story.append(cover_img)
                except Exception as e:
                    print(f"Warning: Could not add cover image: {e}")
            
            story.append(PageBreak())
            
            # Story pages
            for i, page_data in enumerate(pages_data, 1):
                # Add image if available
                if page_data.get('image_path') and os.path.exists(page_data['image_path']):
                    try:
                        img = self.resize_image_for_page(page_data['image_path'])
                        story.append(img)
                        story.append(Spacer(1, 20))
                    except Exception as e:
                        print(f"Warning: Could not add image for page {i}: {e}")
                        story.append(Spacer(1, 100))  # Placeholder space
                
                # Add text with proper wrapping
                text_content = page_data.get('text_content', '')
                if text_content:
                    # Clean and format text
                    clean_text = text_content.strip()
                    story.append(Paragraph(clean_text, story_style))
                else:
                    story.append(Paragraph("(Illustration)", story_style))
                
                story.append(Spacer(1, 30))
                
                # Page number (skip last page to avoid blank page)
                if i < len(pages_data):
                    story.append(Paragraph(f"Page {i}", page_number_style))
                    story.append(PageBreak())
            
            # Build the PDF
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
            max_height = (self.page_height - (2 * self.margin)) * 0.6
        
        try:
            # Open image to get dimensions
            with PILImage.open(image_path) as pil_img:
                original_width, original_height = pil_img.size
                
            # Calculate scaling factor
            width_scale = max_width / original_width
            height_scale = max_height / original_height
            scale = min(width_scale, height_scale, 1.0)  # Don't upscale
            
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
        book_composer = BookComposer()
        template_prompt_overrides: Dict[int, Dict[str, str]] = {}
        template_obj: Optional[StoryTemplate] = None
        workflow_slug = "base"
        story_generator: Optional[OllamaStoryGenerator] = None
        is_template = (book.story_source or "custom") == "template"
        if is_template:
            template_obj = _load_story_template(book.template_key)
            if not template_obj:
                raise Exception("Story template not found or inactive")
            if not book.target_age:
                book.target_age = template_obj.default_age
            story_data, template_prompt_overrides = _build_story_from_template(book, template_obj)
            workflow_slug = template_obj.workflow_slug or "base"
        else:
            story_generator = OllamaStoryGenerator(OLLAMA_SERVER)
            workflow_slug = "base"

        # Stage 1: Generate story text
        print("Stage 1: Generating story...")
        book.status = "generating_story"
        book.progress_percentage = 10.0
        session.commit()

        if not is_template:
            assert story_generator is not None
            if not story_generator.check_model_availability():
                print("Warning: Ollama not available, using fallback story generation")
                story_data = story_generator.generate_fallback_story(
                    book.title,
                    book.character_description,
                    book.page_count
                )
            else:
                story_data = story_generator.generate_story(
                    title=book.title,
                    theme=book.theme,
                    age_group=book.target_age,
                    page_count=book.page_count,
                    character_description=book.character_description,
                    positive_prompt=book.positive_prompt,
                    negative_prompt=book.negative_prompt
                )

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
        keypoint_cache: Dict[str, str] = {}
        total_pages = len(pages)
        
        for i, page in enumerate(pages):
            try:
                print(f"Generating image for page {page.page_number}...")
                page.image_status = "processing"
                page.image_started_at = datetime.now(timezone.utc)
                session.commit()
                
                prompt_override = template_prompt_overrides.get(page.page_number, {})
                keypoint_slug = prompt_override.get("keypoint")

                enhanced_prompts = enhance_childbook_prompt(
                    page.image_description,
                    book.theme or "custom",
                    book.target_age or "6-8",
                    f"Page {page.page_number} of children's book",
                    character_description=book.character_description,
                )
                positive_override = prompt_override.get("positive")
                page.enhanced_prompt = positive_override or enhanced_prompts.get("positive") or page.image_description

                negative_override = prompt_override.get("negative")
                negative_prompt = negative_override or enhanced_prompts.get("negative") or DEFAULT_NEGATIVE_PROMPT
                session.commit()

                # Try to generate image with ComfyUI
                try:
                    # Load appropriate workflow
                    workflow, workflow_version, workflow_slug_active = get_childbook_workflow(workflow_slug)
                    print(f"🔍 Debug ComfyUI workflow for page {page.page_number}:")
                    print(f"   Theme: {book.theme}")
                    print(f"   Workflow slug: {workflow_slug_active}")
                    print(f"   Workflow version: {workflow_version}")
                    print(f"   Workflow loaded successfully with {len(workflow)} nodes")

                    try:
                        image_paths = json.loads(book.original_image_paths) if book.original_image_paths else []
                    except:
                        image_paths = [book.original_image_paths] if book.original_image_paths else []

                    print(f"Using {len(image_paths)} reference image(s) for character consistency")

                    keypoint_filename: Optional[str] = None
                    if keypoint_slug:
                        cached_filename = keypoint_cache.get(keypoint_slug)
                        if cached_filename:
                            keypoint_filename = cached_filename
                        else:
                            kp_record = (
                                session.query(ControlNetImage)
                                .filter(ControlNetImage.slug == keypoint_slug)
                                .first()
                            )
                            if kp_record and kp_record.image_path and os.path.exists(kp_record.image_path):
                                try:
                                    keypoint_filename = comfyui_client._upload_image(kp_record.image_path)
                                    print(f"Uploaded keypoint '{keypoint_slug}' as {keypoint_filename}")
                                    keypoint_cache[keypoint_slug] = keypoint_filename
                                except Exception as upload_error:
                                    print(f"Failed to upload keypoint image '{keypoint_slug}': {upload_error}")
                            else:
                                print(f"Keypoint image '{keypoint_slug}' not found or missing path")

                    # Generate image with ComfyUI
                    print(f"Starting ComfyUI processing for page {page.page_number}...")
                    print(f"Using enhanced prompt: {page.enhanced_prompt}")

                    _randomize_k_sampler_seeds(workflow)

                    result = comfyui_client.process_image_to_animation(
                        image_paths,
                        copy.deepcopy(workflow),
                        page.enhanced_prompt,
                        negative_prompt,
                        keypoint_filename=keypoint_filename,
                    )

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
                    
                    if result["status"] == "success":
                        page.image_status = "completed"
                        print(f"✅ Image generated for page {page.page_number}")
                    else:
                        raise Exception(f"ComfyUI processing failed: {result.get('error', 'Unknown error')}")
                        
                except Exception as comfy_error:
                    session.rollback()
                    print(f"ComfyUI failed for page {page.page_number}: {comfy_error}")
                    # Use mock/placeholder image
                    page.image_path = create_placeholder_image(page.page_number, book.title)
                    page.image_status = "completed"
                    page.image_error = str(comfy_error)
                
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
        
        book.images_completed_at = datetime.now(timezone.utc)
        book.progress_percentage = 80.0
        session.commit()
        
        # Stage 3: Compose PDF
        print("Stage 3: Creating PDF...")
        book.status = "composing"
        book.progress_percentage = 85.0
        session.commit()
        
        # Prepare data for PDF generation
        media_root = get_media_root()
        books_dir = media_root / "books"
        books_dir.mkdir(parents=True, exist_ok=True)
        
        pdf_filename = f"book_{book.id}_{book.title.replace(' ', '_')}.pdf"
        pdf_path = books_dir / pdf_filename
        
        # Get all pages with their data
        pages = session.query(BookPage).filter_by(book_id=book.id).order_by(BookPage.page_number).all()
        
        pages_data = []
        for page in pages:
            pages_data.append({
                'text_content': page.text_content,
                'image_path': page.image_path,
                'page_number': page.page_number
            })
        
        # Create PDF
        pdf_path_str = book_composer.create_book_pdf(
            {
                'title': book.title,
                'theme': book.theme,
                'target_age': book.target_age
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

# Test function
def test_book_creation():
    """Test book creation with sample data"""
    from app.models import User, Book
    
    session = _Session()
    
    # Create a test book
    test_book = Book(
        user_id=1,  # Assuming user 1 exists
        title="The Magic Garden Adventure",
        theme="adventure",
        target_age="6-8",
        page_count=4,
        character_description="a curious young girl with brown hair",
        positive_prompt="colorful flowers, friendly animals, magical sparkles",
        negative_prompt="scary, dark, violence",
        original_image_path="/tmp/test_image.jpg",  # You'd need a real image here
        status="creating"
    )
    
    session.add(test_book)
    session.commit()
    
    print(f"Created test book with ID: {test_book.id}")
    
    # Run the creation process
    try:
        create_childbook(test_book.id)
        print("✅ Test book creation completed!")
    except Exception as e:
        print(f"❌ Test failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test_book_creation()
