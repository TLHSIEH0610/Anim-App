"use client"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropsWithChildren, useState } from 'react'
import { Toaster } from 'sonner'

export default function Providers({ children }: PropsWithChildren) {
  const [qc] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}

