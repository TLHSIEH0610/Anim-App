import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AnimApp Web',
  description: "Create children's books with AI illustrations",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{maxWidth: 1040, margin: '0 auto', padding: '1rem'}}>
          {children}
        </div>
      </body>
    </html>
  )
}

