"use client"
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import { STRIPE_PK } from '@/lib/env'
import { PropsWithChildren, useMemo } from 'react'

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null

export default function StripeProvider({ children }: PropsWithChildren) {
  const options: StripeElementsOptions = useMemo(() => ({
    appearance: { theme: 'stripe' },
    locale: 'auto',
  }), [])

  if (!stripePromise) return <>{children}</>
  return <Elements stripe={stripePromise} options={options}>{children}</Elements>
}

