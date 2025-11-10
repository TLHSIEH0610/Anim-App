import React, { ReactNode } from "react";

type PaymentSheetError = {
  code: string;
  message?: string;
};

type PaymentSheetResult = {
  error?: PaymentSheetError;
  paymentIntent?: any;
};

type StripeHook = {
  initPaymentSheet: (...args: any[]) => Promise<PaymentSheetResult>;
  presentPaymentSheet: (...args: any[]) => Promise<PaymentSheetResult>;
  confirmPayment: (...args: any[]) => Promise<PaymentSheetResult>;
  // Optional platform pay helpers (Google Pay / Apple Pay)
  isPlatformPaySupported?: (options?: any) => Promise<boolean>;
  confirmPlatformPayPayment?: (
    clientSecret: string,
    params: any
  ) => Promise<{ error?: PaymentSheetError } | undefined>;
  initGooglePay?: (options?: any) => Promise<{ error?: PaymentSheetError } | undefined>;
  presentGooglePay?: (options?: any) => Promise<{ error?: PaymentSheetError } | undefined>;
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

type CardFieldComponentType = React.ComponentType<any>;

const CardFieldFallback: CardFieldComponentType = () => null;

export const CardField: CardFieldComponentType =
  stripeAvailable && stripeModule?.CardField ? stripeModule.CardField : CardFieldFallback;

export const PlatformPay: any = stripeAvailable && (stripeModule as any)?.PlatformPay
  ? (stripeModule as any).PlatformPay
  : null;
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
  async confirmPayment(..._args: any[]): Promise<PaymentSheetResult> {
    return {
      error: {
        code: "STRIPE_UNAVAILABLE",
        message: "Stripe native module is unavailable in this build.",
      },
    };
  },
  async isPlatformPaySupported(..._args: any[]): Promise<boolean> {
    return false;
  },
  async confirmPlatformPayPayment(..._args: any[]): Promise<{ error: PaymentSheetError }> {
    return {
      error: {
        code: "STRIPE_UNAVAILABLE",
        message: "Platform Pay is unavailable in this build.",
      },
    } as any;
  },
};

export const useStripe = (): StripeHook => {
  if (stripeAvailable) {
    try {
      return stripeModule.useStripe();
    } catch (error) {
      console.warn(
        "Stripe native module loaded but StripeProvider is missing. Falling back to no-op stripe implementation.",
        error
      );
      return fallbackStripe;
    }
  }
  return fallbackStripe;
};

