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

from app.monitoring import record_comfy_stage, log_comfy_poll
try:
    import sentry_sdk
except Exception:
    sentry_sdk = None

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
        context = {"server": self.base_url}
        with record_comfy_stage("comfyui.queue_prompt", context) as event:
            response = requests.post(
                url,
                json={"prompt": prompt, "client_id": self.client_id},
                **request_kwargs,
            )
            response.raise_for_status()
            prompt_id = response.json()["prompt_id"]
            event["context"]["prompt_id"] = prompt_id
            event["context"]["workflow_nodes"] = len(prompt)
            return prompt_id
    
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
        attempts = 0
        context = {"prompt_id": prompt_id, "poll_interval": poll_interval, "timeout": timeout}

        with record_comfy_stage("comfyui.wait_for_completion", context) as event:
            while (time.time() - start_time) < timeout:
                try:
                    attempts += 1
                    # Poll the history endpoint instead of using WebSocket
                    history = self.get_history(prompt_id)
                    
                    if history and prompt_id in history:
                        prompt_data = history[prompt_id]
                        
                        # Check if completed successfully
                        if "outputs" in prompt_data and prompt_data["outputs"]:
                            result["status"] = "completed"
                            result["outputs"] = prompt_data["outputs"]
                            event["context"]["attempts"] = attempts
                            event["context"]["result"] = "completed"
                            print(f"✅ ComfyUI processing completed for {prompt_id}")
                            log_comfy_poll(prompt_id, "completed", attempts)
                            return result
                        
                        # Check for errors in status
                        if "status" in prompt_data and "error" in prompt_data["status"]:
                            result["status"] = "failed" 
                            result["error"] = prompt_data["status"]["error"]
                            event["context"]["attempts"] = attempts
                            event["context"]["result"] = "error"
                            print(f"❌ ComfyUI processing failed: {result['error']}")
                            log_comfy_poll(prompt_id, "error", attempts, {"message": result["error"]})
                            return result
                    
                    # Still processing, wait and check again
                    log_comfy_poll(prompt_id, "pending", attempts)
                    time.sleep(poll_interval)
                    
                except Exception as e:
                    print(f"Error polling ComfyUI status: {e}")
                    log_comfy_poll(prompt_id, "exception", attempts, {"message": str(e)})
                    if sentry_sdk is not None:
                        sentry_sdk.capture_exception(e)
                    time.sleep(poll_interval)
            
            # Timeout reached
            result["error"] = f"Timeout after {timeout}s waiting for ComfyUI completion"
            event["context"]["attempts"] = attempts
            event["context"]["result"] = "timeout"
            print(f"⏰ ComfyUI processing timed out after {timeout}s")
            log_comfy_poll(prompt_id, "timeout", attempts)
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
        image_nodes = ["13", "94", "98", "101"]
        for i, filename in enumerate(image_filenames):
            if i < len(image_nodes) and image_nodes[i] in workflow:
                workflow[image_nodes[i]]["inputs"]["image"] = filename

        # Resolve ApplyInstantID node dynamically (node id may shift between workflow versions)
        apply_node_id = None
        for node_id, node in workflow.items():
            if node.get("class_type") == "ApplyInstantID" or (
                node.get("class_type") == "ApplyInstantIDAdvanced"
                or "apply instantid" in node.get("_meta", {}).get("title", "").lower()
            ):
                apply_node_id = node_id
                break

        if not apply_node_id:
            raise KeyError("ApplyInstantID node not found in workflow; cannot configure reference images")

        # Modify workflow structure based on number of images
        if num_images == 1:
            # Single image: Connect node 13 directly to ApplyInstantID
            workflow[apply_node_id]["inputs"]["image"] = ["13", 0]
            # Remove unused nodes
            for node_id in ["75", "94", "95", "98", "101"]:
                if node_id in workflow:
                    del workflow[node_id]

        elif num_images == 2:
            # Two images: Use node 75 (batch 13+94) and feed ApplyInstantID
            workflow[apply_node_id]["inputs"]["image"] = ["75", 0]
            # Remove unused nodes
            for node_id in ["95", "98", "101"]:
                if node_id in workflow:
                    del workflow[node_id]

        elif num_images == 3:
            # Three images: Use nodes 75 (13+94) and 95 (75+98), feed ApplyInstantID
            workflow[apply_node_id]["inputs"]["image"] = ["95", 0]
            # Remove unused nodes
            for node_id in ["101"]:
                if node_id in workflow:
                    del workflow[node_id]

        else:  # num_images == 4
            # Four images: Use all batch nodes (75, 95, 101) before ApplyInstantID
            workflow[apply_node_id]["inputs"]["image"] = ["101", 0]

        return workflow

    def process_image_to_animation(
        self,
        input_image_paths: list,
        workflow_json: Dict[str, Any],
        custom_prompt: str | None = None,
        control_prompt: str | None = None,
        keypoint_filename: str | None = None,
        fixed_basename: Optional[str] = None,
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
        with record_comfy_stage(
            "comfyui.process_image_to_animation",
            {
                "reference_images": len(input_image_paths) if isinstance(input_image_paths, list) else 1,
                "custom_prompt": bool(custom_prompt),
            },
        ) as event:
            try:
                # Ensure input_image_paths is a list
                if isinstance(input_image_paths, str):
                    input_image_paths = [input_image_paths]

                # Validate number of images (allow zero for prompt-only tests)
                if input_image_paths is None:
                    input_image_paths = []
                if len(input_image_paths) > 4:
                    event["status"] = "error"
                    event["context"]["reason"] = "invalid_image_count"
                    return {
                        "status": "failed",
                        "error": f"Invalid number of images: {len(input_image_paths)}. Must be 0-4 images.",
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
                if image_filenames:
                    workflow = self.prepare_dynamic_workflow(workflow, image_filenames)

                # Inject keypoint into the workflow if provided
                if keypoint_filename:
                    try:
                        # Prefer wiring via ApplyInstantID*'s image_kps link
                        apply_node_id = None
                        for node_id, node in workflow.items():
                            if node.get("class_type") in {"ApplyInstantID", "ApplyInstantIDAdvanced"}:
                                apply_node_id = node_id
                                break
                        load_node_id = None
                        if apply_node_id:
                            apply_inputs = workflow[apply_node_id].get("inputs", {})
                            link = apply_inputs.get("image_kps") or apply_inputs.get("image_kp")
                            if isinstance(link, list) and len(link) >= 1 and isinstance(link[0], str):
                                load_node_id = link[0]
                        # Fallback to common node ids in our workflows
                        if not load_node_id:
                            for candidate in ["109", "100", "128"]:
                                node = workflow.get(candidate)
                                if node and node.get("class_type") == "LoadImage":
                                    load_node_id = candidate
                                    break
                        # Last resort: pick any LoadImage node whose image hints keypoints/pose
                        if not load_node_id:
                            for node_id, node in workflow.items():
                                if node.get("class_type") != "LoadImage":
                                    continue
                                img = node.get("inputs", {}).get("image")
                                if isinstance(img, str) and any(h in img.lower() for h in ("keypoint", "pose", "instantid")):
                                    load_node_id = node_id
                                    break
                        if load_node_id and "inputs" in workflow.get(load_node_id, {}):
                            workflow[load_node_id]["inputs"]["image"] = keypoint_filename
                            workflow[load_node_id]["inputs"]["load_from_upload"] = True
                            print(f"[ComfyUI] Updated keypoint node {load_node_id} with image: {keypoint_filename}")
                        elif "100" in workflow and "inputs" in workflow["100"]:
                            # Legacy fallback: node 100 manual set
                            workflow["100"]["inputs"]["image"] = keypoint_filename
                            workflow["100"]["inputs"]["load_from_upload"] = True
                            print(f"[ComfyUI] Updated keypoint node 100 with image: {keypoint_filename}")
                        else:
                            print("[ComfyUI] Warning: Could not locate a LoadImage node for keypoints to inject")
                    except Exception as inj_err:
                        print(f"[ComfyUI] Keypoint injection failed: {inj_err}")

                # Debug log: surface the filenames wired into each LoadImage node
                try:
                    load_nodes = [node_id for node_id in ["13", "94", "98", "100", "109", "128"] if node_id in workflow]
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
                event["context"]["prompt_id"] = prompt_id

                # Wait for completion
                result = self.wait_for_completion(prompt_id)

                vae_preview_path = self._download_intermediate_image(
                    result.get("outputs"),
                    ["102", "83", "84", "91", "15"],
                )

                if result["status"] == "completed" and result["outputs"]:
                    # Download the result
                    output_path = self._download_result(result["outputs"], fixed_basename=fixed_basename)
                    event["context"]["result"] = "success"
                    return {
                        "status": "success",
                        "output_path": output_path,
                        "prompt_id": prompt_id,
                        "workflow": workflow,
                        "vae_preview_path": vae_preview_path,
                    }
                else:
                    event["status"] = "error"
                    event["context"]["result"] = "failed"
                    event["context"]["error"] = result.get("error")
                    return {
                        "status": "failed",
                        "error": result.get("error", "Unknown error"),
                        "prompt_id": prompt_id,
                        "workflow": workflow,
                        "vae_preview_path": vae_preview_path,
                    }

            except Exception as e:
                event["status"] = "error"
                event["context"]["result"] = "exception"
                event["context"]["error"] = str(e)
                if sentry_sdk is not None:
                    sentry_sdk.capture_exception(e)
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
        file_size = None
        try:
            file_size = os.path.getsize(image_path)
        except OSError:
            pass
        with record_comfy_stage(
            "comfyui.upload_image",
            {"server": self.base_url, "file": image_path, "bytes": file_size},
        ) as event:
            with open(image_path, 'rb') as f:
                files = {'image': f}
                response = requests.post(url, files=files, **request_kwargs)
                response.raise_for_status()
                data = response.json()
                event["context"]["response"] = data.get("name")
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
        positive_nodes = ["39"]
        negative_nodes = ["40"]

        for node_id, node in workflow.items():
            if node.get("class_type") == "CLIPTextEncode" and "text" in node.get("inputs", {}):
                original = node["inputs"]["text"]
                if custom_prompt is not None and node_id in positive_nodes:
                    node["inputs"]["text"] = custom_prompt
                    print(f"Updating node {node_id} prompt from: {original}")
                    print(f"Updated node {node_id} prompt to: {custom_prompt}")
                elif control_prompt is not None and node_id in negative_nodes:
                    node["inputs"]["text"] = control_prompt
                    print(f"Updating node {node_id} negative prompt from: {original}")
                    print(f"Updated node {node_id} negative prompt to: {control_prompt}")

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
                elif class_type in {"ApplyInstantID", "ApplyInstantIDAdvanced"}:
                    snapshot["nodes"][node_id] = {
                        "class_type": class_type,
                        "image": node.get("inputs", {}).get("image"),
                        "weight": node.get("inputs", {}).get("weight"),
                    }

            print(f"[ComfyUI] Workflow snapshot before queue: {json.dumps(snapshot, indent=2)}")
        except Exception as snapshot_error:
            print(f"[ComfyUI] Failed to log workflow snapshot: {snapshot_error}")

    def _download_result(self, outputs: Dict[str, Any], fixed_basename: Optional[str] = None) -> str:
        """Download the result and save to local storage"""
        # Cross-platform path handling
        media_root = os.getenv("MEDIA_ROOT", self._get_default_media_root())
        output_dir = Path(media_root) / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        with record_comfy_stage(
            "comfyui.download_result",
            {"server": self.base_url, "output_dir": str(output_dir)},
        ) as event:
            # First, try to find SaveImage node outputs (node 25 for advanced workflows, node 10 for simple workflows)
            # These produce files with predictable names and are the intended final outputs
            for node_id, node_outputs in outputs.items():
                if node_id in ["25", "10"] and "images" in node_outputs:  # SaveImage nodes
                    image_info = node_outputs["images"][0]
                    filename = image_info["filename"]
                    subfolder = image_info.get("subfolder", "")
                    folder_type = image_info.get("type", "output")
                    print(f"Found SaveImage output from node {node_id}: {filename}")

                    # Download the file
                    image_data = self.get_image(filename, subfolder=subfolder, folder_type=folder_type)

                    # Save locally with cross-platform path (optionally fixed name)
                    if fixed_basename:
                        from pathlib import Path as _P
                        output_path = output_dir / f"{fixed_basename}{_P(filename).suffix}"
                    else:
                        output_path = output_dir / f"result_{int(time.time())}_{filename}"
                    with open(output_path, 'wb') as f:
                        f.write(image_data)

                    event["context"]["filename"] = filename
                    event["context"]["node_id"] = node_id
                    return str(output_path)

            # If no SaveImage node found, look for any saved images (not temp files)
            fallback_image = None
            fallback_info = None

            for node_id, node_outputs in outputs.items():
                if "images" not in node_outputs:
                    continue

                for image_info in node_outputs["images"]:
                    filename = image_info.get("filename")
                    if not filename:
                        continue

                    subfolder = image_info.get("subfolder", "")
                    folder_type = image_info.get("type", "output")

                    # Prefer non-temp outputs but keep the first temp as fallback
                    if "temp" not in (filename or "").lower():
                        print(f"Found non-temp output: {filename} from node {node_id}")
                        image_data = self.get_image(filename, subfolder=subfolder, folder_type=folder_type)
                        if fixed_basename:
                            from pathlib import Path as _P
                            output_path = output_dir / f"{fixed_basename}{_P(filename).suffix}"
                        else:
                            output_path = output_dir / f"result_{int(time.time())}_{filename}"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        event["context"]["filename"] = filename
                        event["context"]["node_id"] = node_id
                        return str(output_path)

                    if fallback_image is None:
                        fallback_image = (filename, subfolder, folder_type)
                        fallback_info = (node_id, image_info)

            if fallback_image:
                filename, subfolder, folder_type = fallback_image
                node_id, _ = fallback_info
                print(f"Falling back to temp output {filename} from node {node_id}")
                image_data = self.get_image(filename, subfolder=subfolder, folder_type=folder_type)
                if fixed_basename:
                    from pathlib import Path as _P
                    output_path = output_dir / f"{fixed_basename}{_P(filename).suffix}"
                else:
                    output_path = output_dir / f"result_{int(time.time())}_{filename}"
                with open(output_path, 'wb') as f:
                    f.write(image_data)
                event["context"]["filename"] = filename
                event["context"]["node_id"] = node_id
                event["context"]["fallback"] = True
                return str(output_path)

            event["status"] = "error"
            raise Exception("No image outputs found in workflow result")

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
