"use client"
import { useState } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/env'

export default function CreatePage({ searchParams }: { searchParams?: { template_slug?: string; apply_free_trial?: string; paid?: string } }) {
  const [title, setTitle] = useState('My Adventure')
  const [templateSlug, setTemplateSlug] = useState(searchParams?.template_slug || 'base')
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function tokenFromCookie() {
    const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/) : null
    return m ? decodeURIComponent(m[1]) : null
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.set('title', title)
      fd.set('template_slug', templateSlug)
      if (file) fd.set('file', file)
      if (searchParams?.apply_free_trial === 'true') fd.set('apply_free_trial', 'true')
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/books/create')}`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setMessage(`Created book #${data.book_id}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <Link href="/books" className="btn">Library</Link>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>Create Book</h1>
      </div>
      <form onSubmit={onSubmit} style={{display: 'grid', gap: 12, maxWidth: 520, marginTop: 16}}>
        <label>
          <div>Title</div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          <div>Template Slug</div>
          <input className="input" value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)} required />
        </label>
        <label>
          <div>Reference Image (optional)</div>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <button className="btn" type="submit" disabled={loading}>{loading ? 'Submitting…' : 'Submit'}</button>
      </form>
      {message && <p style={{color: 'green', marginTop: 12}}>{message}</p>}
      {error && <p style={{color: 'crimson', marginTop: 12}}>{error}</p>}
    </main>
  )
}
