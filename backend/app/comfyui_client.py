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
from datetime import datetime
import urllib3

# Disable SSL warnings when using verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ComfyUIClient:
    def __init__(self, server_address: str = "127.0.0.1:8188"):
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
        # Determine if the server address includes the protocol (http/https)
        if "://" in server_address:
            self.base_url = server_address
        else:
            # Default to http if no protocol specified
            self.base_url = f"http://{server_address}"
        
    def _build_url(self, endpoint: str) -> str:
        """Build a full URL for the given endpoint"""
        return f"{self.base_url}/{endpoint.lstrip('/')}"
    
    def _get_request_kwargs(self) -> dict:
        """Get request kwargs that handle SSL for both HTTP and HTTPS"""
        # For HTTPS URLs, we might need to disable SSL verification for local development
        # with self-signed certificates, but keep verification for production domains
        if self.base_url.startswith('https://'):
            # Check if this is a local development URL that might have self-signed certificates
            if 'localhost' in self.base_url or '127.0.0.1' in self.base_url:
                # Disable SSL verification for local development with self-signed certificates
                return {'verify': False, 'timeout': 30}
            else:
                # Keep SSL verification for production domains (like Cloudflare proxied domains)
                return {'verify': True, 'timeout': 30}
        else:
            # HTTP URLs don't need SSL verification
            return {'timeout': 30}
    
    def queue_prompt(self, prompt: Dict[str, Any]) -> str:
        """Queue a prompt and return the prompt ID"""
        url = self._build_url("prompt")
        request_kwargs = self._get_request_kwargs()
        response = requests.post(url, json={"prompt": prompt, "client_id": self.client_id}, **request_kwargs)
        response.raise_for_status()
        return response.json()["prompt_id"]
    
    def get_history(self, prompt_id: str) -> Optional[Dict]:
        """Get the history/results for a prompt"""
        url = self._build_url(f"history/{prompt_id}")
        request_kwargs = self._get_request_kwargs()
        response = requests.get(url, **request_kwargs)
        if response.status_code == 200:
            return response.json()
        return None
    
    def get_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """Download an image from ComfyUI"""
        url = self._build_url("view")
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        request_kwargs = self._get_request_kwargs()
        response = requests.get(url, params=params, **request_kwargs)
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
    
    def prepare_dynamic_workflow(self, workflow: Dict[str, Any], image_filenames: list) -> Dict[str, Any]:
        """
        Dynamically adjust workflow based on number of images (1-4)

        Args:
            workflow: Base workflow JSON
            image_filenames: List of uploaded image filenames (1-4 images)

        Returns:
            Modified workflow optimized for the number of images
        """
        num_images = len(image_filenames)

        # Update LoadImage nodes with actual filenames
        image_nodes = ["13", "94", "98", "100"]
        for i, filename in enumerate(image_filenames):
            if i < len(image_nodes) and image_nodes[i] in workflow:
                workflow[image_nodes[i]]["inputs"]["image"] = filename

        # Modify workflow structure based on number of images
        if num_images == 1:
            # Single image: Connect node 13 directly to ApplyInstantID (node 60)
            workflow["60"]["inputs"]["image"] = ["13", 0]
            # Remove unused nodes
            for node_id in ["75", "94", "95", "98", "101", "100"]:
                if node_id in workflow:
                    del workflow[node_id]

        elif num_images == 2:
            # Two images: Use node 75 (batch 13+94), connect to node 60
            workflow["60"]["inputs"]["image"] = ["75", 0]
            # Remove unused nodes
            for node_id in ["95", "98", "101", "100"]:
                if node_id in workflow:
                    del workflow[node_id]

        elif num_images == 3:
            # Three images: Use nodes 75 (13+94) and 95 (75+98), connect 95 to node 60
            workflow["60"]["inputs"]["image"] = ["95", 0]
            # Remove unused nodes
            for node_id in ["101", "100"]:
                if node_id in workflow:
                    del workflow[node_id]

        else:  # num_images == 4
            # Four images: Use all batch nodes (75, 95, 101), connect 101 to node 60
            workflow["60"]["inputs"]["image"] = ["101", 0]

        return workflow

    def process_image_to_animation(
        self,
        input_image_paths: list,
        workflow_json: Dict[str, Any],
        custom_prompt: str | None = None,
        control_prompt: str | None = None,
    ) -> Dict:
        """
        Process image(s) through ComfyUI workflow

        Args:
            input_image_paths: List of paths to input images (1-4 images)
            workflow_json: ComfyUI workflow JSON
            custom_prompt: Optional custom prompt to override default

        Returns:
            Dict with status, output_path, and error info
        """
        try:
            # Ensure input_image_paths is a list
            if isinstance(input_image_paths, str):
                input_image_paths = [input_image_paths]

            # Validate number of images
            if not input_image_paths or len(input_image_paths) > 4:
                return {
                    "status": "failed",
                    "error": f"Invalid number of images: {len(input_image_paths)}. Must be 1-4 images."
                }

            print(f"Processing {len(input_image_paths)} image(s) with ComfyUI")

            # Upload all images to ComfyUI
            image_filenames = []
            for i, image_path in enumerate(input_image_paths):
                print(f"Uploading image {i+1}/{len(input_image_paths)}: {image_path}")
                filename = self._upload_image(image_path)
                print(f"[ComfyUI] Uploaded image stored as: {filename}")
                image_filenames.append(filename)

            # Prepare workflow with dynamic adjustments based on number of images
            import copy
            workflow = copy.deepcopy(workflow_json)
            workflow = self.prepare_dynamic_workflow(workflow, image_filenames)

            # Debug log: surface the filenames wired into each LoadImage node
            try:
                load_nodes = [node_id for node_id in ["13", "94", "98", "100"] if node_id in workflow]
                resolved_inputs = {
                    node_id: workflow[node_id]["inputs"].get("image")
                    for node_id in load_nodes
                    if isinstance(workflow[node_id].get("inputs"), dict)
                }
                print(f"[ComfyUI] Resolved LoadImage inputs: {resolved_inputs}")
            except Exception as debug_error:
                print(f"[ComfyUI] Failed to log LoadImage inputs: {debug_error}")

            # Update workflow with custom prompt if provided
            if custom_prompt or control_prompt:
                workflow = self._update_prompt(workflow, custom_prompt, control_prompt)

            # Log workflow snapshot before queueing
            self._log_workflow_snapshot(workflow)

            # Queue the prompt
            prompt_id = self.queue_prompt(workflow)

            # Wait for completion
            result = self.wait_for_completion(prompt_id)

            vae_preview_path = self._download_intermediate_image(result.get("outputs"), ["102", "83", "84", "91", "15"])

            if result["status"] == "completed" and result["outputs"]:
                # Download the result
                output_path = self._download_result(result["outputs"])
                return {
                    "status": "success",
                    "output_path": output_path,
                    "prompt_id": prompt_id,
                    "workflow": workflow,
                    "vae_preview_path": vae_preview_path,
                }
            else:
                return {
                    "status": "failed",
                    "error": result.get("error", "Unknown error"),
                    "prompt_id": prompt_id,
                    "workflow": workflow,
                    "vae_preview_path": vae_preview_path,
                }

        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
                "workflow": locals().get("workflow"),
                "prompt_id": locals().get("prompt_id"),
                "vae_preview_path": None,
            }
    
    def _upload_image(self, image_path: str) -> str:
        """Upload image to ComfyUI"""
        url = self._build_url("upload/image")
        
        request_kwargs = self._get_request_kwargs()
        # For upload, we need to update timeout separately
        request_kwargs['timeout'] = 60
        
        with open(image_path, 'rb') as f:
            files = {'image': f}
            response = requests.post(url, files=files, **request_kwargs)
            response.raise_for_status()
            data = response.json()
            print(f"[ComfyUI] Upload response: {data}")
            return data['name']
    
    def _update_prompt(
        self,
        workflow: Dict[str, Any],
        custom_prompt: Optional[str],
        control_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update workflow JSON with custom prompt

        Args:
            workflow: Workflow JSON
            custom_prompt: Custom prompt text

        Returns:
            Updated workflow
        """
        # Find the positive prompt CLIPTextEncode node and update it with custom prompt
        # First, try to find nodes with "children's book illustration" (old workflow)
        if custom_prompt is None:
            return workflow

        positive_nodes = ["39", "8", "10"]
        control_nodes = ["80"]

        for node_id in workflow:
            node = workflow[node_id]
            if node.get("class_type") == "CLIPTextEncode" and "text" in node.get("inputs", {}):
                original = node["inputs"]["text"]
                if node_id in positive_nodes:
                    node["inputs"]["text"] = custom_prompt
                    print(f"Updating node {node_id} prompt from: {original}" )
                    print(f"Updated node {node_id} prompt to: {custom_prompt}")
                elif node_id in control_nodes:
                    if control_prompt is None:
                        continue
                    node["inputs"]["text"] = control_prompt
                    print(f"Updating node {node_id} control prompt from: {original}")
                    print(f"Updated node {node_id} control prompt to: {control_prompt}")

        return workflow

    def _log_workflow_snapshot(self, workflow: Dict[str, Any]) -> None:
        """Log key workflow inputs prior to queuing"""
        try:
            snapshot = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "client_id": self.client_id,
                "nodes": {}
            }

            for node_id, node in workflow.items():
                class_type = node.get("class_type")
                if class_type == "LoadImage":
                    snapshot["nodes"][node_id] = {
                        "class_type": class_type,
                        "image": node.get("inputs", {}).get("image")
                    }
                elif class_type == "CLIPTextEncode":
                    snapshot["nodes"][node_id] = {
                        "class_type": class_type,
                        "text": node.get("inputs", {}).get("text")
                    }
                elif class_type == "ApplyInstantID":
                    snapshot["nodes"][node_id] = {
                        "class_type": class_type,
                        "image": node.get("inputs", {}).get("image"),
                        "weight": node.get("inputs", {}).get("weight"),
                    }

            print(f"[ComfyUI] Workflow snapshot before queue: {json.dumps(snapshot, indent=2)}")
        except Exception as snapshot_error:
            print(f"[ComfyUI] Failed to log workflow snapshot: {snapshot_error}")

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

    def _download_intermediate_image(self, outputs: Optional[Dict[str, Any]], node_ids) -> Optional[str]:
        """Download an intermediate image (e.g. VAE decode) for debugging/preview"""
        if not outputs:
            return None

        if isinstance(node_ids, str):
            node_ids = [node_ids]

        for node_id in node_ids:
            node_outputs = outputs.get(node_id)
            if not node_outputs or "images" not in node_outputs:
                continue

            for image_info in node_outputs["images"]:
                filename = image_info.get("filename")
                if not filename:
                    continue

                subfolder = image_info.get("subfolder", "")
                folder_type = image_info.get("type", "output")

                try:
                    image_data = self.get_image(filename, subfolder=subfolder, folder_type=folder_type)
                except Exception as e:
                    print(f"[ComfyUI] Failed to download intermediate image {filename}: {e}")
                    continue

                media_root = os.getenv("MEDIA_ROOT", self._get_default_media_root())
                output_dir = Path(media_root) / "intermediates"
                output_dir.mkdir(parents=True, exist_ok=True)

                output_path = output_dir / f"vae_preview_{int(time.time())}_{filename}"
                try:
                    with open(output_path, "wb") as f:
                        f.write(image_data)
                    return str(output_path)
                except Exception as write_error:
                    print(f"[ComfyUI] Failed to store intermediate image {filename}: {write_error}")
                    continue

        return None

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
