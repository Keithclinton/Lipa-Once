// Minimal types for the parts of the PayPal JS SDK v6 we use.
// https://developer.paypal.com/docsai/reference/sdk/js/v6/reference

declare namespace PayPalV6 {
  type ApproveData = { orderId: string; payerId?: string };

  interface OneTimePaymentSession {
    start(
      options: { presentationMode?: "auto" | "popup" | "modal" | "redirect" | "payment-handler" },
      orderPromise: Promise<{ orderId: string }>,
    ): Promise<void>;
  }

  interface EligibleMethods {
    isEligible(method: "paypal" | "paylater" | "credit"): boolean;
  }

  interface SdkInstance {
    findEligibleMethods(options: { currencyCode: string }): Promise<EligibleMethods>;
    createPayPalOneTimePaymentSession(options: {
      onApprove: (data: ApproveData) => Promise<void> | void;
      onCancel?: (data: unknown) => void;
      onError?: (error: unknown) => void;
    }): OneTimePaymentSession;
  }

  interface Namespace {
    createInstance(options: {
      clientId: string;
      components: string[];
      pageType?: string;
      locale?: string;
    }): Promise<SdkInstance>;
  }
}

interface Window {
  paypal?: PayPalV6.Namespace;
}

declare namespace React.JSX {
  interface IntrinsicElements {
    "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      type?: "pay" | "checkout" | "buynow" | "subscribe";
      class?: string;
    };
  }
}
