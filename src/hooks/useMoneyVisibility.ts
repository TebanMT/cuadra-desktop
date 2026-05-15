import { useCallback } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fmtMoney } from "@/hooks/useBilling";

export const MASKED_MONEY = "$•••";

// El estado del "ojo" tiene que ser compartido entre TopBar (donde está
// el toggle) y todas las pantallas que muestran montos (Dashboard,
// CobrosPage, ReportsPage, etc.). Antes usábamos useState local en cada
// instancia del hook — cada componente tenía su PROPIA copia del flag,
// así que togglear en el TopBar no propagaba a las otras pantallas.
// Zustand con persist nos da estado global sincronizado + persistencia
// en localStorage en un solo paso.
type MoneyState = {
  hidden: boolean;
  toggle: () => void;
  setHidden: (v: boolean) => void;
};

const useMoneyStore = create<MoneyState>()(
  persist(
    (set) => ({
      hidden: false,
      toggle: () => set((s) => ({ hidden: !s.hidden })),
      setHidden: (v) => set({ hidden: v }),
    }),
    {
      name: "tinta:dashboard.hide_amounts",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// useMoneyVisibility — hook wrapper que mantiene la API anterior
// (hidden, toggle, mask, fmt) leyendo del store compartido. Todos los
// componentes que lo invoquen se re-renderean cuando cambia hidden.
export function useMoneyVisibility() {
  const hidden = useMoneyStore((s) => s.hidden);
  const toggle = useMoneyStore((s) => s.toggle);

  const mask = useCallback(
    (formatted: string, masked = MASKED_MONEY): string => (hidden ? masked : formatted),
    [hidden]
  );
  // fmt acepta null/undefined igual que fmtMoney (los normaliza a 0)
  // para que call sites con backend que omite el campo no muestren $NaN.
  const fmt = useCallback(
    (value: number | null | undefined): string =>
      hidden ? MASKED_MONEY : fmtMoney(value),
    [hidden]
  );

  return { hidden, toggle, mask, fmt };
}
