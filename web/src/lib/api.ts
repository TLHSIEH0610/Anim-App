"use client"
import { API_BASE } from '@/lib/env'
import type { Book, StoryTemplate } from '@animapp/shared'
import { getOrCreateInstallId } from '@/lib/installId'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

function authTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|; )auth_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export async function apiFetch<T>(path: string, opts: { method?: Method; body?: any; headers?: Record<string, string> } = {}): Promise<T> {
  const token = authTokenFromCookie()
  const h: Record<string, string> = {
    'X-Install-Id': getOrCreateInstallId(),
    'X-Device-Platform': 'web',
    'X-App-Package': 'animapp-web',
    ...(opts.headers || {}),
  }
  if (token) h['Authorization'] = `Bearer ${token}`
  const isJSON = opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)
  if (isJSON) h['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: h,
    body: isJSON ? JSON.stringify(opts.body) : opts.body,
    credentials: 'include',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json() as Promise<T>
  // @ts-expect-error
  return res.text()
}

export async function listBooks(): Promise<Book[]> {
  // Use server proxy to attach httpOnly auth cookie
  const r = await fetch(`/api/proxy?path=${encodeURIComponent('/books/list')}`, { credentials: 'include' })
  if (!r.ok) throw new Error(await r.text())
  const data = await r.json()
  if (Array.isArray(data)) return data
  if (Array.isArray((data as any)?.items)) return (data as any).items
  if (Array.isArray((data as any)?.books)) return (data as any).books
  return []
}

export async function getBook(id: string | number): Promise<any> {
  const r = await fetch(`/api/proxy?path=${encodeURIComponent(`/books/${id}`)}`, { credentials: 'include' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getQuote(templateSlug?: string): Promise<any> {
  const p = '/billing/quote' + (templateSlug ? `?template_slug=${encodeURIComponent(templateSlug)}` : '')
  const r = await fetch(`/api/proxy?path=${encodeURIComponent(p)}`, { credentials: 'include' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function listStoryTemplates(): Promise<StoryTemplate[]> {
  const r = await fetch(`/api/proxy?path=${encodeURIComponent('/books/stories/templates')}`, { credentials: 'include' })
  if (!r.ok) throw new Error(await r.text())
  const data = await r.json()
  if (Array.isArray(data?.stories)) return data.stories
  return []
}

export function authToken(): string | null { return authTokenFromCookie() }

export function getThumbUrl(opts: { bookId?: number; path?: string; token?: string; width?: number; height?: number; version?: string | number | null }) {
  const w = opts.width || 360
  const h = opts.height || 360
  const v = opts.version != null ? `&v=${encodeURIComponent(String(opts.version))}` : ''
  if (opts.bookId) {
    return `${API_BASE}/books/${opts.bookId}/cover-thumb-public?w=${w}&h=${h}&token=${encodeURIComponent(opts.token || '')}${v}`
  }
  if (opts.path) {
    return `${API_BASE}/books/media/resize-public?path=${encodeURIComponent(opts.path)}&w=${w}&h=${h}&token=${encodeURIComponent(opts.token || '')}${v}`
  }
  return ''
}
