import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { config, setupState } = vi.hoisted(() => ({
 config: { cash: true, card: true, transfer: true },
 setupState: { loaded: true, error: false },
}));
vi.mock("@/hooks/useSetupStatus", () => ({ useSetupStatus: () => ({
 data: setupState.loaded ? { setup_completed: true, payment_methods: config } : undefined,
 isError: setupState.error, refetch: vi.fn(),
}) }));
vi.mock("@/components/cash/CashDrawerField", () => ({ CashDrawerField: () => <div>Caja de prueba</div> }));
vi.mock("@/components/sales/MemberAssociator", () => ({ MemberAssociator: () => <div>Socio</div> }));
import { CheckoutModal } from "../CheckoutModal";
const member = { member_id: "m1", full_name: "Ana", phone: "555" };
function setup(props: Partial<React.ComponentProps<typeof CheckoutModal>> = {}) {
 const confirm = vi.fn().mockResolvedValue(undefined);
 render(<CheckoutModal open onOpenChange={vi.fn()} total={20} itemCount={1} member={member} onMemberChange={vi.fn()} memberDebt={0} onSettle={vi.fn()} submitting={false} onConfirm={confirm} {...props} />);
 return confirm;
}
beforeEach(() => {
 config.cash = true; config.card = true; config.transfer = true;
 setupState.loaded = true; setupState.error = false;
});
describe("Cobro de productos", () => {
 it("permite cobrar en gimnasios existentes sin métodos configurados", async () => {
  config.cash = false; config.card = false; config.transfer = false;
  const confirm = setup({ member: null });
  for (const name of ["Efectivo", "Tarjeta", "Transferencia"]) {
   expect(screen.getByRole("button", { name })).toBeEnabled();
  }
  fireEvent.click(screen.getByRole("button", { name: "Cobrar $20.00" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ method: "cash", received: 20 }));
 });
 it("otro clic en Fiado vuelve al cobro normal sin exigir socio", async () => {
  const confirm = setup({ member: null });
  fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  expect(screen.getByRole("button", { name: "Guardar fiado" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  expect(screen.getByRole("button", { name: "Fiado" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Efectivo" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Cobrar $20.00" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ method: "cash", received: 20 }));
 });
 it("cambiar de Fiado a Tarjeta descarta el abono parcial", async () => {
  const confirm = setup();
  fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  fireEvent.change(screen.getByLabelText("Abono inicial (opcional)"), { target: { value: "10" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Tarjeta" })[0]);
  expect(screen.queryByLabelText("Abono inicial (opcional)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cobrar $20.00" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ method: "card" }));
 });
 it("no confunde un error al cargar métodos con una configuración vacía", () => {
  setupState.loaded = false; setupState.error = true;
  setup();
  expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Tarjeta" })).not.toBeInTheDocument();
 });
 it("conserva Fiado si la configuración termina de cargar después", () => {
  setupState.loaded = false;
  const props = { open: true, onOpenChange: vi.fn(), total: 20, itemCount: 1, member,
   onMemberChange: vi.fn(), memberDebt: 0, onSettle: vi.fn(), submitting: false, onConfirm: vi.fn() };
  const page = render(<CheckoutModal {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  setupState.loaded = true; config.cash = false; config.card = false;
  page.rerender(<CheckoutModal {...props} />);
  expect(screen.getByRole("button", { name: "Fiado" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Guardar fiado" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  expect(screen.getByRole("button", { name: "Transferencia" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeEnabled();
 });
 it("permite fiar todo sin pedir forma de pago ni caja", async () => {
  const confirm = setup(); fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  expect(screen.queryByLabelText("Efectivo recibido")).not.toBeInTheDocument();
  expect(screen.queryByText("Caja de prueba")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Guardar fiado" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ method: "cash", paid: 0 }));
 });
 it("exige socio para fiar, sin exigir abono", () => {
  setup({ member: null }); fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  expect(screen.getByRole("button", { name: "Guardar fiado" })).toBeDisabled();
 });
 it("no confirma efectivo insuficiente y permite pasarlo a saldo", async () => {
  const confirm = setup(); fireEvent.change(screen.getByLabelText("Efectivo recibido"), { target: { value: "10" } });
  expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Dejar saldo pendiente" }));
  expect(screen.getByText("Queda a deber: $10.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cobrar $10.00" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ method: "cash", paid: 10, received: 10 }));
 });
 it("conserva el efectivo recibido para mostrar el cambio después", async () => {
  const confirm = setup(); fireEvent.change(screen.getByLabelText("Efectivo recibido"), { target: { value: "100" } });
  expect(screen.getByText("Cambio: $80.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cobrar $20.00" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ method: "cash", received: 100 }));
 });
 it("rechaza abonos negativos o mayores al total", () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Fiado" }));
  for (const value of ["-1", "21"]) {
   fireEvent.change(screen.getByLabelText("Abono inicial (opcional)"), { target: { value } });
   expect(screen.getByRole("button", { name: /^Cobrar/ })).toBeDisabled();
  }
 });
 it("muestra sólo los métodos configurados y fiado", () => {
  config.cash = false; config.card = false; setup();
  expect(screen.queryByRole("button", { name: "Efectivo" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tarjeta" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Transferencia" })).toHaveAttribute("aria-pressed", "true");
 });
 it("explica una promoción que deja el total en cero antes de enviar", () => {
  const confirm = setup({ total: 0, member: null });
  expect(screen.queryByLabelText("Efectivo recibido")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cobrar" })).toBeDisabled();
  expect(screen.getByText(/Ajusta o quita la promoción/)).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
 });
 it("no cambia el cobro durante el envío ni confirma precios desactualizados", () => {
  setup({ submitting: true, blockedReason: "Los productos cambiaron." });
  expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Fiado" })).toBeDisabled();
 });
});
