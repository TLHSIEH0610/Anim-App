export type User = {
  id: number
  email: string
  name?: string | null
  picture?: string | null
  card_verified_at?: string | null
  last_login_at?: string | null
}

export async function getMe(): Promise<User | null> {
  try {
    const r = await fetch(`/api/proxy?path=${encodeURIComponent('/auth/me')}`, { credentials: 'include' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

