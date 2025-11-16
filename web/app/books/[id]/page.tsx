"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/env'
import { useParams } from 'next/navigation'

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
  params.set('bookId', String(bookId))
  params.set('page', String(page))
  if (w) params.set('w', String(w))
  if (v) params.set('v', String(v))
  return `/api/image/book/page?${params.toString()}`
}

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<BookDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!book) return
      if (e.key === 'ArrowRight') setPage((p) => Math.min((book.page_count || 1), p + 1))
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book])

  // Prefetch next image
  useEffect(() => {
    if (!book) return
    const next = page + 1
    if (next <= (book.page_count || 0)) {
      const img = new Image()
      img.src = pageImageUrl(Number(id), next, version || undefined, 1024)
    }
  }, [page, book, id, version])

  return (
    <main>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>{book?.title || 'Book'}</h1>
        {book && <span style={{color: '#666'}}>• {book.status}</span>}
      </div>
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      {!book && !error && <p>Loading…</p>}
      {book && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-2">
            <Link className="btn" href={`/books/${id}/status`}>Status</Link>
            <div className="text-sm text-gray-600">Use ← → keys</div>
          </div>
          <div className="grid place-items-center">
            <div className="w-full max-w-3xl aspect-[3/4] bg-gray-100 rounded-md overflow-hidden">
              <img alt={`Page ${page}`} src={pageImageUrl(Number(id), page, version || undefined, 1280)} className="w-full h-full object-contain" />
            </div>
            <div className="mt-2 text-sm text-gray-600">Page {page} / {book.page_count || book.pages?.length || 0}</div>
            <div className="mt-3 flex gap-2">
              <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <button className="btn" onClick={() => setPage((p) => Math.min((book.page_count || 1), p + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
