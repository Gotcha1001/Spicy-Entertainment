// lib/roles.ts
//
// One place that decides what each person can see (used by RouteGuard and the sidebar).
//   role "user"  = a party/client, OR a dancer who hasn't saved a profile yet
//   role "host"  = a dancer with a saved profile
// onboardingChoice (set on /choose-role): "party" | "dancer"
import type { OnboardingChoice, UserRole } from "@/convex/lib/validators";

export type Role = UserRole;

export type AccountUser = {
  role: Role;
  onboardingChoice?: OnboardingChoice | null;
  timezone?: string | null;
};

// Open to everyone, signed in or not.
const PUBLIC: string[] = ["/sign-in", "/sign-up", "/privacy", "/terms"];

// Pages each kind of account may open (prefix match).
function allowedFor(u: AccountUser): string[] {
  // Dancer with a saved profile.
  if (u.role === "host") {
    return ["/host", "/bookings", "/call", "/settings"];
  }
  // Clients (parties): browse dancers, book, pay (Paystack returns to /bookings/[id]), watch.
  if (u.onboardingChoice === "party") {
    return ["/dancers", "/bookings", "/call", "/settings", "/choose-role"];
  }
  // Chose "dancer" but hasn't saved a profile yet: onboarding must be reachable.
  if (u.onboardingChoice === "dancer") {
    return ["/host", "/settings", "/choose-role"];
  }
  return ["/choose-role"]; // hasn't chosen yet
}

export function homeFor(u: AccountUser): string {
  if (u.role === "host") return "/host/onboarding";
  if (u.onboardingChoice === "dancer") return "/host/onboarding";
  if (u.onboardingChoice === "party") return "/dancers";
  return "/choose-role";
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC.some((p) => matches(pathname, p));
}

// True when this account should already have a time zone but doesn't.
// Brand-new accounts (role "user", no choice yet) are excluded because
// /choose-role captures their time zone.
export function needsLocale(u: AccountUser): boolean {
  if (u.timezone) return false;
  return u.role !== "user" || !!u.onboardingChoice;
}

export function canAccess(u: AccountUser, pathname: string): boolean {
  if (isPublicPath(pathname)) return true;
  if (matches(pathname, "/set-locale")) return true; // any signed-in role
  return allowedFor(u).some((p) => matches(pathname, p));
}
