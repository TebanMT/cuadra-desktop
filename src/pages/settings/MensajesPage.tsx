import { PageContainer } from "@/components/shared/PagePrimitives";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { HeldMessages } from "@/components/settings/HeldMessages";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WhatsAppSetupPage from "./WhatsAppSetupPage";
import TemplatesPage from "./TemplatesPage";
import BroadcastPage from "../messaging/BroadcastPage";

export default function MensajesPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = ["whatsapp", "templates", "broadcast"].includes(requested ?? "") ? requested! : "templates";
  return <PageContainer className="space-y-6">
    <header className="space-y-2"><SettingsBackLink /><h1 className="font-display text-3xl">Mensajes</h1>
      <p className="max-w-prose text-sm text-muted-foreground">Revisa los mensajes automáticos o prepara un envío. Los envíos actuales salen desde Tinta y requieren internet; las cuentas con un número propio ya conectado conservan su canal.</p>
    </header>
    <Tabs value={tab} onValueChange={value => { const next = new URLSearchParams(params); next.set("tab", value); setParams(next, { replace: true }); }}>
      <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="templates">Mensajes automáticos</TabsTrigger><TabsTrigger value="broadcast">Envío al socio</TabsTrigger><TabsTrigger value="whatsapp">Canal de envío</TabsTrigger></TabsList>
      <TabsContent value="templates" className="pt-4"><TemplatesPage embedded /></TabsContent>
      <TabsContent value="broadcast" className="pt-4"><BroadcastPage embedded /></TabsContent>
      <TabsContent value="whatsapp" className="pt-4"><WhatsAppSetupPage embedded /></TabsContent>
    </Tabs>
    <HeldMessages />
  </PageContainer>;
}
