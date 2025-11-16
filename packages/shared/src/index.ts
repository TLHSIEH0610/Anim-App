export type Book = {
  id: number
  title: string
  status: string
  created_at?: string
  updated_at?: string
  completed_at?: string | null
  cover_path?: string | null
  cover_token?: string | null
}

export type Quote = {
  card_available: boolean
  free_trial_available?: boolean
  total_dollars?: number
  price_dollars?: number
}

export type StoryTemplate = {
  slug: string
  name: string
  description?: string | null
  age?: string | null
  version?: number | null
  page_count: number
  cover_path?: string | null
  demo_images?: (string | null)[]
  storyline_pages?: { page_number: number; image_prompt: string }[]
  currency?: string | null
  price_dollars?: number | null
  discount_price?: number | null
   // Dynamic discount for current user/session (maps to backend "discount")
  discount?: number | null
  final_price?: number | null
  promotion_type?: string | null
  promotion_label?: string | null
  free_trial_slug?: string | null
  // Convenience alias: free-trial slug only when not yet consumed
  free_slug?: string | null
  free_trial_consumed?: boolean
  credits_required?: number | null
  credits_balance?: number | null
}
