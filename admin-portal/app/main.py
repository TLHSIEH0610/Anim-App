import json
import os
from pathlib import Path
try:
    import sentry_sdk
    from sentry_sdk.integrations.starlette import StarletteIntegration
except Exception:
    sentry_sdk = None
from typing import Any, Dict
from datetime import datetime, timezone
from urllib.parse import quote_plus

import httpx
from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from itsdangerous import BadSignature, URLSafeSerializer
from starlette import status

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "tlhsieh0610@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "aa0910064312")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "animapp-admin-secret")
BACKEND_URL = os.getenv("ADMIN_BACKEND_URL", "http://backend:8000")
SESSION_SECRET = os.getenv("ADMIN_SESSION_SECRET", ADMIN_API_KEY)

serializer = URLSafeSerializer(SESSION_SECRET or "admin-session-secret", salt="animapp-admin")

_SENTRY_DSN = os.getenv("SENTRY_DSN")
if _SENTRY_DSN:
    try:
        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=os.getenv("SENTRY_ENV", "local"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
            integrations=[StarletteIntegration()],
        )
    except Exception:
        pass

app = FastAPI(title="AnimApp Admin Portal")

# Resolve template/static directories relative to this file to avoid CWD issues
_BASE_DIR = Path(__file__).parent
_TEMPLATES_DIR = _BASE_DIR / "templates"
_STATIC_DIR = _BASE_DIR / "static"

templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))
# Mount static only if the directory exists to prevent startup errors
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")



def _format_backend_error(exc: httpx.HTTPError) -> str:
    """Extract a concise message from HTTP errors returned by the backend."""
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        try:
            data = exc.response.json()
            if isinstance(data, dict) and data.get("detail"):
                return str(data["detail"])
        except Exception:
            pass
        return f"{exc.response.status_code} {exc.response.reason_phrase}"
    return str(exc)


def _parse_decimal_field(raw_value, field_label: str, *, required: bool = False) -> float | None:
    """Convert loosely formatted currency user input into a float or None."""
    text = str(raw_value).strip() if raw_value is not None else ""
    if not text:
        if required:
            raise ValueError(f"{field_label} is required")
        return None

    normalized = text.replace("$", "").replace(",", "")
    try:
        return float(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid {field_label}") from exc


def get_admin_session(request: Request) -> Dict[str, Any] | None:
    cookie = request.cookies.get("admin_session")
    if not cookie:
        return None
    try:
        data = serializer.loads(cookie)
    except BadSignature:
        return None
    return data


async def backend_request(method: str, path: str, **kwargs) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    headers["X-Admin-Secret"] = ADMIN_API_KEY
    # identify admin caller; backend uses this to enforce superadmin-only actions
    headers["X-Admin-Email"] = ADMIN_EMAIL
    async with httpx.AsyncClient(base_url=BACKEND_URL, timeout=60) as client:
        response = await client.request(method, path, headers=headers, **kwargs)
    response.raise_for_status()
    return response


async def render_controlnet_page(
    request: Request,
    session_data: dict,
    *,
    message: str | None = None,
    error: str | None = None,
    form_defaults: dict | None = None,
):
    images: list[dict] = []
    combined_error = error

    try:
        resp = await backend_request("GET", "/admin/keypoint-images")
        images = resp.json().get("images", [])
    except httpx.HTTPError as exc:
        combined_error = f"Failed to load keypoint images: {exc}" if not combined_error else f"{combined_error}; {exc}"

    if form_defaults is None:
        form_defaults = {
            "slug": "",
            "name": "",
        }

    context = {
        "request": request,
        "admin_email": session_data.get("email"),
        "images": images,
        "message": message,
        "error": combined_error,
        "form_defaults": form_defaults,
    }

    return templates.TemplateResponse("controlnet_images.html", context)


async def render_controlnet_edit_page(
    request: Request,
    session_data: dict,
    slug: str,
    *,
    message: str | None = None,
    error: str | None = None,
    form_defaults: dict | None = None,
):
    try:
        resp = await backend_request("GET", f"/admin/keypoint-images/{slug}")
        image = resp.json()
    except httpx.HTTPError as exc:
        redirect_error = quote_plus(f"Failed to load ControlNet image: {exc}")
        return RedirectResponse(f"/keypoint-images?error={redirect_error}", status_code=status.HTTP_303_SEE_OTHER)

    if form_defaults is None:
        form_defaults = {
            "slug": image.get("slug", slug),
            "name": image.get("name", ""),
        }

    context = {
        "request": request,
        "admin_email": session_data.get("email"),
        "image": image,
        "message": message,
        "error": error,
        "form_defaults": form_defaults,
    }

    return templates.TemplateResponse("controlnet_image_edit.html", context)


@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    session = get_admin_session(request)
    if session:
        return RedirectResponse("/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/login")
async def login(email: str = Form(...), password: str = Form(...)):
    if email.strip().lower() != ADMIN_EMAIL.lower() or password != ADMIN_PASSWORD:
        response = RedirectResponse("/?error=invalid", status_code=status.HTTP_303_SEE_OTHER)
        return response

    session_payload = serializer.dumps({"email": email.strip()})
    response = RedirectResponse("/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        "admin_session",
        session_payload,
        httponly=True,
        max_age=60 * 60 * 12,
        samesite="lax",
    )
    return response


@app.get("/logout")
async def logout():
    response = RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie("admin_session")
    return response


@app.get("/controlnet-images", response_class=HTMLResponse)
@app.get("/keypoint-images", response_class=HTMLResponse)
async def controlnet_images_page(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")
    return await render_controlnet_page(request, session, message=message, error=error)


@app.post("/controlnet-images/create")
@app.post("/keypoint-images/create")
async def controlnet_images_create(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    slug = (form.get("slug", "") or "").strip()
    name = (form.get("name", "") or "").strip()
    image_file = form.get("image_file")

    error = None
    if not slug:
        error = "Slug is required."
    elif not name:
        error = "Name is required."

    files = None
    if image_file and getattr(image_file, "filename", ""):
        image_file.file.seek(0)
        files = {
            "image_file": (
                image_file.filename,
                image_file.file,
                image_file.content_type or "application/octet-stream",
            )
        }
    else:
        error = error or "Please upload a keypoint image before saving."

    data = {
        "slug": slug,
        "name": name,
    }

    if error is None:
        try:
            if files:
                await backend_request("POST", "/admin/keypoint-images", data=data, files=files)
            else:
                await backend_request("POST", "/admin/keypoint-images", data=data)
            return RedirectResponse(
                "/keypoint-images?message=ControlNet%20image%20created",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        except httpx.HTTPError as exc:
            error = f"Failed to create ControlNet image: {exc}"

    form_defaults = {
        "slug": slug,
        "name": name,
    }

    return await render_controlnet_page(request, session, error=error, form_defaults=form_defaults)


@app.get("/controlnet-images/{slug}", response_class=HTMLResponse)
@app.get("/keypoint-images/{slug}", response_class=HTMLResponse)
async def controlnet_image_edit(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")
    return await render_controlnet_edit_page(request, session, slug, message=message, error=error)


@app.post("/controlnet-images/{slug}")
@app.post("/keypoint-images/{slug}")
async def controlnet_image_update(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    new_slug = (form.get("slug", slug) or slug).strip() or slug
    name = (form.get("name", "") or "").strip()
    image_file = form.get("image_file")

    data = {
        "new_slug": new_slug,
        "name": name,
    }

    files = None
    if image_file and getattr(image_file, "filename", ""):
        image_file.file.seek(0)
        files = {
            "image_file": (
                image_file.filename,
                image_file.file,
                image_file.content_type or "application/octet-stream",
            )
        }

    error = None
    if not new_slug:
        error = "Slug is required."
    if not name:
        error = error or "Name is required."

    if error is None:
        try:
            if files:
                await backend_request("PUT", f"/admin/keypoint-images/{slug}", data=data, files=files)
            else:
                await backend_request("PUT", f"/admin/keypoint-images/{slug}", data=data)
            target = new_slug or slug
            return RedirectResponse(
                f"/keypoint-images/{target}?message=ControlNet%20image%20updated",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        except httpx.HTTPError as exc:
            error = f"Failed to update ControlNet image: {exc}"

    form_defaults = {
        "slug": new_slug,
        "name": name,
    }

    return await render_controlnet_edit_page(request, session, slug, error=error, form_defaults=form_defaults)


@app.post("/controlnet-images/{slug}/delete")
@app.post("/keypoint-images/{slug}/delete")
async def controlnet_image_delete(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        await backend_request("DELETE", f"/admin/keypoint-images/{slug}")
        return RedirectResponse(
            "/keypoint-images?message=ControlNet%20image%20deleted",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        error = quote_plus(f"Failed to delete image: {exc}")
        return RedirectResponse(
            f"/keypoint-images/{slug}?error={error}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")

    books = []
    try:
        resp = await backend_request("GET", "/admin/books")
        books = resp.json().get("books", [])
        # Prepare display-friendly fields
        for b in books:
            created_raw = b.get("created_at")
            created_disp = None
            if created_raw:
                try:
                    if isinstance(created_raw, (int, float)):
                        dt = datetime.fromtimestamp(float(created_raw), tz=timezone.utc)
                    else:
                        s = str(created_raw)
                        s = s.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(s)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                    local_dt = dt.astimezone()
                    created_disp = local_dt.strftime("%Y-%m-%d %H:%M")
                except Exception:
                    created_disp = str(created_raw)
            b["created_display"] = created_disp
    except httpx.HTTPError as exc:
        error = f"Failed to load books: {exc}" if not error else error

    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "books": books,
            "message": message,
            "error": error,
        },
    )


@app.get("/books/{book_id}/workflow", response_class=HTMLResponse)
async def view_workflow(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    page_param = request.query_params.get("page", "0")
    try:
        page = max(0, int(page_param))
    except ValueError:
        page = 0

    try:
        resp = await backend_request("GET", f"/admin/books/{book_id}/workflow", params={"page": page})
        data = resp.json()
        workflow_json = json.dumps(data.get("workflow", {}), indent=2)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # Lookup the image for the current page (path-only; render via proxy for streaming/resize)
    page_image_path = None
    try:
        imgs_resp = await backend_request("GET", f"/admin/books/{book_id}/images", params={"include_data": "false"})
        imgs_data = imgs_resp.json()
        for item in imgs_data.get("page_images", []):
            try:
                if int(item.get("page_number")) == int(data.get("page_number", page)) and item.get("path"):
                    page_image_path = item.get("path")
                    break
            except Exception:
                continue
    except httpx.HTTPError:
        page_image_path = None

    # Prettify JSON for human editing. If the backend returned a string, parse it first.
    try:
        wf_obj = workflow_json
        if isinstance(wf_obj, str):
            try:
                wf_obj = json.loads(wf_obj)
            except json.JSONDecodeError:
                # Keep as raw string if it's not valid JSON
                pass
        if isinstance(wf_obj, (dict, list)):
            workflow_text = json.dumps(wf_obj, indent=2, ensure_ascii=False)
        else:
            workflow_text = str(workflow_json)
    except Exception:
        workflow_text = str(workflow_json)

    return templates.TemplateResponse(
        "workflow.html",
        {
            "request": request,
            "book_id": book_id,
            "workflow": workflow_json,
            "workflow_text": workflow_text,
            "metadata": data,
            "admin_email": session.get("email"),
            "current_page": data.get("page_number", page),
            "available_pages": data.get("available_pages", []),
            "page_image_path": page_image_path,
        },
    )


@app.post("/books/{book_id}/pages/{page}/regenerate-edited")
async def regenerate_page_edited(book_id: int, page: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    form = await request.form()
    wf_text = form.get("workflow_json", "")
    try:
        wf_json = json.loads(wf_text) if wf_text else None
    except json.JSONDecodeError as exc:
        return RedirectResponse(
            f"/books/{book_id}/workflow?page={page}&error={quote_plus('Invalid JSON: ' + str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    try:
        await backend_request(
            "POST",
            f"/admin/books/{book_id}/pages/{page}/regenerate",
            json={"mode": "edited", "workflow_json": wf_json},
        )
        return RedirectResponse(
            f"/books/{book_id}/workflow?page={page}&message=Page%20regenerated",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/books/{book_id}/workflow?page={page}&error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/books/{book_id}/pages/{page}/regenerate-template")
async def regenerate_page_template(book_id: int, page: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    try:
        await backend_request(
            "POST",
            f"/admin/books/{book_id}/pages/{page}/regenerate",
            json={"mode": "template"},
        )
        return RedirectResponse(
            f"/books/{book_id}/workflow?page={page}&message=Page%20regenerated",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/books/{book_id}/workflow?page={page}&error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/books/{book_id}/images", response_class=HTMLResponse)
async def view_images(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        # Use path-only and resize via proxy for faster loads
        resp = await backend_request("GET", f"/admin/books/{book_id}/images", params={"include_data": "false"})
        data = resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "images.html",
        {
            "request": request,
            "book_id": book_id,
            "original_images": data.get("original_images", []),
            "page_images": data.get("page_images", []),
            "admin_email": session.get("email"),
        },
    )


@app.post("/books/{book_id}/regenerate")
async def regenerate_book(book_id: int, request: Request, new_prompt: str = Form("")):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    payload = {"new_prompt": new_prompt.strip() or None}
    try:
        await backend_request("POST", f"/admin/books/{book_id}/regenerate", json=payload)
        message = quote_plus("Regeneration started")
        return RedirectResponse(f"/dashboard?message={message}", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/users", response_class=HTMLResponse)
async def users_page(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")

    is_super = False
    try:
        status_resp = await backend_request("GET", "/admin/admin-status")
        is_super = bool(status_resp.json().get("is_super"))
    except httpx.HTTPError:
        is_super = False

    try:
        resp = await backend_request("GET", "/admin/users")
        data = resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "users.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "users": data.get("users", []),
            "is_super_admin": is_super,
            "message": message,
            "error": error,
        },
    )


@app.post("/users/{user_id}/update")
async def users_update(user_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    payload = {}
    email = form.get("email")
    credits = form.get("credits")
    role = form.get("role")
    if email is not None:
        payload["email"] = email
    if credits is not None and credits != "":
        try:
            payload["credits"] = int(credits)
        except ValueError:
            return RedirectResponse(
                f"/users?error={quote_plus('Credits must be numeric')}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
    if role is not None and role.strip():
        payload["role"] = role.strip()

    try:
        await backend_request("POST", f"/admin/users/{user_id}/update", json=payload)
        return RedirectResponse("/users?message=User%20updated", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/users?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )




@app.post("/books/{book_id}/rebuild-pdf")
async def rebuild_pdf(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        await backend_request("POST", f"/admin/books/{book_id}/rebuild-pdf")
        message = quote_plus("PDF rebuild started/completed")
        return RedirectResponse(f"/dashboard?message={message}", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/backups", response_class=HTMLResponse)
async def backups_page(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")

    backups = []
    configured = True
    load_error = None

    try:
        resp = await backend_request("GET", "/admin/backups")
        data = resp.json()
        backups = data.get("backups", [])
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        if exc.response.status_code == 503:
            configured = False
        else:
            load_error = detail
    except httpx.HTTPError as exc:
        load_error = str(exc)

    return templates.TemplateResponse(
        "backups.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "backups": backups,
            "configured": configured,
            "load_error": load_error,
            "message": message,
            "error": error,
        },
    )


@app.post("/backups/run")
async def run_backup(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    try:
        resp = await backend_request("POST", "/admin/backups/run")
        data = resp.json()
        message = quote_plus(f"Backup created ({data.get('backup', {}).get('timestamp', 'unknown')})")
        return RedirectResponse(f"/backups?message={message}", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        detail = _format_backend_error(exc) if hasattr(exc, "response") else str(exc)
        return RedirectResponse(
            f"/backups?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/backups/restore")
async def restore_backup(request: Request, timestamp: str = Form(...)):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    payload = {"timestamp": timestamp.strip()}
    try:
        await backend_request("POST", "/admin/backups/restore", json=payload)
        message = quote_plus(f"Restore from {timestamp} started")
        return RedirectResponse(f"/backups?message={message}", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        detail = _format_backend_error(exc) if hasattr(exc, "response") else str(exc)
        return RedirectResponse(
            f"/backups?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/users/{user_id}/export")
async def export_user(user_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("POST", f"/admin/users/{user_id}/export")
        data = resp.json()
        message = data.get("message", "User exported")
        path = data.get("path")
        if path:
            message = f"{message} -> {path}"
        return RedirectResponse(
            f"/users?message={quote_plus(message)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        return RedirectResponse(
            f"/users?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/users?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/stories", response_class=HTMLResponse)
async def stories_page(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")

    try:
        resp = await backend_request("GET", "/admin/story-templates")
        data = resp.json()
        wf_resp = await backend_request("GET", "/admin/workflows")
        wf_data = wf_resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "stories.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "stories": data.get("stories", []),
            "workflows": wf_data.get("workflows", []),
            "message": message,
            "error": error,
        },
    )


@app.post("/stories/create")
async def create_story_template(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    pages_raw = form.get("pages", "")
    try:
        pages = json.loads(pages_raw) if pages_raw else []
    except json.JSONDecodeError as exc:
        # Re-render with previous inputs
        try:
            resp = await backend_request("GET", "/admin/story-templates")
            data = resp.json()
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/dashboard?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        form_defaults = dict(form)
        form_defaults["pages"] = pages_raw
        return templates.TemplateResponse(
            "stories.html",
            {
                "request": request,
                "admin_email": (get_admin_session(request) or {}).get("email"),
                "stories": data.get("stories", []),
                "workflows": wf_data.get("workflows", []),
                "error": f"Invalid JSON: {exc}",
                "form_defaults": form_defaults,
            },
        )

    free_trial_slug = (form.get("free_trial_slug") or "").strip() or None
    try:
        price_value = _parse_decimal_field(form.get("price_dollars"), "Base price", required=True)
        discount_value = _parse_decimal_field(form.get("discount_price"), "Discount price")
    except ValueError as exc:
        try:
            resp = await backend_request("GET", "/admin/story-templates")
            data = resp.json()
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/dashboard?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        form_defaults = dict(form)
        form_defaults["pages"] = pages_raw
        return templates.TemplateResponse(
            "stories.html",
            {
                "request": request,
                "admin_email": (get_admin_session(request) or {}).get("email"),
                "stories": data.get("stories", []),
                "workflows": wf_data.get("workflows", []),
                "error": str(exc),
                "form_defaults": form_defaults,
            },
        )

    version_raw = (form.get("version") or "").strip()
    try:
        version_value = int(version_raw or "1")
        if version_value < 1:
            raise ValueError
    except ValueError:
        return RedirectResponse(
            f"/stories?error={quote_plus('Version must be a positive integer')}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    payload = {
        "slug": form.get("slug", "").strip(),
        "name": form.get("name", "").strip(),
        "description": form.get("description", "").strip() or None,
        "age": form.get("age", "").strip() or None,
        "version": version_value,
        "workflow_slug": form.get("workflow_slug", "").strip() or "base",
        "is_active": form.get("is_active", "true").lower() == "true",
        "pages": pages,
        "cover_image_url": (form.get("cover_image_url") or "").strip() or None,
        "free_trial_slug": free_trial_slug,
        "price_dollars": price_value,
        "discount_price": discount_value,
    }

    try:
        await backend_request("POST", "/admin/story-templates", json=payload)
        # Optional cover file upload after create
        cover_file = form.get("cover_file")
        if cover_file and getattr(cover_file, "filename", ""):
            cover_file.file.seek(0)
            files = {
                "cover_file": (
                    cover_file.filename,
                    cover_file.file,
                    cover_file.content_type or "application/octet-stream",
                )
            }
            # use the slug from payload
            await backend_request("POST", f"/admin/story-templates/{payload['slug']}/cover", files=files)
        # Optional demo images upload
        for idx in [1, 2, 3, 4]:
            key = f"demo_file_{idx}"
            demo_file = form.get(key)
            if demo_file and getattr(demo_file, "filename", ""):
                demo_file.file.seek(0)
                files = {
                    "demo_file": (
                        demo_file.filename,
                        demo_file.file,
                        demo_file.content_type or "application/octet-stream",
                    )
                }
                await backend_request("POST", f"/admin/story-templates/{payload['slug']}/demo/{idx}", files=files)
        return RedirectResponse("/stories?message=Story%20template%20created", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        return RedirectResponse(
            f"/stories?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/stories?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/stories/{slug}", response_class=HTMLResponse)
async def edit_story_template(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("GET", f"/admin/story-templates/{slug}")
        story = resp.json()
        wf_resp = await backend_request("GET", "/admin/workflows")
        wf_data = wf_resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/stories?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "story_template_edit.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "story": story,
            "workflows": wf_data.get("workflows", []),
        },
    )


@app.post("/stories/{slug}")
async def update_story_template(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    pages_raw = form.get("pages", "")
    try:
        pages = json.loads(pages_raw) if pages_raw else []
    except json.JSONDecodeError as exc:
        # Render edit page with previous inputs
        try:
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
            story_resp = await backend_request("GET", f"/admin/story-templates/{slug}")
            story = story_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/stories/{slug}?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        form_defaults = dict(form)
        form_defaults["pages"] = pages_raw
        return templates.TemplateResponse(
            "story_template_edit.html",
            {
                "request": request,
                "admin_email": (get_admin_session(request) or {}).get("email"),
                "story": story,
                "workflows": wf_data.get("workflows", []),
                "error": f"Invalid JSON: {exc}",
                "form_defaults": form_defaults,
            },
        )

    free_trial_slug = (form.get("free_trial_slug") or "").strip() or None
    try:
        price_value = _parse_decimal_field(form.get("price_dollars"), "Base price", required=True)
        discount_value = _parse_decimal_field(form.get("discount_price"), "Discount price")
    except ValueError as exc:
        try:
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
            story_resp = await backend_request("GET", f"/admin/story-templates/{slug}")
            story = story_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/stories/{slug}?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        form_defaults = dict(form)
        form_defaults["pages"] = pages_raw
        return templates.TemplateResponse(
            "story_template_edit.html",
            {
                "request": request,
                "admin_email": (get_admin_session(request) or {}).get("email"),
                "story": story,
                "workflows": wf_data.get("workflows", []),
                "error": str(exc),
                "form_defaults": form_defaults,
            },
        )

    version_raw = (form.get("version") or "").strip()
    try:
        version_value = int(version_raw or "1")
        if version_value < 1:
            raise ValueError
    except ValueError:
        return RedirectResponse(
            f"/stories/{slug}?error={quote_plus('Version must be a positive integer')}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    payload = {
        "slug": form.get("slug", slug).strip() or slug,
        "name": form.get("name", "").strip(),
        "description": form.get("description", "").strip() or None,
        "age": form.get("age", "").strip() or None,
        "version": version_value,
        "workflow_slug": form.get("workflow_slug", "").strip() or "base",
        "is_active": form.get("is_active", "true").lower() == "true",
        "pages": pages,
        "cover_image_url": (form.get("cover_image_url") or "").strip() or None,
        "free_trial_slug": free_trial_slug,
        "price_dollars": price_value,
        "discount_price": discount_value,
    }

    try:
        await backend_request("PUT", f"/admin/story-templates/{slug}", json=payload)
        # Optional cover file upload
        cover_file = form.get("cover_file")
        if cover_file and getattr(cover_file, "filename", ""):
            cover_file.file.seek(0)
            files = {
                "cover_file": (
                    cover_file.filename,
                    cover_file.file,
                    cover_file.content_type or "application/octet-stream",
                )
            }
            await backend_request("POST", f"/admin/story-templates/{payload['slug']}/cover", files=files)
        # Optional demo images upload
        for idx in [1, 2, 3, 4]:
            key = f"demo_file_{idx}"
            demo_file = form.get(key)
            if demo_file and getattr(demo_file, "filename", ""):
                demo_file.file.seek(0)
                files = {
                    "demo_file": (
                        demo_file.filename,
                        demo_file.file,
                        demo_file.content_type or "application/octet-stream",
                    )
                }
                await backend_request("POST", f"/admin/story-templates/{payload['slug']}/demo/{idx}", files=files)
        return RedirectResponse("/stories?message=Story%20template%20updated", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        try:
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
            story_resp = await backend_request("GET", f"/admin/story-templates/{slug}")
            story = story_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/stories/{slug}?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        form_defaults = dict(form)
        form_defaults["pages"] = pages_raw
        return templates.TemplateResponse(
            "story_template_edit.html",
            {
                "request": request,
                "admin_email": (get_admin_session(request) or {}).get("email"),
                "story": story,
                "workflows": wf_data.get("workflows", []),
                "error": _format_backend_error(exc) if hasattr(exc, 'response') else str(exc),
                "form_defaults": form_defaults,
            },
        )
@app.get("/workflows", response_class=HTMLResponse)
async def workflows_page(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")

    try:
        resp = await backend_request("GET", "/admin/workflows")
        data = resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "workflows.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "workflows": data.get("workflows", []),
            "message": message,
            "error": error,
        },
    )


@app.get("/test", response_class=HTMLResponse)
async def test_page(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    message = request.query_params.get("message")
    error = request.query_params.get("error")
    try:
        wf_resp = await backend_request("GET", "/admin/workflows")
        wf_data = wf_resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "test.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "workflows": wf_data.get("workflows", []),
            "message": message,
            "error": error,
        },
    )


@app.post("/test", response_class=HTMLResponse)
async def test_run(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    try:
        # Build multipart with multiple reference images and optional keypoint
        files = []
        # Multiple reference images
        if hasattr(form, 'getlist'):
            ref_images = form.getlist('images')
        else:
            # Fallback: single value
            ref_images = [form.get('images')] if form.get('images') else []
        for f in ref_images:
            if f and getattr(f, 'filename', ''):
                try:
                    f.file.seek(0)
                except Exception:
                    pass
                files.append(
                    (
                        'images',
                        (f.filename, f.file, getattr(f, 'content_type', 'application/octet-stream')),
                    )
                )
        # Optional keypoint image
        image_kp = form.get('image_kp')
        if image_kp and getattr(image_kp, 'filename', ''):
            try:
                image_kp.file.seek(0)
            except Exception:
                pass
            files.append(
                (
                    'image_kp',
                    (image_kp.filename, image_kp.file, getattr(image_kp, 'content_type', 'application/octet-stream')),
                )
            )

        data = {
            "workflow_slug": form.get("workflow_slug", "base"),
            "positive_prompt": form.get("positive_prompt", ""),
            "negative_prompt": form.get("negative_prompt", ""),
        }
        resp = await backend_request("POST", "/admin/test/comfy-run", data=data, files=files if files else None)
        result = resp.json()
        wf_resp = await backend_request("GET", "/admin/workflows")
        wf_data = wf_resp.json()
        # Bubble up failure as an error banner but still show any payload
        error_text = None
        if result.get("status") != "success":
            error_text = result.get("error") or result.get("message") or "ComfyUI run failed"
        return templates.TemplateResponse(
            "test.html",
            {
                "request": request,
                "admin_email": session.get("email"),
                "workflows": wf_data.get("workflows", []),
                "result": result,
                "payload_json": json.dumps(result.get("workflow_payload"), indent=2) if result.get("workflow_payload") else None,
                "selected_workflow": data["workflow_slug"],
                "positive_prompt": data["positive_prompt"],
                "negative_prompt": data["negative_prompt"],
                "error": error_text,
            },
        )
    except httpx.HTTPError as exc:
        # Reload page with error
        try:
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/dashboard?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        return templates.TemplateResponse(
            "test.html",
            {
                "request": request,
                "admin_email": session.get("email"),
                "workflows": wf_data.get("workflows", []),
                "error": _format_backend_error(exc) if hasattr(exc, 'response') else str(exc),
                "selected_workflow": form.get("workflow_slug", "base"),
                "positive_prompt": form.get("positive_prompt", ""),
                "negative_prompt": form.get("negative_prompt", ""),
            },
        )


@app.post("/stories/{slug}/delete")
async def delete_story_template(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        await backend_request("DELETE", f"/admin/story-templates/{slug}")
        return RedirectResponse("/stories?message=Story%20template%20deleted", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        return RedirectResponse(
            f"/stories?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/stories?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/stories/{slug}/export")
async def export_story_template(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("POST", f"/admin/story-templates/{slug}/export")
        data = resp.json()
        message = data.get("message", "Story template exported")
        path = data.get("path")
        if path:
            message = f"{message} -> {path}"
        return RedirectResponse(
            f"/stories?message={quote_plus(message)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        try:
            resp = await backend_request("GET", "/admin/story-templates")
            data = resp.json()
            wf_resp = await backend_request("GET", "/admin/workflows")
            wf_data = wf_resp.json()
        except httpx.HTTPError as exc2:
            return RedirectResponse(
                f"/dashboard?error={quote_plus(str(exc2))}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        return templates.TemplateResponse(
            "stories.html",
            {
                "request": request,
                "admin_email": (get_admin_session(request) or {}).get("email"),
                "stories": data.get("stories", []),
                "workflows": wf_data.get("workflows", []),
                "error": _format_backend_error(exc) if hasattr(exc, 'response') else str(exc),
            },
        )


@app.post("/stories/{slug}/duplicate")
async def duplicate_story_template(slug: str, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("POST", f"/admin/story-templates/{slug}/duplicate")
        data = resp.json()
        new_slug = (data.get("story") or {}).get("slug")
        message = data.get("message") or "Story template duplicated"
        if new_slug:
            message = f"{message}: {new_slug}"
        return RedirectResponse(
            f"/stories?message={quote_plus(message)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        return RedirectResponse(
            f"/stories?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/stories?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/workflows/create")
async def create_workflow(request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    slug = form.get("slug", "").strip()
    name = form.get("name", "").strip()
    wf_type = form.get("type", "").strip()
    content_raw = form.get("content", "").strip()

    try:
        content = json.loads(content_raw)
    except json.JSONDecodeError as exc:
        return RedirectResponse(
            f"/workflows?error={quote_plus('Invalid JSON: ' + str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    payload = {
        "slug": slug,
        "name": name,
        "type": wf_type,
        "content": content,
    }

    try:
        await backend_request("POST", "/admin/workflows", json=payload)
        return RedirectResponse("/workflows?message=Workflow%20created", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/workflows/{workflow_id}", response_class=HTMLResponse)
async def edit_workflow(workflow_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("GET", f"/admin/workflows/{workflow_id}")
        workflow = resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "workflow_edit.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "workflow": workflow,
        },
    )


@app.post("/workflows/{workflow_id}")
async def update_workflow(workflow_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    payload = {
        "slug": form.get("slug", "base"),
        "name": form.get("name", ""),
        "type": form.get("type", "template"),
    }

    version = form.get("version")
    if version:
        try:
            payload["version"] = int(version)
        except ValueError:
            return RedirectResponse(
                f"/workflows/{workflow_id}?error={quote_plus('Version must be numeric')}",
                status_code=status.HTTP_303_SEE_OTHER,
            )

    is_active = form.get("is_active")
    if is_active:
        payload["is_active"] = is_active.lower() == "true"

    content_raw = form.get("content", "")
    try:
        content_obj = json.loads(content_raw) if content_raw else {}
    except json.JSONDecodeError as exc:
        return RedirectResponse(
            f"/workflows/{workflow_id}?error={quote_plus('Invalid JSON: ' + str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # Optional workflow hints (_meta)
    meta: dict[str, any] = content_obj.get("_meta", {}) if isinstance(content_obj, dict) else {}
    def _split_ids(text: str) -> list[str]:
        return [x.strip() for x in text.split(',') if x and x.strip()]

    kp_node = (form.get("meta_keypoint_load_node") or "").strip()
    if kp_node:
        meta["keypoint_load_node"] = kp_node

    apply_node = (form.get("meta_instantid_apply_node") or "").strip()
    if apply_node:
        meta["instantid_apply_node"] = apply_node

    kp_default = (form.get("meta_keypoint_default_image") or "").strip()
    if kp_default and kp_node and isinstance(content_obj, dict) and kp_node in content_obj:
        try:
            inputs = content_obj[kp_node].setdefault("inputs", {})
            inputs["image"] = kp_default
            inputs["load_from_upload"] = True
            meta["keypoint_default_image"] = kp_default
        except Exception:
            pass

    pos_nodes = (form.get("meta_prompt_nodes_positive") or "").strip()
    neg_nodes = (form.get("meta_prompt_nodes_negative") or "").strip()
    if pos_nodes or neg_nodes:
        pn = meta.get("prompt_nodes", {})
        if pos_nodes:
            pn["positive"] = _split_ids(pos_nodes)
        if neg_nodes:
            pn["negative"] = _split_ids(neg_nodes)
        meta["prompt_nodes"] = pn

    load_images = (form.get("meta_load_images") or "").strip()
    if load_images:
        meta["load_images"] = _split_ids(load_images)

    save_nodes = (form.get("meta_save_nodes") or "").strip()
    if save_nodes:
        meta["save_nodes"] = _split_ids(save_nodes)

    preview_nodes = (form.get("meta_preview_nodes") or "").strip()
    if preview_nodes:
        meta["preview_nodes"] = _split_ids(preview_nodes)

    overlay_nodes = (form.get("meta_overlay_nodes") or "").strip()
    if overlay_nodes:
        meta["overlay_nodes"] = _split_ids(overlay_nodes)

    if isinstance(content_obj, dict):
        content_obj["_meta"] = meta

    payload["content"] = content_obj

    try:
        await backend_request("PUT", f"/admin/workflows/{workflow_id}", json=payload)
        return RedirectResponse("/workflows?message=Workflow%20updated", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows/{workflow_id}?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/workflows/{workflow_id}/delete")
async def delete_workflow(workflow_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        await backend_request("DELETE", f"/admin/workflows/{workflow_id}")
        return RedirectResponse(
            "/workflows?message=Workflow%20deleted",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/workflows/{workflow_id}/export")
async def export_workflow(workflow_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("POST", f"/admin/workflows/{workflow_id}/export")
        data = resp.json()
        message = data.get("message", "Workflow exported")
        path = data.get("path")
        if path:
            message = f"{message} -> {path}"
        return RedirectResponse(
            f"/workflows?message={quote_plus(message)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        return RedirectResponse(
            f"/workflows?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.post("/workflows/{workflow_id}/duplicate")
async def duplicate_workflow(workflow_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("POST", f"/admin/workflows/{workflow_id}/duplicate")
        data = resp.json()
        new_slug = (data.get("workflow") or {}).get("slug")
        message = data.get("message") or "Workflow duplicated"
        if new_slug:
            message = f"{message}: {new_slug}"
        return RedirectResponse(
            f"/workflows?message={quote_plus(message)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPStatusError as exc:
        detail = _format_backend_error(exc)
        return RedirectResponse(
            f"/workflows?error={quote_plus(detail)}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/books/{book_id}/story", response_class=HTMLResponse)
async def edit_story(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("GET", f"/admin/books/{book_id}/story")
        data = resp.json()
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "story_edit.html",
        {
            "request": request,
            "admin_email": session.get("email"),
            "book_id": book_id,
            "story": data.get("story"),
        },
    )


@app.post("/books/{book_id}/story")
async def update_story(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    form = await request.form()
    story_raw = form.get("story", "")
    try:
        story = json.loads(story_raw) if story_raw else {}
    except json.JSONDecodeError as exc:
        return RedirectResponse(
            f"/books/{book_id}/story?error={quote_plus('Invalid JSON: ' + str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    try:
        await backend_request("PUT", f"/admin/books/{book_id}/story", json={"story": story})
        return RedirectResponse(
            f"/books/{book_id}/story?message=Story%20updated",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/books/{book_id}/story?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )


@app.get("/files-proxy")
async def files_proxy(request: Request, path: str, w: int | None = None, h: int | None = None):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        async with httpx.AsyncClient(base_url=BACKEND_URL, timeout=60) as client:
            if w or h:
                params = {"path": path}
                if w:
                    params["w"] = str(w)
                if h:
                    params["h"] = str(h)
                resp = await client.get(
                    "/admin/media/resize",
                    params=params,
                    headers={"X-Admin-Secret": ADMIN_API_KEY},
                    follow_redirects=True,
                )
            else:
                resp = await client.get(
                    "/admin/files",
                    params={"path": path},
                    headers={"X-Admin-Secret": ADMIN_API_KEY},
                    follow_redirects=True,
                )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch file: {exc}")

    return Response(content=resp.content, media_type=resp.headers.get("content-type", "application/octet-stream"))


@app.post("/books/{book_id}/delete")
async def delete_book(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        await backend_request("DELETE", f"/admin/books/{book_id}")
        message = quote_plus("Book deleted")
        return RedirectResponse(f"/dashboard?message={message}", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
