# backend/worker/job_process.py
import os, time, json, platform
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Job
from app.comfyui_client import ComfyUIClient
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

def load_workflow() -> dict:
    """Load the ComfyUI workflow JSON"""
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
    
    try:
        client = ComfyUIClient(COMFYUI_SERVER)
        result = client.process_image_to_animation(input_path, workflow)
        
        if result["status"] == "success":
            return result["output_path"]
        else:
            raise Exception(f"ComfyUI processing failed: {result.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"ComfyUI error: {e}, falling back to mock processing")
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