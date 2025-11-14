"use client"
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { listBooks } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

export default function PurchasedPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['books','purchased'], queryFn: listBooks })
  const list = Array.isArray(data) ? data : []

  return (
    <main>
      <h1 className="text-xl font-semibold">Purchased</h1>
      <div className="flex gap-3 my-3">
        <Link href="/books" className="btn">All Books</Link>
        <Link href="/create" className="btn">Create</Link>
      </div>
      {error && <p className="text-red-600">{String((error as any)?.message || error)}</p>}
      {isLoading && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="w-full aspect-[3/4]" />
              <div className="mt-2 h-4 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && list.length === 0 && (
        <p>No books yet. Try <Link className="underline" href="/create">creating one</Link>.</p>
      )}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {list.map((b) => (
          <Link key={b.id} href={`/books/${b.id}`} className="card">
            <div className="w-full aspect-[3/4] bg-gray-100 overflow-hidden rounded-md">
              {b.cover_path ? (
                <img
                  alt={b.title}
                  src={`/api/image/book/cover-thumb?bookId=${b.id}&w=360&h=480${b.completed_at || b.updated_at || b.created_at ? `&v=${encodeURIComponent(b.completed_at || b.updated_at || b.created_at as any)}` : ''}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-gray-500">No cover</div>
              )}
            </div>
            <div className="mt-2">
              <div className="font-semibold truncate">{b.title}</div>
              <div className="text-xs text-gray-500">{b.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
