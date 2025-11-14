"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Book, getThumbUrl, listBooks } from '@/lib/api'

export default function BooksPage() {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listBooks().then(setBooks).catch((e) => setError(e.message))
  }, [])

  return (
    <main>
      <h1 style={{fontSize: '1.6rem', fontWeight: 600}}>My Library</h1>
      <div style={{display: 'flex', gap: 12, margin: '12px 0'}}>
        <Link href="/" className="btn">Home</Link>
        <Link href="/create" className="btn">Create Book</Link>
        <form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form>
      </div>
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      {!books && !error && <p>Loading…</p>}
      {books && books.length === 0 && <p>No books yet. Try <Link href="/create">creating one</Link>.</p>}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16}}>
        {books?.map((b) => (
          <Link key={b.id} href={`/books/${b.id}`} className="card">
            <div style={{width: '100%', aspectRatio: '3/4', background: '#f2f2f2', overflow: 'hidden', borderRadius: 8}}>
              {b.cover_path ? (
                <img
                  alt={b.title}
                  src={getThumbUrl({ bookId: b.id, token: b.cover_token || undefined, width: 360, height: 480, version: b.completed_at || b.updated_at || b.created_at })}
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
                />
              ) : (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888'}}>No cover</div>
              )}
            </div>
            <div style={{marginTop: 8}}>
              <div style={{fontWeight: 600}}>{b.title}</div>
              <div style={{color: '#666', fontSize: 12}}>{b.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}

