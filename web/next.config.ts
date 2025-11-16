import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false,
  experimental: {
    // appDir is default in Next 13+ (kept for clarity)
  },
  transpilePackages: ['@animapp/shared'],
  // Map Expo-style envs to Next public envs so a shared .env can be reused.
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? process.env.EXPO_PUBLIC_API_BASE,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID:
      process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  },
  // We use plain <img> for dynamic remote hosts to avoid static host allowlists.
}

export default config
