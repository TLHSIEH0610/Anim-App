"use client";
import { Suspense, useEffect, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE, STRIPE_PK } from "@/lib/env";

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

function CardForm({
  paymentId,
  template_slug,
}: {
  paymentId: string;
  template_slug: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/checkout/card",
        },
        redirect: "if_required",
      });
      if (confirmError) throw confirmError;
      // Notify backend to finalize payment record
      const r = await fetch(
        `/api/forward?path=${encodeURIComponent("/billing/stripe-confirm")}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: paymentId }),
        }
      );
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const pid = data?.payment_id || paymentId;
      try {
        sessionStorage.setItem("pendingPaymentId", String(pid || ""));
      } catch {}
      window.location.href = `/create/success?template_slug=${encodeURIComponent(
        template_slug
      )}&paid=true&payment_id=${encodeURIComponent(String(pid || ""))}`;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "grid", gap: 12, maxWidth: 520, margin: "16px auto 0" }}
    >
      <PaymentElement options={{ paymentMethodOrder: ["card"] }} />
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button
        className="btn"
        type="submit"
        disabled={loading}
        style={{ justifySelf: "center", minWidth: 180 }}
      >
        <span>{loading ? "Processing…" : "Pay"}</span>
      </button>
    </form>
  );
}

export const dynamic = "force-dynamic";
function CardPageInner() {
  const sp = useSearchParams();
  const slug = sp.get("template_slug") || "base";
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    async function createIntent() {
      try {
        setError(null);
        const r = await fetch(
          `/api/forward?path=${encodeURIComponent("/billing/stripe-intent")}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_slug: slug }),
          }
        );
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setClientSecret(data.client_secret || data.clientSecret);
        setPaymentId(String(data.payment_id || data.id || ""));
      } catch (e: any) {
        setError(e.message);
      }
    }
    createIntent();
  }, [slug]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 600, margin: 0 }}>
          Card Payment
        </h1>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!clientSecret && !error && <p>Preparing checkout…</p>}
      {clientSecret && stripePromise && (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: clientSecret }}
        >
          <CardForm template_slug={slug} paymentId={paymentId!} />
        </Elements>
      )}
    </div>
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={null}>
      <CardPageInner />
    </Suspense>
  );
}
