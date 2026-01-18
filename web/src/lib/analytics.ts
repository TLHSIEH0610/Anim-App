export type GaEvent = {
  action: string
  category?: string
  label?: string
  value?: number
}

function hasGtag(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).gtag === 'function'
}

export function gaPageView(url: string): void {
  if (!hasGtag()) return
  ;(window as any).gtag('event', 'page_view', { page_location: url })
}

export function gaEvent(event: GaEvent): void {
  if (!hasGtag()) return
  ;(window as any).gtag('event', event.action, {
    event_category: event.category,
    event_label: event.label,
    value: event.value,
  })
}

