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
        response = requests.post(url, json=data)
        response.raise_for_status()
        return response.json()["prompt_id"]
    
    def get_history(self, prompt_id: str) -> Optional[Dict]:
        """Get the history/results for a prompt"""
        url = f"http://{self.server_address}/history/{prompt_id}"
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()
        return None
    
    def get_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """Download an image from ComfyUI"""
        url = f"http://{self.server_address}/view"
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.content
    
    def wait_for_completion(self, prompt_id: str, timeout: int = 600) -> Dict:
        """Wait for prompt completion using WebSocket"""
        ws_url = f"ws://{self.server_address}/ws?clientId={self.client_id}"
        result = {"status": "failed", "error": None, "outputs": None}
        
        def on_message(ws, message):
            try:
                data = json.loads(message)
                if data["type"] == "execution_success" and data["data"]["prompt_id"] == prompt_id:
                    result["status"] = "completed"
                    # Get the final results
                    history = self.get_history(prompt_id)
                    if history and prompt_id in history:
                        result["outputs"] = history[prompt_id]["outputs"]
                    ws.close()
                elif data["type"] == "execution_error" and data["data"]["prompt_id"] == prompt_id:
                    result["status"] = "failed"
                    result["error"] = data["data"]["exception_message"]
                    ws.close()
            except Exception as e:
                result["error"] = str(e)
                ws.close()
        
        def on_error(ws, error):
            result["error"] = str(error)
        
        ws = websocket.WebSocketApp(ws_url, on_message=on_message, on_error=on_error)
        
        # Run WebSocket in a separate thread with timeout
        ws_thread = threading.Thread(target=ws.run_forever)
        ws_thread.daemon = True
        ws_thread.start()
        
        # Wait for completion or timeout
        start_time = time.time()
        while ws_thread.is_alive() and (time.time() - start_time) < timeout:
            time.sleep(1)
        
        if ws_thread.is_alive():
            ws.close()
            result["error"] = "Timeout waiting for completion"
        
        return result
    
    def process_image_to_animation(self, input_image_path: str, workflow_json: Dict[str, Any]) -> Dict:
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
            
            # Update workflow with the uploaded image
            workflow = self._prepare_workflow(workflow_json, image_filename)
            
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
            response = requests.post(url, files=files)
            response.raise_for_status()
            return response.json()['name']
    
    def _prepare_workflow(self, workflow: Dict[str, Any], image_filename: str) -> Dict[str, Any]:
        """
        Update workflow JSON to use the uploaded image
        
        Note: This needs to be customized based on your specific workflow structure
        """
        # Example: Find the Load Image node and update it
        for node_id, node in workflow.items():
            if node.get("class_type") == "LoadImage":
                node["inputs"]["image"] = image_filename
                break
        
        return workflow
    
    def _download_result(self, outputs: Dict[str, Any]) -> str:
        """Download the result and save to local storage"""
        # This needs to be customized based on your workflow output structure
        # Example for a typical animation output:
        
        # Cross-platform path handling
        media_root = os.getenv("MEDIA_ROOT", self._get_default_media_root())
        output_dir = Path(media_root) / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Find the output node (you'll need to adjust this based on your workflow)
        for node_id, node_outputs in outputs.items():
            if "images" in node_outputs:
                # Download the first image/animation
                image_info = node_outputs["images"][0]
                filename = image_info["filename"]
                
                # Download the file
                image_data = self.get_image(filename)
                
                # Save locally with cross-platform path
                output_path = output_dir / f"result_{int(time.time())}_{filename}"
                with open(output_path, 'wb') as f:
                    f.write(image_data)
                
                return str(output_path)
        
        raise Exception("No output images found in workflow result")
    
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