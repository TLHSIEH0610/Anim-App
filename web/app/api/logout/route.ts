import { NextRequest, NextResponse } from 'next/server'

// Redirect to landing page after logout to avoid showing raw JSON
export async function POST(req: NextRequest) {
  const url = new URL('/', req.nextUrl.origin)
  const res = NextResponse.redirect(url, 303)
  res.cookies.set('auth_token', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

// Optional: also support GET to simplify testing
export async function GET(req: NextRequest) {
  const url = new URL('/', req.nextUrl.origin)
  const res = NextResponse.redirect(url, 303)
  res.cookies.set('auth_token', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
