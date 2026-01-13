import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/msw/server'
import BooksPage from '../page'

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('BooksPage', () => {
  it('shows empty state when no templates returned', async () => {
    server.use(
      http.get('*/api/proxy', ({ request }) => {
        const url = new URL(request.url)
        const path = decodeURIComponent(url.searchParams.get('path') || '')
        if (path !== '/books/stories/templates') {
          return HttpResponse.json({ detail: `unexpected path: ${path}` }, { status: 404 })
        }
        return HttpResponse.json({ stories: [] })
      }),
    )

    renderWithQueryClient(<BooksPage />)
    expect(await screen.findByText('No templates found.')).toBeVisible()
  })

  it('renders a template card when templates are returned', async () => {
    server.use(
      http.get('*/api/proxy', ({ request }) => {
        const url = new URL(request.url)
        const path = decodeURIComponent(url.searchParams.get('path') || '')
        if (path !== '/books/stories/templates') {
          return HttpResponse.json({ detail: `unexpected path: ${path}` }, { status: 404 })
        }
        return HttpResponse.json({
          stories: [
            {
              slug: 'dragon',
              name: 'Dragon Story',
              page_count: 8,
              cover_path: 'stories/dragon.png',
              version: 3,
              price_dollars: 2.5,
            },
          ],
        })
      }),
    )

    renderWithQueryClient(<BooksPage />)
    expect(await screen.findByText('Dragon Story')).toBeVisible()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/books/stories/dragon')
  })
})

