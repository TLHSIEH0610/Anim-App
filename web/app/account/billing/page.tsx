"use client"
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, Box, Chip, CircularProgress, Typography } from '@mui/material'

type Entry = {
  id: number
  template_slug: string | null
  method: string
  amount: number
  currency: string
  status: string
  credits_used: number
  stripe_payment_intent_id: string | null
  metadata: any
  created_at: string
}

function formatCurrency(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(amount) } catch { return `${(currency||'USD').toUpperCase()} ${Number(amount||0).toFixed(2)}` }
}

function formatDate(value: string) { try { return new Date(value).toLocaleString() } catch { return value } }

export default function BillingHistoryPage() {
  const [items, setItems] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templateNames, setTemplateNames] = useState<Record<string,string>>({})

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const r = await fetch(`/api/proxy?path=${encodeURIComponent('/billing/history')}`, { credentials: 'include' })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        if (mounted) setItems(Array.isArray(data.items) ? data.items : [])
        // load template names for mapping
        try {
          const t = await fetch(`/api/proxy?path=${encodeURIComponent('/books/stories/templates')}`, { credentials: 'include' })
          if (t.ok) {
            const td = await t.json()
            const map: Record<string,string> = {}
            for (const s of td?.stories || []) { if (s?.slug) map[s.slug] = s.name || s.slug }
            if (mounted) setTemplateNames(map)
          }
        } catch {}
      } catch (e:any) { if (mounted) setError(e.message || 'Failed to load history') } finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <main>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold m-0">Billing History</h1>
      </div>
      <Box mt={2}>
        {loading ? <CircularProgress size={22} /> : error ? <Alert severity="error">{error}</Alert> : (
          items.length === 0 ? (
            <Alert severity="info">No transactions yet.</Alert>
          ) : (
            <div className="grid gap-3">
              {items.map((e) => (
                <div key={e.id} className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{e.template_slug ? (templateNames[e.template_slug] || e.template_slug) : 'Custom'}</div>
                      <div className="text-xs text-gray-600">Method: {e.method === 'credit' ? 'Credits' : 'Card'} • Date: {formatDate(e.created_at as any)}</div>
                    </div>
                    <Chip size="small" label={e.status === 'completed' ? 'Completed' : e.status === 'requires_confirmation' ? 'Needs Confirmation' : e.status} color={e.status === 'completed' ? 'success' as any : e.status === 'failed' ? 'error' as any : 'default'} />
                  </div>
                  <div className="mt-1 font-semibold text-blue-700">{e.method === 'credit' ? `${e.credits_used} credits` : formatCurrency(e.amount, e.currency)}</div>
                  {e.stripe_payment_intent_id && <div className="text-xs text-gray-500">Stripe ID: {e.stripe_payment_intent_id}</div>}
                </div>
              ))}
            </div>
          )
        )}
      </Box>
    </main>
  )
}
