import Script from 'next/script'
import { GA_MEASUREMENT_ID } from '@/lib/env'
import GaPageView from '@/components/GaPageView'

export default function GoogleAnalytics() {
  const id = GA_MEASUREMENT_ID
  if (!id) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${id}', { send_page_view: false });
        `}
      </Script>
      <GaPageView measurementId={id} />
    </>
  )
}

