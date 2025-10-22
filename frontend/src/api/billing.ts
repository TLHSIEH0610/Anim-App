import { api } from "./client";

export interface PricingQuote {
  currency: string;
  base_price: number;
  final_price: number;
  discount_price: number | null;
  promotion_type: string | null;
  promotion_label: string | null;
  free_trial_slug: string | null;
  free_trial_consumed: boolean;
  credits_required: number;
  credits_balance: number;
}

export interface PaymentResult {
  payment_id: number;
  credits_balance: number;
  quote: PricingQuote;
}

export interface StripeIntentResponse {
  payment_id: number;
  client_secret: string;
  publishable_key: string | null;
  quote: PricingQuote;
}

export interface PaymentConfirmation {
  payment_id: number;
  status: string;
  amount: number;
}

export interface BillingHistoryEntry {
  id: number;
  template_slug: string | null;
  method: string;
  amount: number;
  currency: string;
  status: string;
  credits_used: number;
  stripe_payment_intent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BillingHistoryResponse {
  items: BillingHistoryEntry[];
}

export async function fetchPricing(templateSlug: string): Promise<PricingQuote> {
  const response = await api.get(`/billing/quote`, {
    params: { template_slug: templateSlug },
  });
  return response.data as PricingQuote;
}

export async function payWithCredits(templateSlug: string): Promise<PaymentResult> {
  const response = await api.post(`/billing/credits`, { template_slug: templateSlug });
  return response.data as PaymentResult;
}

export async function createStripeIntent(templateSlug: string): Promise<StripeIntentResponse> {
  const response = await api.post(`/billing/stripe-intent`, { template_slug: templateSlug });
  return response.data as StripeIntentResponse;
}

export async function confirmStripePayment(paymentId: number): Promise<PaymentConfirmation> {
  const response = await api.post(`/billing/stripe-confirm`, { payment_id: paymentId });
  return response.data as PaymentConfirmation;
}

export async function fetchBillingHistory(): Promise<BillingHistoryResponse> {
  const response = await api.get(`/billing/history`);
  return response.data as BillingHistoryResponse;
}
