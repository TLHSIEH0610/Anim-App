import Link from 'next/link'
import GoogleSignIn from '@/components/GoogleSignIn'
import { cookies } from 'next/headers'

export default function Home() {
  const cookieStore = cookies()
  const token = cookieStore.get('auth_token')?.value

  return (
    <main>
      <h1 style={{fontSize: '2rem', fontWeight: 700}}>AnimApp Web</h1>
      <p>Create AI‑illustrated children’s books on the web.</p>
      <div style={{display: 'flex', gap: 12, margin: '16px 0'}}>
        <Link href="/books" className="btn">Go to Library</Link>
        <Link href="/create" className="btn">Create a Book</Link>
      </div>
      <section style={{marginTop: 24}}>
        {token ? (
          <p>You are signed in. Visit your <Link href="/books">library</Link>.</p>
        ) : (
          <>
            <h2>Sign in</h2>
            <GoogleSignIn />
          </>
        )}
      </section>
    </main>
  )
}

