import { NextRequest, NextResponse } from 'next/server'
import { API_BASE } from '@/lib/env'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const bookId = url.searchParams.get('bookId')
  if (!bookId) return NextResponse.json({ error: 'Missing bookId' }, { status: 400 })
  const token = req.cookies.get('auth_token')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const r = await fetch(`${API_BASE}/books/${encodeURIComponent(bookId)}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    // Do not cache personalized PDFs
    cache: 'no-store',
  })

  const buf = await r.arrayBuffer()
  const res = new NextResponse(buf, { status: r.status })
  // Force inline viewing so browsers render the PDF instead of downloading
  res.headers.set('content-type', 'application/pdf')
  res.headers.set('content-disposition', `inline; filename="book_${bookId}.pdf"`)
  const cc = r.headers.get('cache-control'); if (cc) res.headers.set('cache-control', cc)
  res.headers.set('x-animapp-api-base', API_BASE)
  return res
}
