import { NextRequest, NextResponse } from 'next/server'
import { API_BASE, SECURE_COOKIES } from '@/lib/env'

// Simple GET proxy to attach auth cookie + client headers for same-origin fetches from client components
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const token = req.cookies.get('auth_token')?.value
  const r = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Device-Platform': 'web',
      'X-App-Package': 'animapp-web',
    },
    cache: 'no-store',
  })
  const body = await r.text()
  const res = new NextResponse(body, {
    status: r.status,
    headers: { 'content-type': r.headers.get('content-type') || 'application/json' },
  })
  res.headers.set('x-animapp-api-base', API_BASE)
  return res
}
