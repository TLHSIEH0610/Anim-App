import { NextResponse, NextRequest } from 'next/server'

// Protect selected routes if no auth cookie
const protectedPrefixes = ['/books', '/create', '/checkout']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const needsAuth = protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!needsAuth) return NextResponse.next()
  const token = req.cookies.get('auth_token')?.value
  if (token) return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = '/'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next|api/login|api/logout|favicon.ico|assets).*)'],
}

