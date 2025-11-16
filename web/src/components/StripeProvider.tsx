"use client"
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe as loadStripePure } from '@stripe/stripe-js/pure'
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js'
import { STRIPE_PK, STRIPE_DISABLE_BEACONS } from '@/lib/env'
import { PropsWithChildren, useMemo } from 'react'

if (STRIPE_DISABLE_BEACONS) {
  // Avoid repeated network beacons in dev/ad-blocked environments
  loadStripePure.setLoadParameters({ advancedFraudSignals: false })
}

declare global {
  interface Window { __animappStripePromise?: Promise<Stripe | null> }
}

export function getStripePromise(): Promise<Stripe | null> | null {
  if (!STRIPE_PK) return null
  if (typeof window !== 'undefined') {
    if (!window.__animappStripePromise) {
      window.__animappStripePromise = loadStripePure(STRIPE_PK)
    }
    return window.__animappStripePromise
  }
  // SSR: create once per module instance
  return loadStripePure(STRIPE_PK)
}

export default function StripeProvider({ children }: PropsWithChildren) {
  const options: StripeElementsOptions = useMemo(() => ({ appearance: { theme: 'stripe' }, locale: 'auto' }), [])
  const stripe = getStripePromise()
  if (!stripe) return <>{children}</>
  return <Elements stripe={stripe} options={options}>{children}</Elements>
}
