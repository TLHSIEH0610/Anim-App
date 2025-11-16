"use client"
import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, CircularProgress, MenuItem, TextField, Typography } from '@mui/material'
import Link from 'next/link'
import { getMe } from '@/lib/auth'
import { listBooks } from '@/lib/api'

type BookLite = { id: number; title?: string | null }

export default function SupportPage() {
  const [me, setMe] = useState<{ email: string; name?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [books, setBooks] = useState<BookLite[]>([])
  const [subject, setSubject] = useState('')
  const [bookId, setBookId] = useState<number | ''>('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const m = await getMe()
        if (mounted) setMe(m)
        const list = await listBooks()
        if (mounted) setBooks(list.map(b => ({ id: (b as any).id, title: (b as any).title })))
      } catch (e:any) {
        // non-fatal
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  async function onSubmit() {
    setError(null); setMessage(null)
    if (!subject.trim() || !body.trim()) { setError('Please provide a subject and a message.'); return }
    try {
      setSubmitting(true)
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        book_id: typeof bookId === 'number' ? bookId : undefined,
        app_version: typeof window !== 'undefined' ? (window as any).__APP_VERSION__ || 'web' : 'web',
        build: '',
        device_os: typeof navigator !== 'undefined' ? navigator.userAgent : 'web',
      }
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/support/tickets')}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(await r.text())
      setSubject(''); setBody(''); setBookId('')
      setMessage('Your message has been sent. We will get back to you shortly.')
    } catch (e:any) {
      setError(e.message || 'Could not send your message.')
    } finally { setSubmitting(false) }
  }

  return (
    <main>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold m-0">Contact Support</h1>
      </div>
      <Box mt={2} maxWidth={720}>
        {loading ? <CircularProgress size={22} /> : (
          <Box className="card">
            {me?.email && <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>Signed in as {me.email}</Typography>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

            <TextField label="Subject" fullWidth value={subject} onChange={(e) => setSubject(e.target.value)} sx={{ mb: 2 }} />
            <TextField select fullWidth label="Related book (optional)" value={bookId} onChange={(e) => setBookId(e.target.value ? Number(e.target.value) : '')} sx={{ mb: 2 }}>
              <MenuItem value="">None</MenuItem>
              {books.map(b => <MenuItem key={b.id} value={b.id}>{b.title || `Book #${b.id}`}</MenuItem>)}
            </TextField>
            <TextField label="Message" fullWidth multiline minRows={6} value={body} onChange={(e) => setBody(e.target.value)} sx={{ mb: 2 }} placeholder="Describe the issue..." />
            <Button variant="contained" onClick={onSubmit} disabled={submitting}>{submitting ? 'Sending…' : 'Send'}</Button>
          </Box>
        )}
      </Box>
    </main>
  )
}
