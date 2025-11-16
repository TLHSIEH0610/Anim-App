"use client"
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import { getMe } from '@/lib/auth'
import { listStoryTemplates } from '@/lib/api'

export default function AccountPage() {
  const [me, setMe] = useState<{ name?: string | null; email: string } | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const initials = useMemo(() => (me?.name || me?.email || '').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase(), [me])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const u = await getMe(); if (mounted) setMe(u)
        const tpls = await listStoryTemplates();
        const first: any = Array.isArray(tpls) ? tpls[0] : null
        if (mounted) setCredits(typeof first?.credits_balance === 'number' ? first.credits_balance : null)
      } catch (e:any) { if (mounted) setError(e.message || 'Failed to load account') } finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  async function deleteAccount() {
    if (!confirm('This will permanently delete your account and all books. Continue?')) return
    setError(null); setDeleting(true)
    try {
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/auth/account')}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) throw new Error(await r.text())
      // After deletion, log out to clear cookie and redirect to landing
      window.location.href = '/api/logout'
    } catch (e:any) { setError(e.message || 'Failed to delete account') } finally { setDeleting(false) }
  }

  return (
    <main>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold m-0">Account</h1>
      </div>
      <Box mt={2} maxWidth={720}>
        {loading ? <CircularProgress size={22} /> : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box className="card" sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">Name</Typography>
              <Typography variant="body1">{me?.name || '—'}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>Email</Typography>
              <Typography variant="body1">{me?.email || '—'}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>Credits</Typography>
              <Typography variant="body1">{credits == null ? '—' : String(credits)}</Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" color="error" onClick={deleteAccount} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete account'}</Button>
            </Box>
          </>
        )}
      </Box>
    </main>
  )
}
