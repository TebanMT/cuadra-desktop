import { LogOut, User } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/useAuth";
import { SyncIndicator } from "./SyncIndicator";
import { Badge } from "@/components/ui/badge";
import { shell } from "@/strings/shell";

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const readOnly = useAuthStore((s) => s.readOnly);
  const logout = useLogout();

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <div className="font-semibold text-base">{gym?.name || "Tu gym"}</div>
        {readOnly && <Badge variant="warning">Solo lectura</Badge>}
      </div>

      <div className="flex items-center gap-2">
        <SyncIndicator />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium leading-tight">{user?.full_name}</div>
                <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="h-4 w-4" />
              {shell.user.profile}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout.mutate()}>
              <LogOut className="h-4 w-4" />
              {shell.user.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
