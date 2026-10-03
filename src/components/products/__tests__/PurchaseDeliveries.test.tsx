import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseDeliveries } from "../PurchaseDeliveries";
import { api } from "@/lib/api";
vi.mock("@/lib/api",()=>({api:{get:vi.fn(),post:vi.fn()}}));
vi.mock("sonner",()=>({toast:{success:vi.fn()}}));
function setup(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><PurchaseDeliveries/></QueryClientProvider>);}
describe("Mercancía por recibir",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.get).mockResolvedValue({items:[{id:"order-1",product_id:"p",product_name:"Agua",quantity:10,created_at:"2026-09-01T12:00:00Z"}],total:1,page_size:50});});
 it("requiere confirmar la llegada y sólo envía la recepción",async()=>{vi.mocked(api.post).mockResolvedValue({});setup();fireEvent.click(await screen.findByRole("button",{name:"Recibir productos"}));expect(api.post).not.toHaveBeenCalled();expect(screen.getByText(/Se agregarán a las existencias/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Recibí las 10 unidades"}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/api/v1/inventory-purchases/order-1/receive",{quantity:10}));expect(api.post).toHaveBeenCalledTimes(1);});
 it("permite reintentar la misma recepción sin capturar otra compra",async()=>{vi.mocked(api.post).mockRejectedValueOnce(new Error("No se pudo guardar")).mockResolvedValueOnce({});setup();fireEvent.click(await screen.findByRole("button",{name:"Recibir productos"}));fireEvent.click(screen.getByRole("button",{name:"Recibí las 10 unidades"}));await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Recibí las 10 unidades"}));await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));expect(vi.mocked(api.post).mock.calls[0]).toEqual(vi.mocked(api.post).mock.calls[1]);});
});
