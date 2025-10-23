import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_CEILING
from typing import Any, Dict, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Payment, StoryTemplate, User
from ..pricing import PriceQuote, resolve_story_price

router = APIRouter(prefix="/billing", tags=["billing"])


class BillingConfig:
    @staticmethod
    def stripe_secret(*, required: bool = True) -> Optional[str]:
        secret = os.getenv("STRIPE_SECRET_KEY")
        if not secret and required:
            raise HTTPException(status_code=500, detail="Stripe secret key not configured")
        return secret or None

    @staticmethod
    def stripe_publishable() -> Optional[str]:
        value = os.getenv("STRIPE_PUBLISHABLE_KEY")
        return value or None

    @staticmethod
    def stripe_enabled() -> bool:
        return bool(os.getenv("STRIPE_SECRET_KEY") and os.getenv("STRIPE_PUBLISHABLE_KEY"))


def _decimal_to_float(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _serialize_quote(user: User, quote: PriceQuote) -> Dict[str, Any]:
    return {
        "currency": quote.currency,
        "base_price": _decimal_to_float(quote.base_price),
        "final_price": _decimal_to_float(quote.final_price),
        "promotion_type": quote.promotion_type,
        "promotion_label": quote.promotion_label,
        "free_trial_slug": quote.free_trial_slug,
        "free_trial_consumed": quote.free_trial_consumed,
        "discount_price": _decimal_to_float(quote.final_price) if quote.promotion_type == "discount" else None,
        "credits_required": float(quote.credits_required),
        "credits_balance": float(user.credits or 0),
        "card_available": BillingConfig.stripe_enabled(),
    }


def _load_template(db: Session, slug: str) -> StoryTemplate:
    template = (
        db.query(StoryTemplate)
        .filter(StoryTemplate.slug == slug, StoryTemplate.is_active.is_(True))
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Story template not found")
    return template


def _create_payment(
    db: Session,
    user: User,
    story_template: StoryTemplate,
    quote: PriceQuote,
    method: str,
    status: str,
    amount_override: Optional[Decimal] = None,
    stripe_payment_intent_id: Optional[str] = None,
    credits_used: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
) -> Payment:
    payment = Payment(
        user_id=user.id,
        story_template_slug=story_template.slug,
        amount_dollars=amount_override if amount_override is not None else quote.final_price,
        currency=quote.currency,
        method=method,
        stripe_payment_intent_id=stripe_payment_intent_id,
        status=status,
        metadata_json=metadata or {},
        credits_used=credits_used,
    )
    db.add(payment)
    db.flush()
    return payment


@router.get("/quote")
def get_quote(
    template_slug: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    template = _load_template(db, template_slug)
    quote = resolve_story_price(user, template)
    return _serialize_quote(user, quote)


@router.post("/credits")
def pay_with_credits(
    payload: Dict[str, Any],
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    template_slug = payload.get("template_slug")
    if not template_slug:
        raise HTTPException(status_code=400, detail="template_slug is required")

    template = _load_template(db, template_slug)
    quote = resolve_story_price(user, template)

    if quote.final_price <= Decimal("0"):
        raise HTTPException(status_code=400, detail="No payment required for this selection")

    if quote.credits_required <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Credits not applicable")

    required = quote.credits_required
    user_credits = Decimal(user.credits or 0)
    if user_credits < required:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    try:
        user.credits = user_credits - required
        payment = _create_payment(
            db=db,
            user=user,
            story_template=template,
            quote=quote,
            method="credit",
            status="completed",
            credits_used=required,
            metadata={"promotion_type": quote.promotion_type},
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process credit payment: {exc}")

    return {
        "payment_id": payment.id,
        "credits_balance": float(user.credits or 0),
        "quote": _serialize_quote(user, quote),
    }


@router.post("/stripe-intent")
def create_stripe_intent(
    payload: Dict[str, Any],
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    template_slug = payload.get("template_slug")
    if not template_slug:
        raise HTTPException(status_code=400, detail="template_slug is required")

    template = _load_template(db, template_slug)
    quote = resolve_story_price(user, template)

    if quote.final_price <= Decimal("0"):
        raise HTTPException(status_code=400, detail="No payment required for this selection")

    stripe.api_key = BillingConfig.stripe_secret()

    amount_cents = int((quote.final_price * Decimal(100)).to_integral_value(rounding=ROUND_CEILING))
    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=quote.currency,
            automatic_payment_methods={"enabled": True},
            metadata={
                "user_id": str(user.id),
                "template_slug": template.slug,
            },
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc.user_message or str(exc)}")

    try:
        payment = _create_payment(
            db=db,
            user=user,
            story_template=template,
            quote=quote,
            method="card",
            status="requires_confirmation",
            stripe_payment_intent_id=intent.id,
            metadata={"promotion_type": quote.promotion_type},
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {exc}")

    response = {
        "payment_id": payment.id,
        "client_secret": intent.client_secret,
        "publishable_key": BillingConfig.stripe_publishable(),
        "quote": _serialize_quote(user, quote),
    }
    return response


@router.post("/stripe-confirm")
def confirm_stripe_payment(
    payload: Dict[str, Any],
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    payment_id = payload.get("payment_id")
    if not payment_id:
        raise HTTPException(status_code=400, detail="payment_id is required")

    payment: Payment = (
        db.query(Payment)
        .filter(Payment.id == payment_id, Payment.user_id == user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.status == "completed":
        return {"payment_id": payment.id, "status": payment.status}

    stripe.api_key = BillingConfig.stripe_secret()
    try:
        intent = stripe.PaymentIntent.retrieve(payment.stripe_payment_intent_id)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc.user_message or str(exc)}")

    if intent.status not in {"succeeded", "requires_capture"}:
        raise HTTPException(status_code=400, detail=f"Payment not completed (status {intent.status})")

    amount_received = Decimal(intent.get("amount_received", intent.amount)) / Decimal(100)

    try:
        payment.status = "completed"
        payment.amount_dollars = amount_received
        metadata = payment.metadata_json or {}
        metadata.update({
            "stripe_status": intent.status,
            "stripe_id": intent.id,
        })
        payment.metadata_json = metadata
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to confirm payment: {exc}")

    return {"payment_id": payment.id, "status": payment.status, "amount": _decimal_to_float(payment.amount_dollars)}


@router.get("/history")
def list_history(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
        .limit(50)
        .all()
    )

    items = []
    for entry in payments:
        items.append(
            {
                "id": entry.id,
                "template_slug": entry.story_template_slug,
                "method": entry.method,
                "amount": _decimal_to_float(Decimal(entry.amount_dollars or 0)),
                "currency": entry.currency,
                "status": entry.status,
                "credits_used": entry.credits_used,
                "stripe_payment_intent_id": entry.stripe_payment_intent_id,
                "metadata": entry.metadata_json or {},
                "created_at": entry.created_at,
            }
        )

    return {"items": items}
