import GoogleSignIn from '@/components/GoogleSignIn'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">Sign in</h1>
      <p className="text-sm text-gray-600 mb-4">Use your Google account to continue.</p>
      <GoogleSignIn />
      <p className="text-xs text-gray-500 mt-8">By continuing you agree to our <Link href="/legal/terms" className="underline">Terms</Link> and <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.</p>
    </div>
  )
}

