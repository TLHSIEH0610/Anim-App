import { NextRequest, NextResponse } from 'next/server'
import { API_BASE } from '@/lib/env'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const bookId = url.searchParams.get('bookId')
  const page = url.searchParams.get('page')
  const w = url.searchParams.get('w') || '0'
  const h = url.searchParams.get('h') || ''
  const v = url.searchParams.get('v') || ''
  if (!bookId || !page) return NextResponse.json({ error: 'Missing bookId or page' }, { status: 400 })
  const jwt = req.cookies.get('auth_token')?.value
  if (!jwt) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const qs = new URLSearchParams({ w, ...(h ? { h } : {}), token: jwt, ...(v ? { v } : {}) })
  const r = await fetch(`${API_BASE}/books/${bookId}/pages/${page}/image-public?${qs.toString()}`, { cache: 'no-store' })
  const body = await r.arrayBuffer()
  const res = new NextResponse(body, { status: r.status })
  const ct = r.headers.get('content-type'); if (ct) res.headers.set('content-type', ct)
  const et = r.headers.get('etag'); if (et) res.headers.set('etag', et)
  const cc = r.headers.get('cache-control'); if (cc) res.headers.set('cache-control', cc)
  res.headers.set('x-animapp-api-base', API_BASE)
  return res
}

