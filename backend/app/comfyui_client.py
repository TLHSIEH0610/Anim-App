import json
import uuid
import requests
import websocket
import threading
import time
import platform
from typing import Dict, Any, Optional, List
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
    def __init__(self, server_address: str = "127.0.0.1:8188", fallback_address: Optional[str] = None):
        self.server_address = server_address
        self.fallback_address = fallback_address
        self.client_id = str(uuid.uuid4())
        self.base_url = self._normalize(server_address)
        # If primary is unreachable and a fallback is provided, switch to it.
        if fallback_address and not self._is_reachable(self.base_url):
            alt = self._normalize(fallback_address)
            if self._is_reachable(alt):
                self.base_url = alt
                if sentry_sdk is not None:
                    try:
                        sentry_sdk.capture_message(f"ComfyUIClient switched to fallback server {alt}", level="warning")
                    except Exception:
                        pass
            else:
                # Still keep primary; errors will surface when used.
                if sentry_sdk is not None:
                    try:
                        sentry_sdk.capture_message("ComfyUIClient fallback unreachable; using primary despite failed check", level="warning")
                    except Exception:
                        pass

    def _normalize(self, addr: str) -> str:
        """Ensure server address has protocol."""
        if "://" in addr:
            return addr
        return f"http://{addr}"

    def _is_reachable(self, base_url: str) -> bool:
        """Lightweight reachability check against /system_stats."""
        url = f"{base_url.rstrip('/')}/system_stats"
        try:
            resp = requests.get(url, timeout=5, verify=not ("localhost" in base_url or "127.0.0.1" in base_url))
            return resp.status_code == 200
        except Exception:
            return False
        
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
    
    def _sanitize_prompt(self, prompt: Dict[str, Any]) -> Dict[str, Any]:
        """Remove non-node entries (e.g., _meta) that ComfyUI rejects.

        Keeps only items where the value is a dict containing a 'class_type'.
        """
        if not isinstance(prompt, dict):
            return prompt
        cleaned: Dict[str, Any] = {}
        for key, val in prompt.items():
            if isinstance(val, dict) and "class_type" in val:
                cleaned[key] = val
        return cleaned

    def _is_qwen_image_edit_workflow(self, workflow: Dict[str, Any]) -> bool:
        """Detect whether the workflow uses Qwen image-edit nodes."""
        try:
            for node in workflow.values():
                if isinstance(node, dict) and node.get("class_type") == "TextEncodeQwenImageEditPlus":
                    return True
        except Exception:
            pass
        return False

    def _prepare_qwen_image_edit_workflow(
        self,
        workflow: Dict[str, Any],
        story_image_name: str,
        face_image_name: str,
        custom_prompt: Optional[str] = None,
        control_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Wire story/body and face reference images into a Qwen image edit workflow."""
        try:
            for node_id, node in workflow.items():
                if not isinstance(node, dict):
                    continue
                if node.get("class_type") != "LoadImage":
                    continue
                meta = node.get("_meta", {}) if isinstance(node.get("_meta", {}), dict) else {}
                title = meta.get("title", "")
                inputs = node.setdefault("inputs", {})
                if title == "Body Reference":
                    inputs["image"] = story_image_name
                    inputs["load_from_upload"] = True
                elif title == "Face Reference":
                    inputs["image"] = face_image_name
                    inputs["load_from_upload"] = True

            if custom_prompt:
                for node in workflow.values():
                    if isinstance(node, dict) and node.get("class_type") == "TextEncodeQwenImageEditPlus":
                        inputs = node.setdefault("inputs", {})
                        inputs["prompt"] = custom_prompt
        except Exception as prep_err:
            print(f"[ComfyUI] Failed to prepare Qwen workflow: {prep_err}")
        return workflow

    def queue_prompt(self, prompt: Dict[str, Any]) -> str:
        """Queue a prompt and return the prompt ID"""
        url = self._build_url("prompt")
        request_kwargs = self._get_request_kwargs()
        context = {"server": self.base_url}
        with record_comfy_stage("comfyui.queue_prompt", context) as event:
            # Some exported/constructed graphs may include a top-level '_meta'.
            # ComfyUI expects only node-id keys with 'class_type'.
            safe_prompt = self._sanitize_prompt(prompt)
            response = requests.post(
                url,
                json={"prompt": safe_prompt, "client_id": self.client_id},
                **request_kwargs,
            )
            try:
                response.raise_for_status()
            except requests.HTTPError as e:
                # Include ComfyUI's error payload to make debugging 400s easier
                detail = None
                try:
                    detail = response.text
                except Exception:
                    detail = None
                msg = f"{e}"
                if detail:
                    msg = f"{e}: {detail}"
                try:
                    if sentry_sdk is not None:
                        sentry_sdk.capture_message(f"ComfyUI queue_prompt HTTPError: {msg}", level="warning")
                except Exception:
                    pass
                raise requests.HTTPError(msg, response=response) from e
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
    
    # Legacy workflow helpers removed.

    def process_image_to_animation(
        self,
        input_image_paths: list,
        workflow_json: Dict[str, Any],
        custom_prompt: str | None = None,
        control_prompt: str | None = None,
        fixed_basename: Optional[str] = None,
        story_image_path: Optional[str] = None,
    ) -> Dict:
        """
        Process image(s) through ComfyUI workflow

        Args:
            input_image_paths: List of paths to input images (1-3 images)
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
                if len(input_image_paths) > 3:
                    event["status"] = "error"
                    event["context"]["reason"] = "invalid_image_count"
                    return {
                        "status": "failed",
                        "error": f"Invalid number of images: {len(input_image_paths)}. Must be 0-3 images.",
                    }

                print(f"Processing {len(input_image_paths)} image(s) with ComfyUI")

                # Upload all face/reference images to ComfyUI
                image_filenames: List[str] = []
                for i, image_path in enumerate(input_image_paths):
                    print(f"Uploading image {i+1}/{len(input_image_paths)}: {image_path}")
                    filename = self._upload_image(image_path)
                    print(f"[ComfyUI] Uploaded image stored as: {filename}")
                    image_filenames.append(filename)

                story_image_uploaded: Optional[str] = None
                if story_image_path:
                    try:
                        story_image_uploaded = self._upload_image(story_image_path)
                        print(f"[ComfyUI] Uploaded story image stored as: {story_image_uploaded}")
                    except Exception as story_err:
                        print(f"[ComfyUI] Failed to upload story image '{story_image_path}': {story_err}")

                import copy
                workflow = copy.deepcopy(workflow_json)
                is_qwen = self._is_qwen_image_edit_workflow(workflow)

                if is_qwen and story_image_uploaded:
                    # Qwen image edit path: first reference image is the face; story/body image is separate.
                    if not image_filenames:
                        event["status"] = "error"
                        event["context"]["reason"] = "missing_face_reference"
                        return {
                            "status": "failed",
                            "error": "Qwen workflow requires at least one face reference image.",
                        }
                    face_filename = image_filenames[0]
                    workflow = self._prepare_qwen_image_edit_workflow(
                        workflow,
                        story_image_name=story_image_uploaded,
                        face_image_name=face_filename,
                        custom_prompt=custom_prompt,
                        control_prompt=control_prompt,
                    )
                else:
                    event["status"] = "error"
                    event["context"]["reason"] = "unsupported_workflow"
                    return {
                        "status": "failed",
                        "error": "Only Qwen (TextEncodeQwenImageEditPlus) workflows are supported.",
                    }

                # Log workflow snapshot before queueing
                self._log_workflow_snapshot(workflow)

                # Queue the prompt
                prompt_id = self.queue_prompt(workflow)
                event["context"]["prompt_id"] = prompt_id

                # Wait for completion
                result = self.wait_for_completion(prompt_id)

                preview_nodes = ["102", "83", "84", "91", "15"]
                vae_preview_path = self._download_intermediate_image(
                    result.get("outputs"),
                    preview_nodes,
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
            # If no preferred SaveImage node found, look for any saved images (not temp files)
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

    def process_strict(
        self,
        workflow_json: Dict[str, Any],
        upload_image_paths: Optional[list] = None,
        fixed_basename: Optional[str] = None,
    ) -> Dict:
        """Queue the provided workflow JSON as-is without dynamic rewrites.

        - Does not modify nodes (no prompt injection, no dynamic LoadImage wiring).
        - Optionally uploads reference images to make filenames available on ComfyUI.
        """
        with record_comfy_stage(
            "comfyui.process_strict",
            {
                "uploads": len(upload_image_paths or []),
            },
        ) as event:
            try:
                # Best-effort: upload images so referenced filenames exist on the server
                for p in upload_image_paths or []:
                    try:
                        self._upload_image(p)
                    except Exception:
                        pass

                import copy as _copy
                workflow = _copy.deepcopy(workflow_json)
                self._log_workflow_snapshot(workflow)
                prompt_id = self.queue_prompt(workflow)
                event["context"]["prompt_id"] = prompt_id
                result = self.wait_for_completion(prompt_id)

                preview_nodes = ["102", "83", "84", "91", "15"]
                vae_preview_path = self._download_intermediate_image(
                    result.get("outputs"), preview_nodes
                )

                if result.get("status") == "completed" and result.get("outputs"):
                    output_path = self._download_result(result["outputs"], fixed_basename=fixed_basename)
                    return {
                        "status": "success",
                        "output_path": output_path,
                        "prompt_id": prompt_id,
                        "workflow": workflow,
                        "vae_preview_path": vae_preview_path,
                    }

                return {"status": "failed", "error": result.get("error", "Unknown error")}
            except Exception as e:
                if sentry_sdk is not None:
                    sentry_sdk.capture_exception(e)
                return {"status": "failed", "error": str(e)}

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
