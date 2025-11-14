"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getQuote } from '@/lib/api'
import { Tabs, Tab, Box, TextField, Alert } from '@mui/material'
import StripeProvider from '@/components/StripeProvider'
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { API_BASE } from '@/lib/env'

function CardTab({ template_slug }: { template_slug: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [pi, setPi] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function createPI() {
      try {
        const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/stripe-intent')}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_slug }),
        })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        setClientSecret(data.client_secret || data.clientSecret)
        setPi(data.payment_intent_id || data.id)
      } catch (e: any) { setError(e.message) }
    }
    createPI()
  }, [template_slug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true); setError(null)
    try {
      const { error: ce } = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.origin + '/checkout' }, redirect: 'if_required' })
      if (ce) throw ce
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/stripe-confirm')}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_intent_id: pi }) })
      if (!r.ok) throw new Error(await r.text())
      window.location.href = `/books/create?template_slug=${encodeURIComponent(template_slug)}&paid=true`
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <Box mt={2}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {clientSecret && (
        <form onSubmit={onSubmit}>
          <PaymentElement />
          <Box mt={2}><button className="btn" disabled={loading} type="submit">{loading ? 'Processing…' : 'Pay'}</button></Box>
        </form>
      )}
    </Box>
  )
}

function FreeTrialTab({ template_slug }: { template_slug: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [setupId, setSetupId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function createSetup() {
      try {
        const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/setup-intent-free-trial')}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_slug }),
        })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        setClientSecret(data.client_secret || data.clientSecret)
        setSetupId(data.setup_intent_id || data.id)
      } catch (e: any) { setError(e.message) }
    }
    createSetup()
  }, [template_slug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true); setError(null)
    try {
      const { error: ce } = await stripe.confirmSetup({ elements, confirmParams: { return_url: window.location.origin + '/checkout' }, redirect: 'if_required' })
      if (ce) throw ce
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/free-trial-verify-complete')}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setup_intent_id: setupId, template_slug }) })
      if (!r.ok) throw new Error(await r.text())
      window.location.href = `/books/create?template_slug=${encodeURIComponent(template_slug)}&apply_free_trial=true`
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <Box mt={2}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {clientSecret && (
        <form onSubmit={onSubmit}>
          <PaymentElement />
          <Box mt={2}><button className="btn" disabled={loading} type="submit">{loading ? 'Verifying…' : 'Verify'}</button></Box>
        </form>
      )}
    </Box>
  )
}

export default function CheckoutPage({ searchParams }: { searchParams: { template_slug?: string } }) {
  const [slug, setSlug] = useState(searchParams.template_slug || 'base')
  const [quote, setQuote] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(0)

  useEffect(() => { getQuote(slug).then(setQuote).catch((e) => setError(e.message)) }, [slug])

  const price = quote ? (quote.total_dollars ?? quote.price_dollars ?? 0) : 0
  const cardAvailable = Boolean(quote?.card_available)
  const freeTrial = Boolean(quote?.free_trial_available)

  return (
    <StripeProvider>
      <main>
        <div className="flex items-center gap-3">
          <Link href="/books" className="btn">Library</Link>
          <h1 className="text-xl font-semibold m-0">Checkout</h1>
        </div>
        <Box mt={2} maxWidth={520}>
          <TextField label="Template Slug" fullWidth value={slug} onChange={(e) => setSlug(e.target.value)} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {quote && (
            <Alert severity="info" sx={{ mt: 2 }}>Price: <b>${Number(price).toFixed(2)}</b> • Card: {String(cardAvailable)} • Free‑trial: {String(freeTrial)}</Alert>
          )}
          <Box mt={3}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab label="Card" disabled={!cardAvailable} />
              <Tab label="Free Trial" disabled={!freeTrial} />
            </Tabs>
            {tab === 0 && cardAvailable && <CardTab template_slug={slug} />}
            {tab === 1 && freeTrial && <FreeTrialTab template_slug={slug} />}
          </Box>
        </Box>
      </main>
    </StripeProvider>
  )
}
