import React, { ReactNode } from "react";

type PaymentSheetError = {
  code: string;
  message?: string;
};

type PaymentSheetResult = {
  error?: PaymentSheetError;
};

type StripeHook = {
  initPaymentSheet: (...args: any[]) => Promise<PaymentSheetResult>;
  presentPaymentSheet: (...args: any[]) => Promise<PaymentSheetResult>;
};

let stripeModule: any = null;
let stripeAvailable = false;

try {
  stripeModule = require("@stripe/stripe-react-native");
  stripeAvailable = Boolean(stripeModule?.useStripe && stripeModule?.StripeProvider);
} catch (_error) {
  stripeModule = null;
  stripeAvailable = false;
}

export const isStripeAvailable = stripeAvailable;

type FallbackProps = {
  children?: ReactNode;
};

const FallbackProvider = ({ children }: FallbackProps) => <>{children}</>;

export const StripeProvider: React.ComponentType<any> = stripeAvailable
  ? stripeModule.StripeProvider
  : FallbackProvider;

const fallbackStripe: StripeHook = {
  async initPaymentSheet(..._args: any[]): Promise<PaymentSheetResult> {
    return {
      error: {
        code: "STRIPE_UNAVAILABLE",
        message: "Stripe native module is unavailable in this build.",
      },
    };
  },
  async presentPaymentSheet(..._args: any[]): Promise<PaymentSheetResult> {
    return {
      error: {
        code: "STRIPE_UNAVAILABLE",
        message: "Stripe native module is unavailable in this build.",
      },
    };
  },
};

export const useStripe = (): StripeHook => {
  if (stripeAvailable) {
    return stripeModule.useStripe();
  }
  return fallbackStripe;
};
