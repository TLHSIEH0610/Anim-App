"use client"
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type BookDetail = {
  id: number
  title: string
  status: string
  page_count?: number
  pages?: { page_number: number; text_content?: string; image_completed_at?: string | null }[]
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
    let mounted = true
    async function load() {
      try {
        const r = await fetch(`/api/proxy?path=${encodeURIComponent(`/books/${id}`)}`, { credentials: 'include' })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        if (mounted) setBook(data)
      } catch (e: any) {
        if (mounted) setError(e.message)
      }
    }
    load()
    return () => { mounted = false }
  }, [id])

  const version = book?.completed_at || book?.updated_at || book?.created_at || undefined
  const bodyPages = (book?.pages || []).filter(p => typeof p.page_number === 'number' && p.page_number > 0)
  const totalPages = Math.max(
    1,
    Number(book?.page_count || 0) || 0,
    bodyPages.length || 0,
  )

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
    if (next <= totalPages) {
      const img = new Image()
      img.src = pageImageUrl(Number(id), next, version || undefined, 1024)
    }
  }, [page, book, id, version])

  return (
    <main>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <a href="/purchased" aria-label="Back to Purchased" title="Back to Purchased" style={{textDecoration: 'none', fontSize: '1.4rem', lineHeight: 1}}>
          ←
        </a>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>{book?.title || 'Book'}</h1>
      </div>
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      {!book && !error && <p>Loading…</p>}
      {book && (
        <div className="mt-4">
          <div className="mb-2" />
          <div className="grid place-items-center">
            <div className="w-full max-w-3xl flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Page {page} / {totalPages}</div>
              <div className="flex gap-2">
                <button
                  className={`btn ${page <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  className={`btn ${page >= totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="w-full max-w-3xl rounded-md overflow-hidden">
              <img
                alt={`Page ${page}`}
                src={pageImageUrl(Number(id), page, version || undefined, 1280)}
                className="w-full h-auto block"
              />
            </div>
            {book.pages && (
              <div className="w-full max-w-3xl mt-4">
                <div className="card p-4">
                  <div className="text-base leading-relaxed whitespace-pre-line">
                    {(book.pages.find(p => p.page_number === page)?.text_content) || ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
