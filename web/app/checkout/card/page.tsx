"use client"
import { useEffect, useState } from 'react'
import StripeProvider from '@/components/StripeProvider'
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import Link from 'next/link'
import { API_BASE } from '@/lib/env'

function CardInner({ template_slug }: { template_slug: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [pi, setPi] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function createIntent() {
      try {
        setError(null)
        const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/stripe-intent')}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_slug }),
        })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        setClientSecret(data.client_secret || data.clientSecret)
        setPi(data.payment_intent_id || data.id)
      } catch (e: any) {
        setError(e.message)
      }
    }
    createIntent()
  }, [template_slug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setLoading(true)
    setError(null)
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.origin + '/checkout/card' },
        redirect: 'if_required',
      })
      if (confirmError) throw confirmError
      // Notify backend to finalize payment record
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/stripe-confirm')}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_intent_id: pi }),
      })
      if (!r.ok) throw new Error(await r.text())
      // Redirect to create page to kick off the book
      window.location.href = `/create?template_slug=${encodeURIComponent(template_slug)}&paid=true`
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <Link href={`/checkout?template_slug=${encodeURIComponent(template_slug)}`} className="btn">Back</Link>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>Card Payment</h1>
      </div>
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      {!clientSecret && !error && <p>Preparing checkout…</p>}
      {clientSecret && (
        <form onSubmit={onSubmit} style={{display: 'grid', gap: 12, maxWidth: 520, marginTop: 16}}>
          <PaymentElement />
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Processing…' : 'Pay'}</button>
        </form>
      )}
    </div>
  )
}

export default function CardPage({ searchParams }: { searchParams: { template_slug?: string } }) {
  const slug = searchParams.template_slug || 'base'
  return (
    <StripeProvider>
      <CardInner template_slug={slug} />
    </StripeProvider>
  )
}
