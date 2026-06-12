"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Bot, LayoutDashboard, Users2, UserRound, Video } from "lucide-react";
import type { UserRole } from "@sr/core";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type NavItem = { label: string; href: string; icon: React.ElementType; soon?: boolean };

function navForRole(role: UserRole): NavItem[] {
  const isRecruiterSide = role === "RECRUITER" || role === "MANAGER" || role === "ADMIN";
  const common: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Roleplays", href: "/roleplays", icon: Video },
  ];
  const roleItems: NavItem[] = isRecruiterSide
    ? [{ label: "Candidates", href: "/candidates", icon: Users2, soon: true }]
    : [{ label: "AI Training", href: "/ai-training", icon: Bot, soon: true }];
  return [...common, ...roleItems, { label: "Profile", href: "/profile", icon: UserRound }];
}

export function AppSidebar({
  role,
  name,
  email,
  avatarUrl,
}: {
  role: UserRole;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Video className="size-5" />
        </span>
        <span className="font-semibold leading-tight">Sales Roleplay</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const inner = (
            <span
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                item.soon && "cursor-not-allowed opacity-60 hover:bg-transparent",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.soon && <Badge variant="secondary">Soon</Badge>}
            </span>
          );
          return item.soon ? (
            <div key={item.href} aria-disabled>
              {inner}
            </div>
          ) : (
            <Link key={item.href} href={item.href}>
              {inner}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t px-4 py-3">
        <Avatar src={avatarUrl} name={name ?? email} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name ?? "Unnamed"}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>
        <UserButton />
      </div>
    </aside>
  );
}
