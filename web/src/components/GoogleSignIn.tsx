"use client"
import { useEffect, useRef, useState } from 'react'
import { API_BASE, GOOGLE_WEB_CLIENT_ID } from '@/lib/env'

declare global {
  interface Window {
    google?: any
  }
}

export default function GoogleSignIn() {
  const btnRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      setError('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID not set')
      return
    }

    // Load Google Identity Services script
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      try {
        window.google?.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID,
          callback: async (resp: any) => {
            try {
              const r = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: resp.credential }),
              })
              if (!r.ok) throw new Error('Login failed')
              // Refresh to pick up auth cookie in server components
              window.location.href = '/books'
            } catch (e: any) {
              setError(e.message)
            }
          },
        })
        if (btnRef.current) {
          window.google?.accounts.id.renderButton(btnRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
          })
        }
      } catch (e: any) {
        setError(e.message)
      }
    }
    script.onerror = () => setError('Failed to load Google script')
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [])

  return (
    <div>
      <div ref={btnRef} />
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}

