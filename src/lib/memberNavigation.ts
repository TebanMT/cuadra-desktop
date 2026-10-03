export const memberFilters = ["", "active", "expiring_soon", "expired", "inactive", "balance", "unrenewed"] as const;
export type MemberView = (typeof memberFilters)[number];

export function memberView(params: URLSearchParams): MemberView {
  const status = params.get("status") ?? "";
  return memberFilters.includes(status as MemberView) ? status as MemberView : "";
}

// Bookmarks from the retired page keep working without another inbox.
export function legacyAttentionDestination(search: string, hash: string): string {
  const filter = new URLSearchParams(search).get("filter") || hash.slice(1);
  if (filter === "low_stock") return "/products?low_stock=1";
  if (filter === "balance" || filter === "pending_balance") return "/members?status=balance";
  if (filter === "expired" || filter === "expired_recoverable") return "/members?status=expired";
  if (filter === "expiring" || filter === "expiring_soon") return "/members?status=expiring_soon";
  return "/members";
}
