'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function GaPageView({ measurementId }: { measurementId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!measurementId) return
    if (typeof window === 'undefined') return
    const gtag = (window as any).gtag
    if (typeof gtag !== 'function') return

    const qs = searchParams?.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    gtag('config', measurementId, { page_path: url })
  }, [measurementId, pathname, searchParams])

  return null
}

