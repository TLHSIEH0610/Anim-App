from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from .models import StoryTemplate, User

CURRENCY = "aud"

def _to_decimal(value: Optional[Decimal], default: Decimal) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return default


@dataclass
class PriceQuote:
    base_price: Decimal
    final_price: Decimal
    currency: str
    promotion_type: Optional[str]
    promotion_label: Optional[str]
    free_trial_slug: Optional[str]
    free_trial_consumed: bool
    credits_required: Decimal

    @property
    def discount_price(self) -> Optional[Decimal]:
        if self.promotion_type == "discount":
            return self.final_price
        return None


def resolve_story_price(user: User, template: StoryTemplate) -> PriceQuote:
    base_price = _to_decimal(template.price_dollars, Decimal("1.50"))
    discount_price = template.discount_price
    free_slug = template.free_trial_slug or None
    consumed = False
    promotion_type: Optional[str] = None
    promotion_label: Optional[str] = None
    final_price = base_price

    if free_slug:
        consumed = free_slug in (user.free_trials_used or [])
        if not consumed:
            promotion_type = "free_trial"
            promotion_label = "Free"
            final_price = Decimal("0.00")
    if final_price > Decimal("0") and discount_price is not None:
        discount_decimal = _to_decimal(discount_price, base_price)
        if discount_decimal > Decimal("0") and discount_decimal < base_price:
            promotion_type = "discount"
            promotion_label = "Sale"
            final_price = discount_decimal

    credits_required = final_price.quantize(Decimal("0.01")) if final_price > Decimal("0") else Decimal("0.00")

    return PriceQuote(
        base_price=base_price,
        final_price=final_price,
        currency=CURRENCY,
        promotion_type=promotion_type,
        promotion_label=promotion_label,
        free_trial_slug=free_slug,
        free_trial_consumed=consumed,
        credits_required=credits_required,
    )
