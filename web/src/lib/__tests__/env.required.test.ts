describe('required env vars', () => {
  it('has required NEXT_PUBLIC_* values', () => {
    const required = [
      'NEXT_PUBLIC_API_BASE',
      'NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    ] as const

    const missing = required.filter((key) => {
      const value = process.env[key]
      return !value || !String(value).trim()
    })

    if (missing.length) {
      throw new Error(
        `Missing required env vars: ${missing.join(', ')}. Set them in web/.env or web/.env.local (not committed).`,
      )
    }
  })
})

