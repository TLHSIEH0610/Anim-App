"use client"
import { Suspense, useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { API_BASE, STRIPE_PK } from '@/lib/env'

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null

function SetupForm({ setupId, template_slug }: { setupId: string, template_slug: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)
    try {
      const { error: confirmError } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.origin + '/checkout/free-trial' },
        redirect: 'if_required',
      })
      if (confirmError) throw confirmError
      // Notify backend verification complete
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/free-trial-verify-complete')}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_intent_id: setupId, template_slug }),
      })
      if (!r.ok) throw new Error(await r.text())
      window.location.href = `/create/success?template_slug=${encodeURIComponent(template_slug)}&apply_free_trial=true`
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{display: 'grid', gap: 12, maxWidth: 520, marginTop: 16}}>
      <PaymentElement options={{ paymentMethodOrder: ['card'] }} />
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      <button className="btn" type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify'}</button>
    </form>
  )
}

export const dynamic = 'force-dynamic'
function FreeTrialPageInner() {
  const sp = useSearchParams()
  const slug = sp.get('template_slug') || 'base'
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [setupId, setSetupId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    async function createSetup() {
      try {
        setError(null)
        const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/setup-intent-free-trial')}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_slug: slug }),
        })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        setClientSecret(data.client_secret || data.clientSecret)
        setSetupId(data.setup_intent_id || data.id)
      } catch (e: any) { setError(e.message) }
    }
    createSetup()
  }, [slug])
  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>Free‑Trial Verification</h1>
      </div>
      {error && <p style={{color: 'crimson'}}>{error}</p>}
      {!clientSecret && !error && <p>Preparing verification…</p>}
      {clientSecret && stripePromise && (
        <Elements stripe={stripePromise} options={{ clientSecret: clientSecret }}>
          <SetupForm setupId={setupId!} template_slug={slug} />
        </Elements>
      )}
    </div>
  )
}

export default function FreeTrialPage() {
  return (
    <Suspense fallback={null}>
      <FreeTrialPageInner />
    </Suspense>
  )
}
