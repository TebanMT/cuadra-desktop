import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { settings as t } from "@/strings/settings";
import WhatsAppSetupPage from "./WhatsAppSetupPage";
import TemplatesPage from "./TemplatesPage";
import BroadcastPage from "../messaging/BroadcastPage";

// MensajesPage consolida tres páginas que antes vivían sueltas en Ajustes:
//   - WhatsApp del gym  (configuración de canal)
//   - Plantillas        (textos automáticos)
//   - Envío al socio    (broadcast manual)
//
// Decisión (item 10, opción A): un solo entry de sidebar reduce ruido y
// agrupa "comunicación con el socio" en un mismo lugar. El tab activo se
// preserva en `?tab=`. Las rutas viejas (/settings/whatsapp, etc.) siguen
// vivas y renderean la página standalone — preserva deep-links existentes
// sin necesidad de redirects que generarían loops cuando el parent embebe
// los mismos componentes.
type TabKey = "whatsapp" | "templates" | "broadcast";

const VALID_TABS: TabKey[] = ["whatsapp", "templates", "broadcast"];

function parseTab(raw: string | null): TabKey {
  return VALID_TABS.includes(raw as TabKey) ? (raw as TabKey) : "whatsapp";
}

export default function MensajesPage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.mensajes.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.mensajes.subtitle}</p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="whatsapp">{t.mensajes.tabs.whatsapp}</TabsTrigger>
          <TabsTrigger value="templates">{t.mensajes.tabs.templates}</TabsTrigger>
          <TabsTrigger value="broadcast">{t.mensajes.tabs.broadcast}</TabsTrigger>
        </TabsList>

        {/* Las páginas hijas conservan su layout interno (header propio,
            paddings) — no las re-envolvemos en <Card>. Esto preserva los
            tests existentes y evita doble-render del título. */}
        <TabsContent value="whatsapp" className="pt-2">
          <WhatsAppSetupPage />
        </TabsContent>
        <TabsContent value="templates" className="pt-2">
          <TemplatesPage />
        </TabsContent>
        <TabsContent value="broadcast" className="pt-2">
          <BroadcastPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

