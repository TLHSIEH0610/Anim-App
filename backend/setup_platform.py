#!/usr/bin/env python3
"""
Cross-platform setup script for AnimApp backend
Creates necessary directories and configuration based on the current platform
"""

import os
import platform
from pathlib import Path
import json

def get_platform_config():
    """Get configuration based on current platform"""
    system = platform.system().lower()
    
    if system == "windows":
        base_dir = Path.home() / "Documents" / "AnimApp"
        return {
            "media_root": str(base_dir / "media"),
            "workflow_dir": str(base_dir / "workflows"),
            "database_url": "postgresql://arnie:password@localhost:5432/appdb",
            "redis_url": "redis://localhost:6379/0",
            "comfyui_server": "127.0.0.1:8188"
        }
    elif system == "darwin":  # macOS
        base_dir = Path.home() / "Documents" / "AnimApp"
        return {
            "media_root": str(base_dir / "media"),
            "workflow_dir": str(base_dir / "workflows"), 
            "database_url": "postgresql://arnie:password@localhost:5432/appdb",
            "redis_url": "redis://localhost:6379/0",
            "comfyui_server": "127.0.0.1:8188"
        }
    else:  # Linux/Docker
        return {
            "media_root": "/data/media",
            "workflow_dir": "/app/workflows",
            "database_url": "postgresql://arnie:password@db:5432/appdb", 
            "redis_url": "redis://redis:6379/0",
            "comfyui_server": "127.0.0.1:8188"
        }

def create_directories(config):
    """Create necessary directories"""
    print("Creating directories...")
    
    # Create media directories
    media_root = Path(config["media_root"])
    (media_root / "inputs").mkdir(parents=True, exist_ok=True)
    (media_root / "outputs").mkdir(parents=True, exist_ok=True)
    print(f"✅ Created media directories: {media_root}")
    
    # Create workflow directory
    workflow_dir = Path(config["workflow_dir"])
    workflow_dir.mkdir(parents=True, exist_ok=True)
    print(f"✅ Created workflow directory: {workflow_dir}")
    
    return workflow_dir

def create_example_workflow(workflow_dir):
    """Create an example ComfyUI workflow"""
    workflow_path = workflow_dir / "image_to_animation.json"
    
    # Example basic workflow structure (you'll need to replace this with your actual ComfyUI workflow)
    example_workflow = {
        "3": {
            "inputs": {
                "seed": 156680208700286,
                "steps": 20,
                "cfg": 8,
                "sampler_name": "euler",
                "scheduler": "normal", 
                "denoise": 0.75,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            },
            "class_type": "KSampler"
        },
        "4": {
            "inputs": {
                "ckpt_name": "sd_xl_base_1.0.safetensors"
            },
            "class_type": "CheckpointLoaderSimple"
        },
        "5": {
            "inputs": {
                "pixels": ["8", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEEncode"
        },
        "6": {
            "inputs": {
                "text": "masterpiece, best quality, animated",
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "7": {
            "inputs": {
                "text": "worst quality, low quality",
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "8": {
            "inputs": {
                "image": "example.png"
            },
            "class_type": "LoadImage"
        },
        "9": {
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEDecode"
        },
        "10": {
            "inputs": {
                "images": ["9", 0]
            },
            "class_type": "SaveImage"
        }
    }
    
    with open(workflow_path, 'w') as f:
        json.dump(example_workflow, f, indent=2)
    
    print(f"✅ Created example workflow: {workflow_path}")
    print("⚠️  Remember to replace this with your actual ComfyUI workflow!")

def create_env_file(config):
    """Create .env file with platform-specific settings"""
    env_content = f"""# AnimApp Configuration - {platform.system()}
DATABASE_URL={config['database_url']}
REDIS_URL={config['redis_url']}
COMFYUI_SERVER={config['comfyui_server']}
MEDIA_ROOT={config['media_root']}
COMFYUI_WORKFLOW={config['workflow_dir']}/image_to_animation.json
SECRET_KEY=dev-secret-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=43200
"""
    
    with open('.env', 'w') as f:
        f.write(env_content)
    
    print("✅ Created .env file")

def main():
    print(f"Setting up AnimApp for {platform.system()} ({platform.machine()})")
    print("=" * 50)
    
    config = get_platform_config()
    workflow_dir = create_directories(config)
    create_example_workflow(workflow_dir)
    create_env_file(config)
    
    print("\n🎉 Setup complete!")
    print("\nNext steps:")
    print("1. Install dependencies: pip install -r requirements.txt")
    print("2. Set up PostgreSQL and Redis")
    print("3. Replace the example workflow with your ComfyUI workflow")
    print("4. Start ComfyUI with: python main.py --listen")
    print("5. Run the backend: uvicorn app.main:app --reload")

if __name__ == "__main__":
    main()