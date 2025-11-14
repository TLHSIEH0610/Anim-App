import { NextRequest, NextResponse } from 'next/server'
import { API_BASE } from '@/lib/env'

export async function OPTIONS() {
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
export async function PUT(req: NextRequest) { return handle(req) }
export async function DELETE(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const token = req.cookies.get('auth_token')?.value
  const headers: Record<string, string> = {
    'X-Device-Platform': 'web',
    'X-App-Package': 'animapp-web',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: 'no-store',
  }

  // Pass body for non-GET
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const ct = req.headers.get('content-type') || ''
    // Preserve content-type from client to backend
    if (ct) headers['Content-Type'] = ct
    init.body = await req.arrayBuffer()
  }

  const r = await fetch(`${API_BASE}${path}`, init as any)
  const body = await r.arrayBuffer()
  const res = new NextResponse(body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'application/octet-stream',
    },
  })
  res.headers.set('x-animapp-api-base', API_BASE)
  return res
}
