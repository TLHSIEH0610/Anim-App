"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/env'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Box, Step, StepLabel, Stepper, TextField } from '@mui/material'
import { getQuote } from '@/lib/api'

const schema = z.object({ title: z.string().min(1), template_slug: z.string().min(1) })

export default function CreatePage({ searchParams }: { searchParams?: { template_slug?: string; apply_free_trial?: string; paid?: string } }) {
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [quote, setQuote] = useState<any | null>(null)
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { title: 'My Adventure', template_slug: searchParams?.template_slug || 'base' } })

  const templateSlug = watch('template_slug')

  useEffect(() => { getQuote(templateSlug).then(setQuote).catch(() => {}) }, [templateSlug])

  function tokenFromCookie() {
    const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/) : null
    return m ? decodeURIComponent(m[1]) : null
  }

  async function onSubmit() {
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.set('title', watch('title'))
      fd.set('template_slug', watch('template_slug'))
      if (file) fd.set('file', file)
      if (searchParams?.apply_free_trial === 'true') fd.set('apply_free_trial', 'true')
      const r = await fetch(`/api/forward?path=${encodeURIComponent('/books/create')}`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setMessage(`Created book #${data.book_id}`)
      setStep(3)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <div className="flex items-center gap-3">
        <Link href="/books" className="btn">Library</Link>
        <h1 className="text-xl font-semibold m-0">Create Book</h1>
      </div>
      <Box mt={2} maxWidth={640}>
        <Stepper activeStep={step} alternativeLabel>
          <Step><StepLabel>Template</StepLabel></Step>
          <Step><StepLabel>Details</StepLabel></Step>
          <Step><StepLabel>Photos</StepLabel></Step>
          <Step><StepLabel>Submit</StepLabel></Step>
        </Stepper>
        <Box mt={3} component="form" onSubmit={handleSubmit(onSubmit)}>
          {step === 0 && (
            <>
              <TextField label="Template Slug" fullWidth {...register('template_slug')} error={!!errors.template_slug} helperText={errors.template_slug?.message} />
              {quote && <Alert sx={{ mt: 2 }} severity="info">Price ${(quote.total_dollars ?? quote.price_dollars ?? 0).toFixed?.(2) || quote.total_dollars}</Alert>}
              <Box mt={2} className="flex gap-2">
                <button type="button" className="btn" onClick={() => setStep(1)}>Next</button>
              </Box>
            </>
          )}
          {step === 1 && (
            <>
              <TextField label="Title" fullWidth {...register('title')} error={!!errors.title} helperText={errors.title?.message} />
              <Box mt={2} className="flex gap-2">
                <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
                <button type="button" className="btn" onClick={() => setStep(2)}>Next</button>
              </Box>
            </>
          )}
          {step === 2 && (
            <>
              <div>Reference Image (optional)</div>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <Box mt={2} className="flex gap-2">
                <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn" onClick={() => setStep(3)}>Review</button>
              </Box>
            </>
          )}
          {step === 3 && (
            <>
              <Alert severity="info">Ready to submit. Template <b>{templateSlug}</b>, title <b>{watch('title')}</b>.</Alert>
              <Box mt={2} className="flex gap-2">
                <button type="button" className="btn" onClick={() => setStep(2)}>Back</button>
                <button className="btn" type="submit" disabled={loading}>{loading ? 'Submitting…' : 'Submit'}</button>
              </Box>
            </>
          )}
          {message && <Alert sx={{ mt: 2 }} severity="success">{message}</Alert>}
          {error && <Alert sx={{ mt: 2 }} severity="error">{error}</Alert>}
        </Box>
      </Box>
    </main>
  )
}
