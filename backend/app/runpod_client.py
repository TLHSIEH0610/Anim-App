import base64
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import json

import requests
import copy

from app.comfyui_client import ComfyUIClient


class RunPodServerlessClient:
    """
    Minimal client for RunPod Serverless queue-based endpoints.

    Expects:
      - RUNPOD_API_KEY: API key for Authorization bearer.
      - RUNPOD_ENDPOINT_ID: Endpoint ID (the segment in /v2/{id}/run).
      - Optional RUNPOD_BASE_URL (defaults to https://api.runpod.ai/v2).

    Uses the standard worker-comfyui contract:
      POST /run  { "input": { "workflow": {...}, "images": [...] } }
      GET  /status/{id} -> { "status": "...", "output": { "images": [...] } }
    """

    def __init__(
        self,
        endpoint_id: str,
        api_key: str,
        base_url: Optional[str] = None,
    ) -> None:
        self.endpoint_id = endpoint_id
        self.api_key = api_key
        self.base_url = (base_url or os.getenv("RUNPOD_BASE_URL") or "https://api.runpod.ai/v2").rstrip("/")

    def _url(self, path: str) -> str:
        return f"{self.base_url}/{self.endpoint_id}/{path.lstrip('/')}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def run_and_wait(
        self,
        input_payload: Dict[str, Any],
        timeout: int = 1800,
        poll_interval: float = 2.0,
    ) -> Dict[str, Any]:
        """
        Submit a job via /run and poll /status until completion.
        """
        resp = requests.post(
            self._url("run"),
            headers=self._headers(),
            json={"input": input_payload},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        job_id = data.get("id") or data.get("jobId") or data.get("job_id")
        if not job_id:
            raise RuntimeError(f"RunPod /run did not return a job id: {data}")

        start = time.time()
        while time.time() - start < timeout:
            try:
                # Allow RunPod up to 20 minutes to respond to each /status
                sresp = requests.get(
                    self._url(f"status/{job_id}"),
                    headers=self._headers(),
                    timeout=1200,
                )
                sresp.raise_for_status()
                sdata = sresp.json()
                status = (sdata.get("status") or sdata.get("state") or "").upper()
                if status in {"COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"}:
                    return sdata
            except (requests.Timeout, requests.ConnectionError):
                # Treat transient status timeouts as a signal to retry until
                # the overall timeout is reached.
                pass
            time.sleep(poll_interval)

        raise TimeoutError(f"RunPod job {job_id} did not complete within {timeout}s")


class RunPodImageFallback:
    """
    Adapter that takes the same inputs as the ComfyUIClient image flow
    (workflow + images + prompts) and executes them via worker-comfyui
    on RunPod, returning a local output_path.
    """

    def __init__(self, client: RunPodServerlessClient) -> None:
        self.client = client

    def _build_workflow(
        self,
        base_workflow: Dict[str, Any],
        image_names: List[str],
        custom_prompt: Optional[str],
        control_prompt: Optional[str],
        keypoint_name: Optional[str],
    ) -> Dict[str, Any]:
        """
        Clone and adjust the workflow to reference the provided image names
        and update prompts, reusing ComfyUIClient's helper logic.
        """
        wf = copy.deepcopy(base_workflow)
        client = ComfyUIClient("http://dummy")  # base_url unused for helpers

        if image_names:
            wf = client.prepare_dynamic_workflow(wf, image_names)

        if keypoint_name:
            try:
                meta = wf.get("_meta", {}) if isinstance(wf, dict) else {}
                apply_node_id = meta.get("instantid_apply_node")
                if not apply_node_id:
                    for node_id, node in wf.items():
                        if node.get("class_type") in {"ApplyInstantID", "ApplyInstantIDAdvanced"}:
                            apply_node_id = node_id
                            break
                load_node_id = None
                if apply_node_id:
                    apply_inputs = wf[apply_node_id].get("inputs", {})
                    link = apply_inputs.get("image_kps") or apply_inputs.get("image_kp")
                    if isinstance(link, list) and len(link) >= 1 and isinstance(link[0], str):
                        load_node_id = link[0]
                if not load_node_id:
                    kp_meta = meta.get("keypoint_load_node")
                    if kp_meta:
                        load_node_id = kp_meta
                if not load_node_id:
                    for candidate in ["109", "100", "128"]:
                        node = wf.get(candidate)
                        if node and node.get("class_type") == "LoadImage":
                            load_node_id = candidate
                            break
                if not load_node_id:
                    for node_id, node in wf.items():
                        if node.get("class_type") != "LoadImage":
                            continue
                        img = node.get("inputs", {}).get("image")
                        if isinstance(img, str) and any(h in img.lower() for h in ("keypoint", "pose", "instantid")):
                            load_node_id = node_id
                            break
                if load_node_id and "inputs" in wf.get(load_node_id, {}):
                    wf[load_node_id].setdefault("inputs", {})["image"] = keypoint_name
                    wf[load_node_id]["inputs"]["load_from_upload"] = True
            except Exception:
                # Non-fatal; keypoint injection is best-effort
                pass

        if custom_prompt or control_prompt:
            wf = client._update_prompt(wf, custom_prompt, control_prompt)

        return wf

    def process_image_to_animation(
        self,
        workflow_json: Dict[str, Any],
        input_image_paths: List[str],
        custom_prompt: Optional[str] = None,
        control_prompt: Optional[str] = None,
        fixed_basename: Optional[str] = None,
        keypoint_image_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the workflow via worker-comfyui on RunPod and store
        the first returned image as a local PNG.
        """
        # Prepare images: base64 encode and assign names
        images_payload: List[Dict[str, str]] = []
        image_names: List[str] = []
        for idx, path in enumerate(input_image_paths or []):
            name = f"input_image_{idx+1}.png"
            try:
                with open(path, "rb") as f:
                    raw = f.read()
                b64 = base64.b64encode(raw).decode("ascii")
            except Exception as e:
                return {"status": "failed", "error": f"Failed to read image {path}: {e}"}
            images_payload.append(
                {
                    "name": name,
                    "image": f"data:image/png;base64,{b64}",
                }
            )
            image_names.append(name)

        keypoint_name: Optional[str] = None
        if keypoint_image_path:
            try:
                with open(keypoint_image_path, "rb") as f:
                    raw = f.read()
                b64 = base64.b64encode(raw).decode("ascii")
                keypoint_name = "keypoint_image.png"
                images_payload.append(
                    {
                        "name": keypoint_name,
                        "image": f"data:image/png;base64,{b64}",
                    }
                )
            except Exception:
                keypoint_name = None

        workflow = self._build_workflow(
            workflow_json,
            image_names,
            custom_prompt,
            control_prompt,
            keypoint_name,
        )

        # Worker-comfyui expects every top-level key in `workflow` to represent
        # a node with a `class_type`. The ComfyUI graph format uses auxiliary
        # metadata keys (e.g. `_meta`) which are valid in the UI but cause
        # RunPod to report "node is missing the class_type property" for
        # `#_meta`. Strip those keys from the payload we send, but retain the
        # original workflow (with _meta) in the result for snapshots/debugging.
        if isinstance(workflow, dict):
            workflow_for_run = {
                k: v for k, v in workflow.items() if not (isinstance(k, str) and k.startswith("_"))
            }
        else:
            workflow_for_run = workflow

        input_payload: Dict[str, Any] = {"workflow": workflow_for_run}
        if images_payload:
            input_payload["images"] = images_payload

        # Light debug preview (no full base64 dumps)
        try:
            preview = {
                "workflow_keys": list(workflow.keys()) if isinstance(workflow, dict) else None,
                "image_names": [img["name"] for img in images_payload],
                "has_keypoint": bool(keypoint_name),
                "prompt_present": bool(custom_prompt),
                "negative_present": bool(control_prompt),
            }
            print("[RunPod][DebugInput]", json.dumps(preview))
        except Exception:
            pass

        result = self.client.run_and_wait(input_payload)
        status = (result.get("status") or result.get("state") or "").upper()
        if status != "COMPLETED":
            try:
                print("[RunPod][ErrorResult]", json.dumps(result)[:4000])
            except Exception:
                pass
            return {
                "status": "failed",
                "error": f"RunPod status {status or 'UNKNOWN'}",
                "raw": result,
            }

        output = result.get("output") or {}
        images = output.get("images") or []
        first = None
        for img in images:
            if img.get("type") == "base64" and img.get("data"):
                first = img
                break
        if not first:
            return {
                "status": "failed",
                "error": "RunPod output missing base64 image",
                "raw": result,
            }

        image_b64 = first["data"]

        media_root = os.getenv("MEDIA_ROOT", "/data/media")
        tmp_dir = Path(media_root) / "tmp_runpod"
        tmp_dir.mkdir(parents=True, exist_ok=True)

        basename = fixed_basename or f"runpod_image_{int(time.time())}"
        tmp_path = tmp_dir / f"{basename}.png"
        try:
            decoded = base64.b64decode(image_b64)
            with open(tmp_path, "wb") as f:
                f.write(decoded)
        except Exception as e:
            return {
                "status": "failed",
                "error": f"Failed to decode/store RunPod image: {e}",
                "raw": result,
            }

        return {
            "status": "success",
            "output_path": str(tmp_path),
            "workflow": workflow,
            "vae_preview_path": None,
        }
