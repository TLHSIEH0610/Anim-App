"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getQuote } from '@/lib/api'

export default function CheckoutPage({ searchParams }: { searchParams: { template_slug?: string } }) {
  const [slug, setSlug] = useState(searchParams.template_slug || 'base')
  const [quote, setQuote] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getQuote(slug).then(setQuote).catch((e) => setError(e.message))
  }, [slug])

  return (
    <main>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <Link href="/books" className="btn">Library</Link>
        <h1 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0}}>Checkout</h1>
      </div>
      <div style={{marginTop: 12, display: 'grid', gap: 8, maxWidth: 520}}>
        <label>
          <div>Template Slug</div>
          <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        {error && <p style={{color: 'crimson'}}>{error}</p>}
        {!quote && !error && <p>Loading quote…</p>}
        {quote && (
          <div className="card" style={{display: 'grid', gap: 8}}>
            <div>Price: <b>${(quote.total_dollars ?? quote.price_dollars ?? 0).toFixed?.(2) ?? quote.total_dollars}</b></div>
            <div>Card available: <b>{String(quote.card_available)}</b></div>
            <div style={{display: 'flex', gap: 8, marginTop: 8}}>
              {quote.card_available && <Link className="btn" href={`/checkout/card?template_slug=${encodeURIComponent(slug)}`}>Pay with card</Link>}
              {quote.free_trial_available && <Link className="btn" href={`/checkout/free-trial?template_slug=${encodeURIComponent(slug)}`}>Verify free trial</Link>}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

