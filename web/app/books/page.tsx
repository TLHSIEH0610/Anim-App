"use client"
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getThumbUrl, listStoryTemplates, authToken } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

export default function BooksPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['stories','templates'], queryFn: listStoryTemplates })
  const list = Array.isArray(data) ? data : []
  const token = authToken() || ''

  return (
    <main>
      <h1 className="text-xl font-semibold">Books</h1>
      <div className="my-3" />
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
      {!isLoading && list.length === 0 && <p>No templates found.</p>}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {list.map((t) => {
          const basePrice = typeof t.price_dollars === 'number' ? t.price_dollars : null
          const effectivePrice = typeof t.final_price === 'number' ? t.final_price : basePrice
          const isFree = !!t.free_slug
          const hasDiscount = typeof t.discount === 'number' && t.discount > 0 && basePrice !== null && t.discount < basePrice
          const isSale = !isFree && hasDiscount
          const showCustomLabel = !!t.promotion_label && !isFree && !isSale
          return (
            <div key={t.slug} className="card">
              <div className="w-full aspect-[3/4] bg-gray-100 overflow-hidden rounded-md relative">
                {t.cover_path ? (
                  <Link href={`/books/stories/${encodeURIComponent(t.slug)}`}>
                    <img
                      alt={t.name}
                      src={`/api/image/resize?path=${encodeURIComponent(t.cover_path)}&w=360&h=480${t.version ? `&v=${t.version}` : ''}`}
                      className="w-full h-full object-cover"
                    />
                  </Link>
                ) : (
                  <div className="w-full h-full grid place-items-center text-gray-500">No cover</div>
                )}
                {(isFree || isSale || showCustomLabel) && (
                  <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-end gap-1">
                    {isFree && (
                      <span className="inline-flex items-center rounded-full bg-green-600/95 px-3 py-1 text-xs font-semibold tracking-wide text-white shadow-md border border-white/20">
                        Free
                      </span>
                    )}
                    {isSale && (
                      <span className="inline-flex items-center rounded-full bg-red-600/95 px-3 py-1 text-xs font-semibold tracking-wide text-white shadow-md border border-white/20">
                        Sale
                      </span>
                    )}
                    {showCustomLabel && (
                      <span className="inline-flex items-center rounded-full bg-blue-600/95 px-3 py-1 text-[11px] font-semibold tracking-wide text-white shadow-md border border-white/20">
                        {t.promotion_label}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2">
                <div className="font-semibold truncate">{t.name}</div>
                <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-baseline gap-1">
                  <span>{t.page_count} pages •</span>
                  {isFree ? (
                    <span className="font-semibold text-green-700">Free</span>
                  ) : isSale && basePrice !== null && effectivePrice !== null ? (
                    <>
                      <span className="line-through text-gray-400">
                        ${basePrice.toFixed(2)}
                      </span>
                      <span className="font-semibold text-red-600">
                        ${effectivePrice.toFixed(2)}
                      </span>
                    </>
                  ) : effectivePrice != null ? (
                    <span className="font-semibold text-gray-700">
                      ${effectivePrice.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Link href={`/books/stories/${encodeURIComponent(t.slug)}`} className="btn">View</Link>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
