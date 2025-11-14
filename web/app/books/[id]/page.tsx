"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/env'

type BookDetail = {
  id: number
  title: string
  status: string
  page_count?: number
  pages?: { page_number: number; image_completed_at?: string | null }[]
  completed_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}

function pageImageUrl(bookId: number, page: number, v?: string | null, w?: number) {
  const params = new URLSearchParams()
  if (w) params.set('w', String(w))
  if (v) params.set('v', v)
  return `${API_BASE}/books/${bookId}/pages/${page}/image-public?${params.toString()}`
}

export default function BookDetailPage({ params }: { params: { id: string } }) {
  const id = params.id
  const [book, setBook] = useState<BookDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/proxy?path=${encodeURIComponent(`/books/${id}`)}`, { credentials: 'include' })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        setBook(data)
      } catch (e: any) {
        setError(e.message)
      }
    }
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [id])

  const version = book?.completed_at || book?.updated_at || book?.created_at || undefined

  return (
    <main>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <Link href="/books" className="btn">Back</Link>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>{book?.title || 'Book'}</h1>
        {book && <span style={{color: '#666'}}>• {book.status}</span>}
      </div>
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      {!book && !error && <p>Loading…</p>}
      {book && (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 16}}>
          {Array.from({ length: book.page_count || (book.pages?.length || 0) }, (_, i) => i + 1).map((n) => {
            const pageV = book.pages?.find((p) => p.page_number === n)?.image_completed_at || version
            return (
              <div key={n} className="card" style={{padding: 8}}>
                <div style={{width: '100%', aspectRatio: '3/4', background: '#f2f2f2', borderRadius: 6, overflow: 'hidden'}}>
                  <img alt={`Page ${n}`} src={pageImageUrl(Number(id), n, pageV || undefined, 1024)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                </div>
                <div style={{marginTop: 6, color: '#666'}}>Page {n}</div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

