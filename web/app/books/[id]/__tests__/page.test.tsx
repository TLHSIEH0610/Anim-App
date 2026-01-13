import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import BookDetailPage from '../page'

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '123' }),
}))

describe('BookDetailPage', () => {
  it('loads and paginates through book pages', async () => {
    server.use(
      http.get('*/api/proxy', ({ request }) => {
        const url = new URL(request.url)
        const path = decodeURIComponent(url.searchParams.get('path') || '')
        if (path !== '/books/123') return HttpResponse.json({ detail: 'not found' }, { status: 404 })
        return HttpResponse.json({
          id: 123,
          title: 'My Book',
          status: 'completed',
          page_count: 3,
          pages: [
            { page_number: 1, text_content: 'Page One' },
            { page_number: 2, text_content: 'Page Two' },
            { page_number: 3, text_content: 'Page Three' },
          ],
          created_at: '2020-01-01T00:00:00Z',
        })
      }),
    )

    render(<BookDetailPage />)

    expect(await screen.findByRole('heading', { name: 'My Book' })).toBeVisible()
    expect(screen.getByText('Page 1 / 3')).toBeVisible()
    expect(screen.getByText('Page One')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 / 3')).toBeVisible()
    expect(screen.getByText('Page Two')).toBeVisible()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Page 3 / 3')).toBeVisible()
    expect(screen.getByText('Page Three')).toBeVisible()
  })
})

