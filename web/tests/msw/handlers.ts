import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('*/health', () => HttpResponse.json({ status: 'healthy', db: 'connected' })),
  http.get('*/api/proxy', ({ request }) => {
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path') || ''
    const path = decodeURIComponent(rawPath)

    if (path === '/auth/me') {
      return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
    }

    return HttpResponse.json({ detail: `unhandled proxy path: ${path}` }, { status: 404 })
  }),
]
