import { NextRequest, NextResponse } from 'next/server'
import { API_BASE, SECURE_COOKIES } from '@/lib/env'

export async function POST(req: NextRequest) {
  try {
    const { credential } = await req.json()
    if (!credential) {
      return NextResponse.json({ error: 'Missing credential' }, { status: 400 })
    }
    const r = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: credential }),
    })
    if (!r.ok) {
      const text = await r.text()
      return NextResponse.json({ error: text || 'Auth failed' }, { status: 401 })
    }
    const data = await r.json()
    const token = data?.access_token || data?.token || data?.accessToken
    if (!token) return NextResponse.json({ error: 'No token in response' }, { status: 500 })

    const res = NextResponse.json({ ok: true, user: data?.user || null })
    res.cookies.set('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIES,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

