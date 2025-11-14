import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get('auth_token')?.value)
  let me: any = null
  try {
    const r = await fetch(`${req.nextUrl.origin}/api/proxy?path=${encodeURIComponent('/auth/me')}`, { cache: 'no-store', headers: { cookie: req.headers.get('cookie') || '' } })
    if (r.ok) me = await r.json()
  } catch {}
  return NextResponse.json({ hasAuthCookie: hasCookie, me })
}

