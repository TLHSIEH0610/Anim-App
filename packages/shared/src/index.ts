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

