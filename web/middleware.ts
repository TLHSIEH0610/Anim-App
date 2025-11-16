import { NextResponse, NextRequest } from 'next/server'

// Protect selected routes and enforce a clear auth state (valid or logged-out)
const protectedPrefixes = ['/books', '/purchased', '/create', '/checkout', '/account', '/support']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const hasCookie = Boolean(req.cookies.get('auth_token')?.value)

  // Helper to validate session with backend via our proxy
  async function isValidSession(): Promise<boolean> {
    try {
      const url = new URL('/api/proxy?path=%2Fauth%2Fme', req.nextUrl.origin)
      const r = await fetch(url.toString(), {
        headers: { cookie: req.headers.get('cookie') || '' },
        cache: 'no-store',
      })
      return r.ok
    } catch {
      return false
    }
  }

  // If visiting the landing page while logged in and valid, send to /books
  if ((pathname === '/' || pathname === '/index') && hasCookie) {
    if (await isValidSession()) {
      const url = req.nextUrl.clone(); url.pathname = '/books'
      return NextResponse.redirect(url)
    } else {
      // Clear invalid cookie
      const res = NextResponse.next(); res.cookies.set('auth_token', '', { httpOnly: true, path: '/', maxAge: 0 });
      return res
    }
  }

  if (!isProtected) return NextResponse.next()

  if (!hasCookie) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Has cookie → validate; if invalid, clear and redirect to login
  if (!(await isValidSession())) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', pathname)
    const res = NextResponse.redirect(url)
    res.cookies.set('auth_token', '', { httpOnly: true, path: '/', maxAge: 0 })
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|assets).*)'],
}
