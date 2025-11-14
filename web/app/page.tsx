import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Create magical children’s books with your photos</h1>
          <p className="mt-3 text-gray-600">Personalized stories, beautiful illustrations, and instant sharing. Sign in to get started.</p>
          <div className="mt-5 flex gap-3">
            <Link href="/login" className="btn">Continue with Google</Link>
            <Link href="/support" className="btn" style={{ background: 'transparent', color: 'inherit', borderColor: 'hsl(var(--border))' }}>Learn more</Link>
          </div>
          <p className="text-xs text-gray-500 mt-3">By continuing you agree to our <Link className="underline" href="/legal/terms">Terms</Link> and <Link className="underline" href="/legal/privacy">Privacy Policy</Link>.</p>
        </div>
        <div className="hidden md:block">
          <div className="rounded-xl border border-[hsl(var(--border))] p-6 bg-white shadow-card">
            <div className="h-64 bg-[url('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center rounded-md" />
            <div className="mt-3 text-sm text-gray-600">Make every bedtime unique with personalized adventures.</div>
          </div>
        </div>
      </div>
    </main>
  )
}
