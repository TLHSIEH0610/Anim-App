import json
import uuid
import requests
import websocket
import threading
import time
import platform
from typing import Dict, Any, Optional
from pathlib import Path
import os

class ComfyUIClient:
    def __init__(self, server_address: str = "127.0.0.1:8188"):
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
        
    def queue_prompt(self, prompt: Dict[str, Any]) -> str:
        """Queue a prompt and return the prompt ID"""
        url = f"http://{self.server_address}/prompt"
        data = {"prompt": prompt, "client_id": self.client_id}
        response = requests.post(url, json=data, timeout=30)
        response.raise_for_status()
        return response.json()["prompt_id"]
    
    def get_history(self, prompt_id: str) -> Optional[Dict]:
        """Get the history/results for a prompt"""
        url = f"http://{self.server_address}/history/{prompt_id}"
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            return response.json()
        return None
    
    def get_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """Download an image from ComfyUI"""
        url = f"http://{self.server_address}/view"
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.content
    
    def wait_for_completion(self, prompt_id: str, timeout: int = 1800) -> Dict:
        """Wait for prompt completion using polling instead of WebSocket to avoid hangs"""
        result = {"status": "failed", "error": None, "outputs": None}
        
        start_time = time.time()
        poll_interval = 2  # Check every 2 seconds
        
        print(f"Waiting for ComfyUI completion (prompt_id: {prompt_id})")
        
        while (time.time() - start_time) < timeout:
            try:
                # Poll the history endpoint instead of using WebSocket
                history = self.get_history(prompt_id)
                
                if history and prompt_id in history:
                    prompt_data = history[prompt_id]
                    
                    # Check if completed successfully
                    if "outputs" in prompt_data and prompt_data["outputs"]:
                        result["status"] = "completed"
                        result["outputs"] = prompt_data["outputs"]
                        print(f"✅ ComfyUI processing completed for {prompt_id}")
                        return result
                    
                    # Check for errors in status
                    if "status" in prompt_data and "error" in prompt_data["status"]:
                        result["status"] = "failed" 
                        result["error"] = prompt_data["status"]["error"]
                        print(f"❌ ComfyUI processing failed: {result['error']}")
                        return result
                
                # Still processing, wait and check again
                time.sleep(poll_interval)
                
            except Exception as e:
                print(f"Error polling ComfyUI status: {e}")
                time.sleep(poll_interval)
        
        # Timeout reached
        result["error"] = f"Timeout after {timeout}s waiting for ComfyUI completion"
        print(f"⏰ ComfyUI processing timed out after {timeout}s")
        return result
    
    def process_image_to_animation(self, input_image_path: str, workflow_json: Dict[str, Any], custom_prompt: str = None) -> Dict:
        """
        Process an image through ComfyUI workflow
        
        Args:
            input_image_path: Path to input image
            workflow_json: ComfyUI workflow JSON
            
        Returns:
            Dict with status, output_path, and error info
        """
        try:
            # Upload the image to ComfyUI
            image_filename = self._upload_image(input_image_path)
            
            # Update workflow with the uploaded image and custom prompt
            workflow = self._prepare_workflow(workflow_json, image_filename, custom_prompt)
            
            # Queue the prompt
            prompt_id = self.queue_prompt(workflow)
            
            # Wait for completion
            result = self.wait_for_completion(prompt_id)
            
            if result["status"] == "completed" and result["outputs"]:
                # Download the result
                output_path = self._download_result(result["outputs"])
                return {
                    "status": "success",
                    "output_path": output_path,
                    "prompt_id": prompt_id
                }
            else:
                return {
                    "status": "failed",
                    "error": result.get("error", "Unknown error"),
                    "prompt_id": prompt_id
                }
                
        except Exception as e:
            return {
                "status": "failed",
                "error": str(e)
            }
    
    def _upload_image(self, image_path: str) -> str:
        """Upload image to ComfyUI"""
        url = f"http://{self.server_address}/upload/image"
        
        with open(image_path, 'rb') as f:
            files = {'image': f}
            response = requests.post(url, files=files, timeout=60)
            response.raise_for_status()
            return response.json()['name']
    
    def _prepare_workflow(self, workflow: Dict[str, Any], image_filename: str, custom_prompt: str = None) -> Dict[str, Any]:
        """
        Update workflow JSON to use the uploaded image and custom prompt
        
        Note: This needs to be customized based on your specific workflow structure
        """
        # Find the Load Image node and update it
        for node_id, node in workflow.items():
            if node.get("class_type") == "LoadImage":
                node["inputs"]["image"] = image_filename
                break
        
        # Find the positive prompt CLIPTextEncode node and update it with custom prompt
        if custom_prompt:
            # First, try to find nodes with "children's book illustration" (old workflow)
            updated = False
            for node_id, node in workflow.items():
                if (node.get("class_type") == "CLIPTextEncode" and 
                    "text" in node.get("inputs", {}) and 
                    "children's book illustration" in node["inputs"]["text"]):
                    print(f"Updating prompt from: {node['inputs']['text']}")
                    node["inputs"]["text"] = custom_prompt
                    print(f"Updated prompt to: {custom_prompt}")
                    updated = True
                    break
            
            # If not found, update the main positive prompt nodes (nodes 8 and 10 in new workflow)
            if not updated:
                for node_id in ["8", "10"]:
                    if (node_id in workflow and 
                        workflow[node_id].get("class_type") == "CLIPTextEncode" and
                        "text" in workflow[node_id].get("inputs", {})):
                        print(f"Updating node {node_id} prompt from: {workflow[node_id]['inputs']['text']}")
                        workflow[node_id]["inputs"]["text"] = custom_prompt
                        print(f"Updated node {node_id} prompt to: {custom_prompt}")
                        updated = True
                
                if not updated:
                    print("⚠️ Warning: No suitable CLIPTextEncode node found to update with custom prompt")
        
        return workflow
    
    def _download_result(self, outputs: Dict[str, Any]) -> str:
        """Download the result and save to local storage"""
        # Cross-platform path handling
        media_root = os.getenv("MEDIA_ROOT", self._get_default_media_root())
        output_dir = Path(media_root) / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # First, try to find SaveImage node outputs (node 25 for advanced workflows, node 10 for simple workflows)
        # These produce files with predictable names and are the intended final outputs
        for node_id, node_outputs in outputs.items():
            if node_id in ["25", "10"] and "images" in node_outputs:  # SaveImage nodes
                image_info = node_outputs["images"][0]
                filename = image_info["filename"]
                print(f"Found SaveImage output from node {node_id}: {filename}")
                
                # Download the file
                image_data = self.get_image(filename)
                
                # Save locally with cross-platform path
                output_path = output_dir / f"result_{int(time.time())}_{filename}"
                with open(output_path, 'wb') as f:
                    f.write(image_data)
                
                return str(output_path)
        
        # If no SaveImage node found, look for any saved images (not temp files)
        for node_id, node_outputs in outputs.items():
            if "images" in node_outputs:
                for image_info in node_outputs["images"]:
                    filename = image_info["filename"]
                    # Skip temp files - they're preview images, not final outputs
                    if "temp" not in filename.lower():
                        print(f"Found non-temp output: {filename} from node {node_id}")
                        
                        # Download the file
                        image_data = self.get_image(filename)
                        
                        # Save locally with cross-platform path
                        output_path = output_dir / f"result_{int(time.time())}_{filename}"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        
                        return str(output_path)
        
        raise Exception("No SaveImage or non-temp output images found in workflow result")
    
    def _get_default_media_root(self) -> str:
        """Get default media root based on platform"""
        system = platform.system().lower()
        
        if system == "windows":
            # Windows: Use app data or current directory
            return os.path.expanduser("~/Documents/AnimApp/media")
        elif system == "darwin":  # macOS
            # macOS: Use user's Documents folder
            return os.path.expanduser("~/Documents/AnimApp/media")
        else:  # Linux and others
            # Linux: Use standard location
            return "/data/media"