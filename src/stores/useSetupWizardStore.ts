import { create } from "zustand";

export type Step = 1 | 2 | 3 | 4 | 5;

export type DurationUnit = "days" | "weeks" | "months" | "years";

export interface DraftMembershipType {
  name: string;
  price: number;
  // duration_days SIEMPRE acompaña (aproximado legacy, el BE lo exige
  // >= 1). duration_months no-null = período de calendario (mensual=1,
  // anual=12); null = días literales. La unidad es intención explícita
  // del operador — nunca se infiere del número de días.
  duration_days: number;
  duration_months: number | null;
  enrollment_fee: number;
  maintenance_fee: number;
  maintenance_frequency: number | null;
}

export interface WizardState {
  step: Step;
  gymName: string;
  city: string;
  whatsapp: string;
  membershipTypes: DraftMembershipType[];
  paymentMethods: { cash: boolean; transfer: boolean; card: boolean };
  setStep(step: Step): void;
  setGymInfo(input: { gymName: string; city: string; whatsapp: string }): void;
  addMembershipType(mt: DraftMembershipType): void;
  setPaymentMethods(input: WizardState["paymentMethods"]): void;
  reset(): void;
  hydrate(input: Partial<WizardState>): void;
}

const initial = {
  step: 1 as Step,
  gymName: "",
  city: "",
  whatsapp: "+52 ",
  membershipTypes: [] as DraftMembershipType[],
  paymentMethods: { cash: true, transfer: false, card: false },
};

export const useSetupWizardStore = create<WizardState>((set) => ({
  ...initial,
  setStep: (step) => set({ step }),
  setGymInfo: ({ gymName, city, whatsapp }) => set({ gymName, city, whatsapp }),
  addMembershipType: (mt) =>
    set((s) => ({ membershipTypes: [...s.membershipTypes, mt] })),
  setPaymentMethods: (paymentMethods) => set({ paymentMethods }),
  reset: () => set(initial),
  hydrate: (input) => set((s) => ({ ...s, ...input })),
}));
