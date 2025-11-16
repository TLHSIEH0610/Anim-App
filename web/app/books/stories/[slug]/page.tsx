"use client"
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { listStoryTemplates, getQuote } from '@/lib/api'
import type { StoryTemplate } from '@animapp/shared'
import { Alert, Box, CircularProgress, Typography } from '@mui/material'

export default function TemplateDemoPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tpls, setTpls] = useState<StoryTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<any | null>(null)
  const [qErr, setQErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true); setError(null)
    listStoryTemplates().then((d) => { if (mounted) setTpls(d) }).catch((e) => setError(e.message || 'Failed to load template')).finally(() => setLoading(false))
    return () => { mounted = false }
  }, [])

  const tpl = useMemo(() => (tpls || []).find(t => t.slug === slug) || null, [tpls, slug])

  useEffect(() => {
    if (!tpl) return
    setQErr(null)
    getQuote(slug).then(setQuote).catch((e) => setQErr(e.message || 'Unable to fetch pricing'))
  }, [tpl, slug])

  if (loading) return <main><CircularProgress size={22} /></main>
  if (error) return <main><Alert severity="error">{error}</Alert></main>
  if (!tpl) return <main><Alert severity="warning">Template not found.</Alert></main>

  return (
    <main>
      <div className="flex items-center gap-3">
        {slug === 'space_explorer' && <Link href="/books" className="btn">Back</Link>}
        {slug === 'space_explorer_1_page' && (
          <div className="text-sm text-gray-600">
            <Link href="/books" className="underline">Books</Link>
            <span> / </span>
            <span>{tpl.name}</span>
          </div>
        )}
        {slug !== 'space_explorer_1_page' && (
          <h1 className="text-xl font-semibold m-0">{tpl.name}</h1>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-4 items-start">
        <div>
          <div className="w-full aspect-[3/4] bg-gray-100 rounded-md overflow-hidden">
            {tpl.cover_path ? (
              <img alt={tpl.name} src={`/api/image/resize?path=${encodeURIComponent(tpl.cover_path)}&w=600&h=800${tpl.version ? `&v=${tpl.version}` : ''}`} className="w-full h-full object-cover" />
            ) : null}
          </div>
          {tpl.demo_images?.filter(Boolean)?.length ? (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {tpl.demo_images!.filter(Boolean).slice(0,6).map((p, i) => (
                <img key={i} alt={`demo ${i}`} src={`/api/image/resize?path=${encodeURIComponent(p as string)}&w=300&h=300${tpl.version ? `&v=${tpl.version}` : ''}`} className="w-full h-24 object-cover rounded" />
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {slug === 'space_explorer_1_page' && (
            <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>{tpl.name}</Typography>
          )}
          {/* Details: move pages/age info here */}
          <Box sx={{ mb: 2 }} className="card">
            <div className="grid grid-cols-2 gap-2 max-w-sm text-sm">
              <div className="text-gray-600">Pages</div>
              <div className="text-right">{tpl.page_count || 0}</div>
              <div className="text-gray-600">Suggested age</div>
              <div className="text-right">{tpl.age || 'n/a'}</div>
            </div>
          </Box>
          {tpl.description && (
            <Typography variant="body1" sx={{ mb: 2 }}>{tpl.description}</Typography>
          )}
          {tpl.storyline_pages?.length ? (() => {
            const visible = tpl.storyline_pages!.filter(p => p.page_number !== 0).slice(0, 6)
            if (!visible.length) return null
            return (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Storyline</Typography>
                <ul className="list-disc pl-5 text-sm text-gray-700">
                  {visible.map((p) => (
                    <li key={p.page_number}>Page {p.page_number}: {p.image_prompt}</li>
                  ))}
                </ul>
              </Box>
            )
          })() : null}
          {slug !== 'space_explorer_1_page' && (
            qErr ? <Alert severity="error" sx={{ mb: 2 }}>{qErr}</Alert> : quote ? (
              <Box sx={{ mb: 2 }}>
                <div className="grid grid-cols-2 gap-2 max-w-sm text-sm">
                  <div className="text-gray-600">Base price</div>
                  <div className="text-right">{Number(quote.base_price).toFixed(2)}</div>
                  {quote.discount_price && quote.discount_price < quote.base_price ? <>
                    <div className="text-gray-600">Discounted</div>
                    <div className="text-right">{Number(quote.discount_price).toFixed(2)}</div>
                  </> : null}
                  {quote.free_trial_slug ? <>
                    <div className="text-gray-600">Free trial</div>
                    <div className="text-right">{quote.free_trial_consumed ? 'Not available' : 'Available'}</div>
                  </> : null}
                  <div className="font-semibold">Total due</div>
                  <div className="font-semibold text-right">{Number(quote.final_price).toFixed(2)}</div>
                </div>
              </Box>
            ) : <CircularProgress size={22} />
          )}
          <div className="flex gap-2">
            <Link className="btn" href={`/create?template_slug=${encodeURIComponent(slug)}`}>Create</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
