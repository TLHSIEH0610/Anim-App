"use client"
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert, Box, CircularProgress, Typography } from '@mui/material'

type PendingFile = { name: string; type: string; dataUrl: string }
type PendingCreate = {
  title: string
  template_slug: string
  page_count: number
  template_params: any
  files: PendingFile[]
}

function dataUrlToFile(p: PendingFile): File {
  const arr = p.dataUrl.split(',')
  const mime = p.type || arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream'
  const bstr = atob(arr[arr.length - 1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new File([u8arr], p.name || 'image.jpg', { type: mime })
}

export const dynamic = 'force-dynamic'
function CreateSuccessPageInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [bookId, setBookId] = useState<number | null>(null)
  const [creating, setCreating] = useState(true)
  const [statusLines, setStatusLines] = useState<string[]>([])

  useEffect(() => {
    async function run() {
      try {
        setError(null)
        const paid = sp.get('paid') === 'true'
        const credits = sp.get('credits') === 'true'
        const applyFree = sp.get('apply_free_trial') === 'true'
        const status: string[] = []
        if (paid) status.push('Payment: Card charged')
        if (credits) status.push('Payment: Credits applied')
        if (applyFree) status.push('Payment: Free‑trial verified')
        const pendingRaw = sessionStorage.getItem('pendingCreate')
        if (!pendingRaw) throw new Error('Missing pending create data. Please go back and try again.')
        const pending: PendingCreate = JSON.parse(pendingRaw)
        const fd = new FormData()
        status.push('Submitting book creation…')
        for (const pf of pending.files || []) fd.append('files', dataUrlToFile(pf), pf.name)
        fd.set('title', pending.title)
        fd.set('page_count', String(pending.page_count))
        fd.set('story_source', 'template')
        fd.set('template_key', pending.template_slug)
        fd.set('template_params', JSON.stringify(pending.template_params || {}))
        if (applyFree) fd.set('apply_free_trial', 'true')
        const paymentId = sp.get('payment_id') || sessionStorage.getItem('pendingPaymentId') || undefined
        if ((paid || credits) && paymentId) fd.set('payment_id', String(paymentId))
        const r = await fetch(`/api/forward?path=${encodeURIComponent('/books/create')}`, { method: 'POST', credentials: 'include', body: fd })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        const id = Number((data && (data.book_id ?? data.id)) || 0)
        setBookId(id)
        status.push(`Book created (#${id}). Redirecting to Purchased…`)
        setStatusLines(status)
        sessionStorage.removeItem('pendingCreate')
        sessionStorage.removeItem('pendingPaymentId')
        setTimeout(() => { try { (window as any).location.href = '/purchased' } catch {} }, 1600)
      } catch (e:any) {
        setError(e.message || 'Failed to create book')
      } finally { setCreating(false) }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main>
      <Typography variant="h5">Creating Your Book…</Typography>
      <Box mt={2}>
        {creating ? (
          <CircularProgress size={22} />
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <>
            <div className="card mb-3">
              <div className="text-sm text-gray-600">Status</div>
              <div className="mt-1 grid gap-1 text-sm">
                {statusLines.map((s, i) => (<div key={i}>• {s}</div>))}
              </div>
            </div>
            <Alert severity="success">Success! Book #{bookId} created. <Link className="underline" href={`/books/${bookId}`}>Open book</Link> • <Link className="underline" href="/purchased">Go to Purchased</Link></Alert>
          </>
        )}
      </Box>
    </main>
  )
}

export default function CreateSuccessPage() {
  return (
    <Suspense fallback={null}>
      <div suppressHydrationWarning>
        <CreateSuccessPageInner />
      </div>
    </Suspense>
  )
}
