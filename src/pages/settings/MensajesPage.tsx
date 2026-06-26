import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { settings as t } from "@/strings/settings";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import WhatsAppSetupPage from "./WhatsAppSetupPage";
import TemplatesPage from "./TemplatesPage";
import BroadcastPage from "../messaging/BroadcastPage";

// MensajesPage consolida tres surfaces de "comunicación con el socio":
//   - WhatsApp del gym  (UC-037 — conectar número propio del gym)  [Plus]
//   - Plantillas        (recordatorios/comprobantes: on/off en Standard,
//                         editar el TEXTO es Plus)
//   - Envío al socio    (broadcast a grupos: Standard acotado, topes ↑ en Plus)
//
// Por qué la pestaña de Plantillas entra en Standard: los recordatorios +
// comprobantes se envían en Standard via el sender maestro de Tinta, así que
// el dueño debe poder ACTIVARLOS / DESACTIVARLOS.
//
// PERO el TEXTO no se edita en Standard: lo que sale por WhatsApp es la
// plantilla que Meta aprobó (Twilio Content SID), no el body local — editarlo
// no cambiaría el mensaje, sólo confundiría. Por eso el texto es read-only en
// Standard y personalizarlo se desbloquea en Plus (número propio). Gate en
// UpdateTemplate/UpdateOwnerAlert (BE) + readOnly en TemplatesPage/AlertsPage
// (FE). Esto reemplaza el criterio viejo de ADR-009 §2.1, que asumía —cuando
// no existían los Content SIDs— que el copy editado sí se enviaba.
//
// Mientras Plus no se vende ocultamos los tabs Plus enteros en lugar de
// mostrarlos con badge "Próximamente". Cuando Plus se libere, revertir
// a render con badge (ver `CUANDO PLUS SE LIBERE` en
// src/hooks/useSubscription.ts).
//
// El tab activo se preserva en `?tab=`. Las rutas viejas
// (/settings/whatsapp, etc.) siguen vivas y renderean la página
// standalone con su propio gate — preserva deep-links existentes sin
// necesidad de redirects que generarían loops cuando el parent embebe
// los mismos componentes.
type TabKey = "whatsapp" | "templates" | "broadcast";

// Sólo "whatsapp" (conectar número propio) es Plus. "broadcast" ahora entra en
// Standard pero acotado (2 envíos/mes, 100 socios) — los topes los enforce el
// backend por plan; ver BroadcastPage / broadcast.go.
const PLUS_TABS = new Set<TabKey>(["whatsapp"]);

function parseTab(raw: string | null, available: TabKey[]): TabKey {
  const requested = raw as TabKey;
  if (available.includes(requested)) return requested;
  // Fallback: si el deep-link pide un tab no disponible (ej. Standard
  // entrando a ?tab=broadcast), aterrizamos en el primer tab visible.
  return available[0];
}

export default function MensajesPage() {
  const [params, setParams] = useSearchParams();
  const plan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);

  const availableTabs: TabKey[] = (
    ["whatsapp", "templates", "broadcast"] as TabKey[]
  ).filter((k) => isPlus || !PLUS_TABS.has(k));
  const tab = parseTab(params.get("tab"), availableTabs);

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.mensajes.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isPlus ? t.mensajes.subtitle : t.mensajes.subtitleStandard}
        </p>
      </div>

      {/* Si hay un único tab visible (caso Standard hoy: sólo Plantillas)
          renderizamos el contenido directo sin el chrome de Tabs — un
          TabsList con un solo trigger es ruido visual sin función. */}
      {availableTabs.length === 1 ? (
        <div className="pt-2">
          {availableTabs[0] === "templates" && <TemplatesPage />}
          {availableTabs[0] === "whatsapp" && <WhatsAppSetupPage />}
          {availableTabs[0] === "broadcast" && <BroadcastPage />}
        </div>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("tab", v);
            setParams(next, { replace: true });
          }}
        >
          <TabsList>
            {availableTabs.includes("whatsapp") && (
              <TabsTrigger value="whatsapp">{t.mensajes.tabs.whatsapp}</TabsTrigger>
            )}
            {availableTabs.includes("templates") && (
              <TabsTrigger value="templates">{t.mensajes.tabs.templates}</TabsTrigger>
            )}
            {availableTabs.includes("broadcast") && (
              <TabsTrigger value="broadcast">{t.mensajes.tabs.broadcast}</TabsTrigger>
            )}
          </TabsList>

          {/* Las páginas hijas conservan su layout interno (header propio,
              paddings) — no las re-envolvemos en <Card>. Esto preserva los
              tests existentes y evita doble-render del título. */}
          {availableTabs.includes("whatsapp") && (
            <TabsContent value="whatsapp" className="pt-2">
              <WhatsAppSetupPage />
            </TabsContent>
          )}
          {availableTabs.includes("templates") && (
            <TabsContent value="templates" className="pt-2">
              <TemplatesPage />
            </TabsContent>
          )}
          {availableTabs.includes("broadcast") && (
            <TabsContent value="broadcast" className="pt-2">
              <BroadcastPage />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

