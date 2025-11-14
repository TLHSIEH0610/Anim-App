export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
export const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
export const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
export const SECURE_COOKIES = process.env.NODE_ENV === 'production'

