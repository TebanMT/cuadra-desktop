import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MemberPhoto } from "@/components/members/MemberPhoto";
import { useMember } from "@/hooks/useMembers";
import { getAvatarPalette, getInitials } from "@/lib/avatar";

interface Props {
  memberId: string;
  size?: "sm" | "md";
}

// Resuelve el nombre del socio a partir del UUID. Tiene su propio useMember
// (cacheado por React Query) para que muchas filas con el mismo
// memberId no peguen N veces a la API.
export function MemberLabel({ memberId, size = "md" }: Props) {
  const member = useMember(memberId);
  const name = member.data?.member.full_name ?? "—";
  const palette = getAvatarPalette(name);
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className={dim}>
        <MemberPhoto memberId={memberId} />
        <AvatarFallback
          className="font-semibold"
          style={{ backgroundColor: palette.bg, color: palette.text }}
        >
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{name}</div>
        {member.data?.member.folio && (
          <div className="text-[11px] text-muted-foreground tabular truncate">
            #{member.data.member.folio}
          </div>
        )}
      </div>
    </div>
  );
}
