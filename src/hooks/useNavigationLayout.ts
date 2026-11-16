import { useSyncExternalStore } from "react";
import { useUIStore } from "@/stores/useUIStore";

const compactQuery = "(max-width: 1023px)";
function subscribe(onChange: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const snapshot = () => window.matchMedia(compactQuery).matches;

/** Zoom can reduce the CSS viewport; preserve the user's full-size preference. */
export function useNavigationLayout() {
  const compact = useSyncExternalStore(subscribe, snapshot, () => false);
  const preferredCollapsed = useUIStore((state) => state.sidebarCollapsed);
  return { compact, collapsed: compact || preferredCollapsed };
}
