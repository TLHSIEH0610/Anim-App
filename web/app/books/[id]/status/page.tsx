"use client"
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Status = { status: string; progress_percentage?: number; message?: string }

export default function BookStatusPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useQuery<Status>({
    queryKey: ['book', id, 'status'],
    queryFn: async () => {
      const r = await fetch(`/api/proxy?path=${encodeURIComponent(`/books/${id}/status`)}`, { credentials: 'include' })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    refetchInterval: (q) => (q.state.data?.status && q.state.data.status !== 'completed' ? 2000 : false),
  })

  return (
    <main>
      <div className="flex items-center gap-3">
        <Link href={`/books/${id}`} className="btn">Viewer</Link>
        <h1 className="text-xl font-semibold m-0">Book Status</h1>
      </div>
      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-600">{String((error as any)?.message || error)}</p>}
      {data && (
        <div className="mt-4">
          <div className="text-sm text-gray-600">{data.message}</div>
          <div className="h-3 bg-gray-200 rounded mt-2 overflow-hidden">
            <div className="h-3 bg-blue-500" style={{ width: `${Math.round(data.progress_percentage || 0)}%` }} />
          </div>
          <div className="text-xs text-gray-500 mt-1">{Math.round(data.progress_percentage || 0)}%</div>
          {data.status === 'completed' && (
            <div className="mt-4">
              <Link href={`/books/${id}`} className="btn">Open Viewer</Link>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
