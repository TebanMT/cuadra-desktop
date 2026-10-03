import { describe, expect, it } from "vitest";
import {
  cashClosePreview,
  cashDifference,
  cashWithdrawal,
  expectedCash,
} from "../cashSessionMath";

describe("matemática de sesiones de caja", () => {
  it("incluye el fondo inicial sin reportarlo como sobrante", () => {
    const expected = expectedCash({
      openingCash: 200,
      cashReceipts: 500,
      cashIn: 0,
      cashRefunds: 0,
      cashOut: 0,
    });
    expect(expected).toBe(700);
    expect(cashDifference(700, expected)).toBe(0);
  });

  it("resta devoluciones físicas y salidas exactamente una vez", () => {
    expect(
      expectedCash({
        openingCash: 100,
        cashReceipts: 415,
        cashIn: 50,
        cashRefunds: 20,
        cashOut: 150,
      }),
    ).toBe(395);
  });

  it("separa conteo, efectivo dejado y retiro", () => {
    expect(cashWithdrawal(700, 200)).toBe(500);
  });

  it("opera en centavos", () => {
    expect(
      expectedCash({
        openingCash: 0.1,
        cashReceipts: 0.2,
        cashIn: 0,
        cashRefunds: 0,
        cashOut: 0,
      }),
    ).toBe(0.3);
  });

  it("abre una segunda sesión sin reescribir el corte ya retirado", () => {
    const preview = cashClosePreview({
      activeSession: {
        status: "withdrawn",
        opening_cash: 200,
        expected_cash: 700,
        cash_left: 100,
      },
      sessionCount: 1,
      requiresNewSession: true,
      uncoveredActivity: 50,
      wholeDayActivity: 550,
    });

    expect(preview).toEqual({
      startingNewSession: true,
      openingCash: 100,
      activityCash: 50,
      expectedCash: 150,
      canCompareWholeDay: false,
    });
  });

  it("en la segunda sesión ignora los totales acumulados del día", () => {
    const preview = cashClosePreview({
      activeSession: {
        status: "reconciled",
        opening_cash: 100,
        expected_cash: 140,
        cash_left: null,
      },
      sessionCount: 2,
      requiresNewSession: false,
      uncoveredActivity: 0,
      wholeDayActivity: 540,
    });

    expect(preview.expectedCash).toBe(140);
    expect(preview.activityCash).toBe(40);
    expect(preview.canCompareWholeDay).toBe(false);
  });
});
