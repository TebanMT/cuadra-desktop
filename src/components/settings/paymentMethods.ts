import type { SetupStatus } from "@/hooks/useSetupStatus";
import { PAYMENT_METHOD_KEYS, type PaymentMethodKey } from "@/hooks/useGym";
import { settings } from "@/strings/settings";

const t = settings.gymProfile.paymentMethods;

export type PaymentMethodSelection = Record<PaymentMethodKey, boolean>;

// A gym that finished setup without saved methods gets every method at
// checkout (CheckoutModal). Show that same state so saving never removes a
// method the reception is using today.
export function savedPaymentSelection(
  saved: SetupStatus["payment_methods"] | undefined,
): PaymentMethodSelection {
  const selection = {
    cash: !!saved?.cash,
    transfer: !!saved?.transfer,
    card: !!saved?.card,
  };
  return PAYMENT_METHOD_KEYS.some((key) => selection[key])
    ? selection
    : { cash: true, transfer: true, card: true };
}

export function chosenPaymentMethods(selection: PaymentMethodSelection): PaymentMethodKey[] {
  return PAYMENT_METHOD_KEYS.filter((key) => selection[key]);
}

export function paymentMethodsText(selection: PaymentMethodSelection): string {
  return chosenPaymentMethods(selection).map((key) => t.options[key]).join(", ");
}
