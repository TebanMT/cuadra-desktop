const cents = (value: number) => Math.round(value * 100);
const amount = (value: number) => value / 100;

export interface ExpectedCashInput {
  openingCash: number;
  cashReceipts: number;
  cashIn: number;
  cashRefunds: number;
  cashOut: number;
}

export function expectedCash(input: ExpectedCashInput): number {
  return amount(
    cents(input.openingCash) +
      cents(input.cashReceipts) +
      cents(input.cashIn) -
      cents(input.cashRefunds) -
      cents(input.cashOut),
  );
}

export function cashDifference(countedCash: number, expected: number): number {
  return amount(cents(countedCash) - cents(expected));
}

export function cashWithdrawal(countedCash: number, cashLeft: number): number {
  return amount(cents(countedCash) - cents(cashLeft));
}

export interface CashClosePreviewInput {
  activeSession?: {
    status: string;
    finished_at?: string | null;
    opening_cash: number;
    expected_cash: number;
    cash_left: number | null;
  } | null;
  sessionCount: number;
  requiresNewSession: boolean;
  uncoveredActivity: number;
  wholeDayActivity: number;
}

export interface CashClosePreview {
  startingNewSession: boolean;
  openingCash: number;
  activityCash: number;
  expectedCash: number;
  canCompareWholeDay: boolean;
}

// Resuelve qué ventana física se está conciliando. Después de un retiro el
// snapshot anterior queda congelado: el siguiente corte hereda sólo cash_left
// y agrega exclusivamente la actividad posterior al retiro.
export function cashClosePreview(input: CashClosePreviewInput): CashClosePreview {
  const startingNewSession =
    input.requiresNewSession && (input.activeSession?.status === "withdrawn" || !!input.activeSession?.finished_at);
  const openingCash = startingNewSession
    ? (input.activeSession?.cash_left ?? 0)
    : (input.activeSession?.opening_cash ?? 0);
  const activityCash = startingNewSession
    ? input.uncoveredActivity
    : input.activeSession
      ? amount(cents(input.activeSession.expected_cash) - cents(input.activeSession.opening_cash))
      : input.wholeDayActivity;
  return {
    startingNewSession,
    openingCash: amount(cents(openingCash)),
    activityCash,
    expectedCash: amount(cents(openingCash) + cents(activityCash)),
    canCompareWholeDay: input.sessionCount <= 1 && !startingNewSession,
  };
}
