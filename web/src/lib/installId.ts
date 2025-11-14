const KEY = 'animapp_install_id'

export function getOrCreateInstallId(): string {
  if (typeof window === 'undefined') return 'web-server'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

