import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from '../AppShell'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

jest.mock('@/lib/auth', () => ({
  getMe: async () => null,
}))

describe('AppShell', () => {
  it('renders children', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <AppShell>
          <h1>Test Child</h1>
        </AppShell>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Test Child' })).toBeVisible()
  })
})
