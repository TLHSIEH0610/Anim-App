"use client";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/env";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Button as MuiButton,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";
// No Stripe Elements on this page; payments handled via dedicated checkout screens
import { getQuote, listStoryTemplates } from "@/lib/api";
import type { StoryTemplate } from "@animapp/shared";
import { useSearchParams } from "next/navigation";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  template_slug: z.string().min(1, "Template is required"),
  name: z.string().min(1, "Character name is required"),
  gender: z.enum(["female", "male"]),
});

function CreatePageInner() {
  const sp = useSearchParams();
  const qsTemplateSlug = sp.get("template_slug") || undefined;
  const applyFreeTrialQS = sp.get("apply_free_trial") === "true";
  const paidQS = sp.get("paid") === "true";
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]); // restrict to JPEG/PNG as requested

  function validateAndMerge(incoming: File[]): {
    next: File[];
    error?: string;
  } {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      if (!ALLOWED_TYPES.has(f.type)) {
        rejected.push(`${f.name}: unsupported type (${f.type || "unknown"})`);
        continue;
      }
      if (f.size > MAX_IMAGE_SIZE) {
        rejected.push(`${f.name}: larger than 10MB`);
        continue;
      }
      accepted.push(f);
    }
    const next = [...files, ...accepted].slice(0, 3);
    const error = rejected.length
      ? `Some files were rejected — ${rejected.slice(0, 3).join("; ")}${
          rejected.length > 3 ? "…" : ""
        }`
      : undefined;
    return { next, error };
  }
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState<any | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(true);
  const [tplError, setTplError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<
    null | "free_trial" | "credits" | "card"
  >(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  // Payments handled via checkout screens; Create never mounts Stripe Elements
  // Debug states (removed noisy panels that caused confusion)
  const [heroError, setHeroError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    trigger,
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "My Adventure",
      template_slug: qsTemplateSlug || "base",
      name: "",
      gender: "female",
    },
  });

  const templateSlug = watch("template_slug");
  const name = watch("name");

  const selectedTpl = useMemo(
    () => templates.find((t) => t.slug === templateSlug) || null,
    [templates, templateSlug]
  );
  const pageCount = selectedTpl?.page_count || 8;
  const genderLabel = useMemo(() => {
    const g = (watch("gender") || "").toLowerCase();
    return g === "male" ? "boy" : g === "female" ? "girl" : "child";
  }, [watch("gender")]);
  const formatCurrency = (amt?: any, cur?: string) => {
    const n = Number(amt ?? 0);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: (cur || "USD").toUpperCase(),
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${(cur || "USD").toUpperCase()} ${n.toFixed(2)}`;
    }
  };

  // Load templates and set initial fields
  useEffect(() => {
    let mounted = true;
    setTplLoading(true);
    setTplError(null);
    listStoryTemplates()
      .then((data) => {
        if (!mounted) return;
        setTemplates(data);
        // Set template if provided
        const slug = qsTemplateSlug || data[0]?.slug;
        if (slug) setValue("template_slug", slug);
      })
      .catch((e) => setTplError(e.message || "Failed to load templates"))
      .finally(() => setTplLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Auto title from template + name
  useEffect(() => {
    const tpl = templates.find((t) => t.slug === templateSlug);
    const storyLabel = tpl?.name || "Story";
    const cleanName = (name || "").trim();
    const auto = cleanName
      ? `${storyLabel} - ${cleanName}`
      : `${storyLabel} - Character Name`;
    setValue("title", auto, { shouldValidate: true });
  }, [templateSlug, name, templates, setValue]);

  // Load pricing per template
  useEffect(() => {
    if (!templateSlug) {
      setQuote(null);
      return;
    }
    setPricingLoading(true);
    setPricingError(null);
    getQuote(templateSlug)
      .then((q) => setQuote(q))
      .catch((e) => setPricingError(e.message || "Unable to fetch pricing"))
      .finally(() => setPricingLoading(false));
  }, [templateSlug]);

  function tokenFromCookie() {
    const m =
      typeof document !== "undefined"
        ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/)
        : null;
    return m ? decodeURIComponent(m[1]) : null;
  }
  // Payment UI removed (handled via checkout screens)

  // If returning from checkout with success flags, skip to Submit
  useEffect(() => {
    if (paidQS || applyFreeTrialQS) setStep(3)
  }, [paidQS, applyFreeTrialQS])

async function createBookAndRedirect({ applyFreeTrial, paidId }: { applyFreeTrial?: boolean; paidId?: number | null }) {
    setError(null); setMessage(null); setLoading(true)
    try {
      const fd = new FormData();
      files.forEach((f, idx) => fd.append("files", f, f.name || `character_${idx}.jpg`));
      fd.set("title", watch("title"));
      const tpl = templates.find((t) => t.slug === templateSlug);
      const pageCount = tpl?.page_count || 8;
      fd.set("page_count", String(pageCount));
      fd.set("story_source", "template");
      fd.set("template_key", templateSlug);
      const params = { name: watch("name")?.trim() || undefined, gender: watch("gender") };
      fd.set("template_params", JSON.stringify(params));
      if (applyFreeTrial || applyFreeTrialQS) fd.set("apply_free_trial", "true");
      if (paidId || paymentId) fd.set("paymentId", String(paidId || paymentId));
      const r = await fetch(`/api/forward?path=${encodeURIComponent("/books/create")}`, { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      window.location.href = `/create/success?book_id=${data.book_id}`;
    } catch (e:any) { setError(e.message) } finally { setLoading(false) }
  }

  async function onSubmit() {
    // Credits / free only
    if (paymentMethod === "credits" && quote && Number(quote.credits_required || 0) > 0 && !paymentId) {
      try {
        const r = await fetch(`/api/forward?path=${encodeURIComponent("/billing/credits")}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template_slug: templateSlug }) })
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setPaymentId(data.payment_id);
        setQuote(data.quote);
      } catch (e:any) { setError(e.message); return }
    }
    await createBookAndRedirect({})
  }

  return (
    <Suspense fallback={null}>
      <main>
        <div className="flex items-center gap-3">
          {templateSlug === "space_explorer_1_page" && (
            <div className="text-sm text-gray-600">
              <Link href="/books" className="underline">
                Books
              </Link>
              <span> / </span>
              <Link
                href={`/books/stories/${encodeURIComponent(templateSlug)}`}
                className="underline"
              >
                {selectedTpl?.name || "Space Explorer Free Trial"}
              </Link>
              <span> / </span>
              <span>Create Book</span>
            </div>
          )}
        </div>
        <Box my={6} maxWidth={980}>
          <Stepper activeStep={step} alternativeLabel>
            <Step>
              <StepLabel>Hero & Photos</StepLabel>
            </Step>
            <Step>
              <StepLabel>Review</StepLabel>
            </Step>
          </Stepper>
          <Box mt={3} component="form" onSubmit={handleSubmit(onSubmit)}>
            {step === 0 && (
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="h6">Hero’s Info</Typography>
                  <TextField
                    label="Character Name"
                    fullWidth
                    {...register("name")}
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    sx={{ mt: 1 }}
                  />
                  <Typography sx={{ mt: 2, mb: 1 }}>
                    Character Pronouns
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    value={watch("gender")}
                    onChange={(_, v) =>
                      v && setValue("gender", v, { shouldValidate: true })
                    }
                    size="small"
                  >
                    <ToggleButton value="female">Girl</ToggleButton>
                    <ToggleButton value="male">Boy</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="h6" sx={{ mt: 3 }}>
                    Upload Photos (1–3)
                  </Typography>
                  {/* Drag & drop zone */}
                  <div
                    id="dropzone"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const incoming = Array.from(e.dataTransfer.files || []);
                      if (incoming.length === 0) return;
                      const { next, error } = validateAndMerge(incoming);
                      setFiles(next);
                      setUploadError(error || null);
                    }}
                    onClick={() => {
                      const input = document.getElementById(
                        "file-input"
                      ) as HTMLInputElement | null;
                      input?.click();
                    }}
                    className={`rounded-md border-2 border-dashed ${
                      dragOver
                        ? "border-blue-500 bg-blue-50/50"
                        : files.length === 0 && heroError
                        ? "border-red-500 dropzone-visible"
                        : "border-[hsl(var(--border))] dropzone-visible"
                    } p-4 mt-1 cursor-pointer min-h-[220px] grid content-center`}
                  >
                    <div className="text-center">
                      <div className="text-sm text-gray-600">
                        Drop images here or click to upload
                      </div>
                      <div className="text-xs text-gray-500">
                        JPEG or PNG, max 10MB each, up to 3 images
                      </div>
                    </div>
                    <input
                      id="file-input"
                      type="file"
                      accept="image/jpeg,image/png"
                      multiple
                      hidden
                      onChange={(e) => {
                        const selected = Array.from(e.target.files || []);
                        if (selected.length === 0) return;
                        const { next, error } = validateAndMerge(selected);
                        setFiles(next);
                        setUploadError(error || null);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                  {/* Keep notices and thumbnails below so the dropzone height stays consistent */}
                  {uploadError && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {uploadError}
                    </Alert>
                  )}
                  {files.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {files.map((f, i) => (
                        <div
                          key={i}
                          className="relative rounded overflow-hidden border border-[hsl(var(--border))] h-64"
                        >
                          <img
                            src={URL.createObjectURL(f)}
                            alt={`thumb ${i}`}
                            className="w-full h-64 object-cover"
                          />
                          <button
                            type="button"
                            className="btn"
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              padding: "2px 6px",
                            }}
                            onClick={() =>
                              setFiles((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Tip: Clear, front‑facing photos produce the best results.
                  </Alert>
                  {heroError && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {heroError}
                    </Alert>
                  )}
                  <Box mt={2} className="flex gap-2">
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        setHeroError(null);
                        const ok = await trigger([
                          "name",
                          "gender",
                          "template_slug",
                        ]);
                        if (!ok) {
                          setHeroError(
                            "Please fix the highlighted fields before continuing."
                          );
                          return;
                        }
                        if (files.length === 0) {
                          setHeroError(
                            "Please add 1–3 photos (drag & drop or click the box)."
                          );
                          document.getElementById("dropzone")?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                          return;
                        }
                        setHeroError(null);
                        setStep(1);
                      }}
                    >
                      Next
                    </button>
                  </Box>
                </Grid>
              </Grid>
            )}
            {step === 1 && (
              <>
                <Typography variant="h6">Review</Typography>
                {/* Selected images preview */}
                {files.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="relative rounded overflow-hidden border border-[hsl(var(--border))] h-64"
                      >
                        <img
                          src={URL.createObjectURL(f)}
                          alt={`review ${i}`}
                          className="w-full h-64 object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Details */}
                <Box sx={{ mt: 2 }} className="card">
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    "{watch("title")}"
                  </Typography>
                  <div className="text-sm text-gray-600">
                    Page Number: {pageCount}
                  </div>
                  <div className="text-sm text-gray-600">
                    Images: {files.length} reference image(s)
                  </div>
                  {watch("name")?.trim() ? (
                    <div className="text-sm text-gray-600">
                      Lead Character: {watch("name").trim()}, {genderLabel}
                    </div>
                  ) : null}
                </Box>

                {/* Plot / storyline */}
                {selectedTpl?.description && (
                  <Box sx={{ mt: 2, p: 2 }} className="card">
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, mb: 1 }}
                    >
                      Plot
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedTpl.description}
                    </Typography>
                  </Box>
                )}

                {/* Pricing summary */}
                <Box sx={{ mt: 2 }} className="card">
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, mb: 1 }}
                  >
                    Pricing & Payment
                  </Typography>
                  {pricingLoading ? (
                    <CircularProgress size={22} />
                  ) : pricingError ? (
                    <Alert severity="error">{pricingError}</Alert>
                  ) : quote ? (
                    <div className="grid grid-cols-2 gap-2 max-w-md text-sm">
                      <div className="text-gray-600">Available credits</div>
                      <div className="text-right">
                        {quote.credits_balance ?? 0}
                      </div>
                      <div className="text-gray-600">Base price</div>
                      <div className="text-right">
                        {formatCurrency(quote.base_price, quote.currency)}
                      </div>
                      {quote.discount_price &&
                      quote.discount_price < quote.base_price ? (
                        <>
                          <div className="text-gray-600">Discounted price</div>
                          <div className="text-right">
                            {formatCurrency(
                              quote.discount_price,
                              quote.currency
                            )}
                          </div>
                        </>
                      ) : null}
                      {quote.free_trial_slug ? (
                        <>
                          <div className="text-gray-600">Free trial</div>
                          <div className="text-right">
                            {quote.free_trial_consumed
                              ? "Not Available"
                              : "Available"}
                          </div>
                        </>
                      ) : null}
                      <div className="font-semibold">Total due</div>
                      <div className="font-semibold text-right">
                        {formatCurrency(quote.final_price, quote.currency)}
                      </div>
                    </div>
                  ) : (
                    <Alert severity="warning">Pricing unavailable</Alert>
                  )}
                </Box>

                {/* Payment method selection (like mobile Review step) */}
                {quote && (
                  <Box sx={{ mt: 2 }} className="card">
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, mb: 1 }}
                    >
                      Select a payment method
                    </Typography>
                    <RadioGroup
                      value={paymentMethod || ""}
                      onChange={(_, v) => setPaymentMethod((v as any) || null)}
                    >
                      {/* Free Trial (verify inline) */}
                      {quote.free_trial_slug && !quote.free_trial_consumed && (
                        <FormControlLabel
                          value="free_trial"
                          control={<Radio />}
                          label="Free Trial — requires card verification (next step)"
                        />
                      )}
                      {/* Credits */}
                      {quote.credits_required > 0 &&
                        (quote.credits_balance ?? 0) >=
                          (quote.credits_required ?? 0) && (
                          <FormControlLabel
                            value="credits"
                            control={<Radio />}
                            label={`Use Credits (${quote.credits_required})`}
                          />
                        )}
                      {/* Card */}
                      {Number(quote.final_price) > 0 &&
                        quote.card_available !== false && (
                          <FormControlLabel
                            value="card"
                            control={<Radio />}
                            label="Pay with Card"
                          />
                        )}
                    </RadioGroup>
                  </Box>
                )}

                <Box mt={2} className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
                  <button type="button" className="btn" onClick={async () => {
                    const tpl = templates.find((t) => t.slug === templateSlug)
                    const payload = {
                      title: watch('title'), template_slug: templateSlug, page_count: tpl?.page_count || 8,
                      template_params: { name: watch('name')?.trim() || undefined, gender: watch('gender') },
                      files: await Promise.all(files.map(async (f) => { const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(f) }); return { name: f.name, type: f.type, dataUrl } }))
                    }
                    try { sessionStorage.setItem('pendingCreate', JSON.stringify(payload)) } catch {}
                    const method = paymentMethod || 'card'
                    if (method === 'credits') {
                      try {
                        const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/credits')}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_slug: templateSlug }) })
                        if (!r.ok) throw new Error(await r.text())
                        const data = await r.json(); const pid = data?.payment_id
                        try { sessionStorage.setItem('pendingPaymentId', String(pid || '')) } catch {}
                        window.location.href = `/create/success?template_slug=${encodeURIComponent(templateSlug)}&credits=true&payment_id=${encodeURIComponent(String(pid||''))}`
                      } catch (e:any) { setError(e.message || 'Failed to use credits') }
                    } else if (method === 'free_trial') {
                      window.location.href = `/checkout/free-trial?template_slug=${encodeURIComponent(templateSlug)}`
                    } else {
                      window.location.href = `/checkout/card?template_slug=${encodeURIComponent(templateSlug)}`
                    }
                  }}>Next</button>
                </Box>
              </>
            )}
            {step === 2 && (
              <>
                <Typography variant="h6">Review</Typography>
                {pricingLoading ? (
                  <Box mt={2}>
                    <CircularProgress size={22} />
                  </Box>
                ) : pricingError ? (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {pricingError}
                  </Alert>
                ) : quote ? (
                  <Box mt={2}>
                    <div className="grid grid-cols-2 gap-2 max-w-md">
                      <div className="text-sm text-gray-600">
                        Credits balance
                      </div>
                      <div className="text-sm text-right">
                        {quote.credits_balance ?? 0}
                      </div>
                      <div className="text-sm text-gray-600">Base price</div>
                      <div className="text-sm text-right">
                        {quote.base_price?.toFixed?.(2) ?? quote.base_price}
                      </div>
                      {quote.discount_price &&
                      quote.discount_price < quote.base_price ? (
                        <>
                          <div className="text-sm text-gray-600">
                            Discounted price
                          </div>
                          <div className="text-sm text-right">
                            {Number(quote.discount_price).toFixed(2)}
                          </div>
                        </>
                      ) : null}
                      {quote.free_trial_slug ? (
                        <>
                          <div className="text-sm text-gray-600">
                            Free trial
                          </div>
                          <div className="text-sm text-right">
                            {quote.free_trial_consumed
                              ? "Not available"
                              : "Available"}
                          </div>
                        </>
                      ) : null}
                      <div className="font-semibold">Total due</div>
                      <div className="font-semibold text-right">
                        {Number(quote.final_price).toFixed(2)}
                      </div>
                    </div>
                    <Box mt={2} className="grid gap-2 max-w-sm">
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          // Stash payload in sessionStorage, then branch based on selection
                          const tpl = templates.find((t) => t.slug === templateSlug)
                          const payload = {
                            title: watch('title'),
                            template_slug: templateSlug,
                            page_count: tpl?.page_count || 8,
                            template_params: { name: watch('name')?.trim() || undefined, gender: watch('gender') },
                            files: await Promise.all(files.map(async (f) => {
                              const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(f) })
                              return { name: f.name, type: f.type, dataUrl }
                            })),
                          }
                          try { sessionStorage.setItem('pendingCreate', JSON.stringify(payload)) } catch {}
                          const method = paymentMethod || 'card'
                          if (method === 'credits') {
                            try {
                              const r = await fetch(`/api/forward?path=${encodeURIComponent('/billing/credits')}`,
                                { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_slug: templateSlug }) })
                              if (!r.ok) throw new Error(await r.text())
                              const data = await r.json();
                              const pid = data?.payment_id
                              try { sessionStorage.setItem('pendingPaymentId', String(pid || '')) } catch {}
                              window.location.href = `/create/success?template_slug=${encodeURIComponent(templateSlug)}&credits=true&payment_id=${encodeURIComponent(String(pid||''))}`
                            } catch (e:any) {
                              setError(e.message || 'Failed to use credits')
                            }
                          } else if (method === 'free_trial') {
                            window.location.href = `/checkout/free-trial?template_slug=${encodeURIComponent(templateSlug)}`
                          } else {
                            window.location.href = `/checkout/card?template_slug=${encodeURIComponent(templateSlug)}`
                          }
                        }}
                      >
                        Next
                      </button>
                    </Box>
                  </Box>
                ) : (
                  <Alert sx={{ mt: 2 }} severity="warning">
                    Pricing unavailable
                  </Alert>
                )}
                <Box mt={2} className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
                </Box>
              </>
            )}
            {message && (
              <Alert sx={{ mt: 2 }} severity="success">
                {message}
              </Alert>
            )}
            {error && (
              <Alert sx={{ mt: 2 }} severity="error">
                {error}
              </Alert>
            )}
          </Box>
        </Box>
      </main>
    </Suspense>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreatePageInner />
    </Suspense>
  );
}

// Removed legacy CardPayment/FreeTrialVerification to ensure a single Elements tree
