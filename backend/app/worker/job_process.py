# backend/worker/job_process.py
import os, time, json, platform, copy
from typing import Optional
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Job, WorkflowDefinition
from app.comfyui_client import ComfyUIClient
from app.runpod_client import RunPodServerlessClient, RunPodImageFallback
# from app.db import DATABASE_URL  # placeholder - will use environment variable instead

# Use database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://animapp:password@db:5432/animapp")
_engine = create_engine(DATABASE_URL)
_Session = sessionmaker(bind=_engine)

# ComfyUI configuration - cross-platform defaults
def get_default_workflow_path():
    """Get default workflow path based on platform"""
    if platform.system().lower() == "windows":
        return str(Path.home() / "Documents" / "AnimApp" / "workflows" / "Anmi-App.json")
    elif platform.system().lower() == "darwin":  # macOS
        # Check if we're in the project directory structure
        current_dir = Path(__file__).parent.parent.parent.parent
        project_workflow = current_dir / "workflows" / "Anmi-App.json"
        if project_workflow.exists():
            return str(project_workflow)
        return str(Path.home() / "Documents" / "AnimApp" / "workflows" / "Anmi-App.json")
    else:  # Linux/Docker
        return "/app/workflows/Anmi-App.json"

COMFYUI_SERVER = os.getenv("COMFYUI_SERVER", "127.0.0.1:8188")
WORKFLOW_PATH = os.getenv("COMFYUI_WORKFLOW", get_default_workflow_path())

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID")


def _get_runpod_fallback() -> Optional[RunPodImageFallback]:
    if RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID:
        client = RunPodServerlessClient(RUNPOD_ENDPOINT_ID, RUNPOD_API_KEY)
        return RunPodImageFallback(client)
    return None

def load_workflow() -> dict:
    """Load the ComfyUI workflow JSON"""
    session = _Session()
    try:
        definition = (
            session.query(WorkflowDefinition)
            .filter(
                WorkflowDefinition.slug == "base",
                WorkflowDefinition.is_active.is_(True),
            )
            .order_by(WorkflowDefinition.version.desc())
            .first()
        )
        if definition:
            content = definition.content if isinstance(definition.content, dict) else json.loads(definition.content)
            return copy.deepcopy(content)
    except Exception as db_error:
        print(f"Warning: unable to load workflow definition from database: {db_error}")
    finally:
        session.close()

    try:
        workflow_path = Path(WORKFLOW_PATH)
        if workflow_path.exists():
            with open(workflow_path, 'r') as f:
                return json.load(f)
        else:
            print(f"Warning: Workflow file not found at {WORKFLOW_PATH}")
            return None
    except Exception as e:
        print(f"Error loading workflow: {e}")
        return None

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

def comfyui_process_image(input_path: str) -> str:
    """Process image using ComfyUI"""
    workflow = load_workflow()
    if workflow is None:
        # Fallback to mock processing
        print("ComfyUI workflow not found, using mock processing")
        return mock_process_image(input_path)
    
    primary_error: Optional[Exception] = None
    result = None
    comfy_reachable = False
    client = ComfyUIClient(COMFYUI_SERVER)
    try:
        comfy_reachable = client._is_reachable(client.base_url)
    except Exception:
        comfy_reachable = False

    if comfy_reachable:
        try:
            # For this worker we only ever send a single image
            result = client.process_image_to_animation([input_path], workflow, keypoint_filename=None)
        except Exception as e:
            primary_error = e
    else:
        print("ComfyUI not reachable in job_process; using RunPod fallback.")

    if result and result.get("status") == "success" and result.get("output_path"):
        return result["output_path"]

    # Try RunPod Serverless fallback when configured, using the same workflow
    runpod = _get_runpod_fallback()
    if runpod:
        try:
            rp_result = runpod.process_image_to_animation(
                workflow,
                [input_path],
                custom_prompt=None,
                control_prompt=None,
                fixed_basename=f"job_{int(time.time())}",
            )
            if rp_result.get("status") == "success" and rp_result.get("output_path"):
                return rp_result["output_path"]
        except Exception as rp_err:
            print(f"RunPod fallback failed: {rp_err}")

    # Last resort: simple mock processing
    if primary_error:
        print(f"ComfyUI error: {primary_error}, falling back to mock processing")
    elif result:
        print(f"ComfyUI returned failure: {result}, falling back to mock processing")
    return mock_process_image(input_path)

def mock_process_image(input_path: str) -> str:
    """Fallback mock processing when ComfyUI is not available"""
    print(f"Using mock processing for {input_path}")
    time.sleep(4)  # Simulate processing time
    
    # Cross-platform output directory
    media_root = get_media_root()
    output_dir = media_root / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate output filename
    input_file = Path(input_path)
    output_filename = f"animated_{input_file.name}"
    output_path = output_dir / output_filename
    
    # Simple file copy (binary) - simulates processing
    with open(input_path, "rb") as rf:
        data = rf.read()
    with open(output_path, "wb") as wf:
        wf.write(data)
    
    return str(output_path)

def process_image(job_id: int, input_path: str):
    """Main function called by RQ worker to process an image"""
    session = _Session()
    job = session.query(Job).get(job_id)
    
    if job:
        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        session.commit()
        print(f"Starting processing for job {job_id}: {input_path}")
    
    try:
        # Try ComfyUI processing first, fallback to mock if needed
        output_path = comfyui_process_image(input_path)
        
        if job:
            job.status = "done"
            job.output_path = output_path
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
            print(f"Job {job_id} completed successfully: {output_path}")
            
    except Exception as e:
        error_msg = str(e)
        print(f"Job {job_id} failed: {error_msg}")
        
        if job:
            job.status = "failed"
            job.error = error_msg
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
        raise
        
    finally:
        session.close()
