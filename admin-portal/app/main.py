import json
import os
from typing import Any, Dict
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

app = FastAPI(title="AnimApp Admin Portal")

templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


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
    async with httpx.AsyncClient(base_url=BACKEND_URL, timeout=60) as client:
        response = await client.request(method, path, headers=headers, **kwargs)
    response.raise_for_status()
    return response


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

    page_param = request.query_params.get("page", "1")
    try:
        page = max(1, int(page_param))
    except ValueError:
        page = 1

    try:
        resp = await backend_request("GET", f"/admin/books/{book_id}/workflow", params={"page": page})
        data = resp.json()
        workflow_json = json.dumps(data.get("workflow", {}), indent=2)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/dashboard?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return templates.TemplateResponse(
        "workflow.html",
        {
            "request": request,
            "book_id": book_id,
            "workflow": workflow_json,
            "metadata": data,
            "admin_email": session.get("email"),
            "current_page": data.get("page_number", page),
            "available_pages": data.get("available_pages", []),
        },
    )


@app.get("/books/{book_id}/images", response_class=HTMLResponse)
async def view_images(book_id: int, request: Request):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        resp = await backend_request("GET", f"/admin/books/{book_id}/images")
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
            "control_images": data.get("control_images", []),
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

    try:
        await backend_request("POST", f"/admin/users/{user_id}/update", json=payload)
        return RedirectResponse("/users?message=User%20updated", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/users?error={quote_plus(str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
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
        "slug": form.get("slug", "childbook_adventure_v2"),
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
        payload["content"] = json.loads(content_raw)
    except json.JSONDecodeError as exc:
        return RedirectResponse(
            f"/workflows/{workflow_id}?error={quote_plus('Invalid JSON: ' + str(exc))}",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    try:
        await backend_request("PUT", f"/admin/workflows/{workflow_id}", json=payload)
        return RedirectResponse("/workflows?message=Workflow%20updated", status_code=status.HTTP_303_SEE_OTHER)
    except httpx.HTTPError as exc:
        return RedirectResponse(
            f"/workflows/{workflow_id}?error={quote_plus(str(exc))}",
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
async def files_proxy(request: Request, path: str):
    session = get_admin_session(request)
    if not session:
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)

    try:
        async with httpx.AsyncClient(base_url=BACKEND_URL, timeout=60) as client:
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
