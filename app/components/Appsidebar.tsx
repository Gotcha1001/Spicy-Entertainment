"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Flame,
  Sparkles,
  CalendarCheck,
  CalendarDays,
  BadgeCheck,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { OnboardingChoice, UserRole } from "@/convex/lib/validators";
import { useNow } from "@/hooks/useNow";

const APP_NAME = "Spicy Entertainment"; // keep in sync with the landing page
const EARLY_JOIN_MS = 10 * 60_000; // rooms open 10 min before start (convex/lib/showWindow.ts)

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Parties (guests) book and watch. */
const PARTY_NAV: NavItem[] = [
  { href: "/dancers", label: "Find Dancers", icon: Sparkles },
  { href: "/bookings", label: "My Bookings", icon: CalendarCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Dancers with a saved profile. */
const DANCER_NAV: NavItem[] = [
  { href: "/host/onboarding", label: "My Profile", icon: BadgeCheck },
  { href: "/host/schedule", label: "My Schedule", icon: CalendarDays },
  { href: "/bookings", label: "My Shows", icon: CalendarCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Chose "dancer" but hasn't saved a profile yet. */
const DANCER_SETUP_NAV: NavItem[] = [
  { href: "/host/onboarding", label: "Create your profile", icon: BadgeCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

const UNDECIDED_NAV: NavItem[] = [
  { href: "/choose-role", label: "Choose account type", icon: UserCog },
];

type Me =
  | {
      role: UserRole;
      onboardingChoice?: OnboardingChoice | null;
    }
  | null
  | undefined;

function navFor(me: Me): { label: string; items: NavItem[] } {
  if (!me) return { label: "Menu", items: [] };
  if (me.role === "host") return { label: "Dancer", items: DANCER_NAV };
  if (me.onboardingChoice === "party")
    return { label: "Party", items: PARTY_NAV };
  if (me.onboardingChoice === "dancer")
    return { label: "Dancer setup", items: DANCER_SETUP_NAV };
  return { label: "Welcome", items: UNDECIDED_NAV };
}

export function AppSidebar(): React.JSX.Element {
  const { user } = useUser();
  const pathname = usePathname();
  const me = useQuery(api.user.getMe);
  const { label: groupLabel, items } = navFor(me);

  // Shows that are open to join right now (or about to be), for the bookings badge.
  const shows = useQuery(api.calls.listMyShows, me ? {} : "skip");
  const now = useNow(30_000);
  const joinableCount =
    shows?.filter((s) => now >= s.startsAt - EARLY_JOIN_MS && now <= s.endsAt)
      .length ?? 0;

  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Parties can become dancers and vice versa, until a dancer profile exists.
  const canSwitch = me?.role === "user" && !!me.onboardingChoice;

  const switchLabel =
    me?.onboardingChoice === "party"
      ? "Are you a dancer? Switch"
      : "I’m booking a party instead";

  return (
    // collapsible="icon": shrinks to an icon strip (tooltips show the names).
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-3 py-3">
          <span className="text-2xl">🔥</span>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-black text-sidebar-foreground">
              <span className="text-rose-500">{APP_NAME}</span>
            </p>
            <p className="text-[10px] text-sidebar-foreground/60">
              Live party entertainment
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(href)}
                  tooltip={label}
                >
                  <Link href={href} className="flex items-center gap-2">
                    <Icon size={16} />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {href === "/bookings" && joinableCount > 0 && (
                  <SidebarMenuBadge className="bg-emerald-600 text-white">
                    Live {joinableCount}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {canSwitch && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/choose-role")}
                  tooltip={switchLabel}
                >
                  <Link href="/choose-role" className="flex items-center gap-2">
                    <Flame size={16} />
                    <span>{switchLabel}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        {user && (
          <div className="border-t border-sidebar-border px-3 py-2">
            <div className="flex items-center gap-2">
              {user.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm">
                  🔥
                </div>
              )}
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-semibold text-sidebar-foreground">
                  {user.fullName ?? user.username}
                </p>
                <p className="truncate text-[10px] text-sidebar-foreground/60">
                  {user.primaryEmailAddress?.emailAddress}
                </p>
              </div>
            </div>
          </div>
        )}
        <nav className="flex items-center justify-center whitespace-nowrap px-3 pb-3 pt-1 text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          <Link
            href="/terms"
            className="px-2 hover:text-sidebar-foreground hover:underline"
          >
            Terms of Use
          </Link>
          <Link
            href="/privacy"
            className="border-l border-sidebar-border px-2 hover:text-sidebar-foreground hover:underline"
          >
            Privacy Policy
          </Link>
          <span className="border-l border-sidebar-border px-2">18+ only</span>
        </nav>
      </SidebarFooter>

      {/* Drag/click the sidebar edge to collapse or expand */}
      <SidebarRail />
    </Sidebar>
  );
}
