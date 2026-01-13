import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/msw/server'
import { getMe } from '../auth'

describe('getMe', () => {
  it('returns null on non-200', async () => {
    server.use(
      http.get('*/api/proxy', () => HttpResponse.json({ detail: 'nope' }, { status: 401 })),
    )
    await expect(getMe()).resolves.toBeNull()
  })

  it('returns user on 200', async () => {
    server.use(
      http.get('*/api/proxy', ({ request }) => {
        const url = new URL(request.url)
        const rawPath = url.searchParams.get('path') || ''
        const path = decodeURIComponent(rawPath)
        if (path !== '/auth/me') return HttpResponse.json({ detail: 'wrong path' }, { status: 404 })
        return HttpResponse.json({ id: 1, email: 'a@b.com', name: 'Test User' })
      }),
    )
    await expect(getMe()).resolves.toMatchObject({ id: 1, email: 'a@b.com' })
  })
})

