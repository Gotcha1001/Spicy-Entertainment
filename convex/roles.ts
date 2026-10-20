// One place that decides what each person can see.
// "user" = party (or a dancer who hasn't saved her profile yet),
// "host" = a dancer with a profile. No admin.

import type { OnboardingChoice } from "@/convex/lib/validators";

export type Role = "user" | "host";
export type AccountUser = {
  role: Role;
  onboardingChoice?: OnboardingChoice;
};

// Open to everyone, signed in or not.
const PUBLIC: string[] = ["/sign-in", "/sign-up", "/privacy", "/terms"];

// Pages each kind of account may open (prefix match).
// TODO: replace "/hosts" and "/bookings" with your real party-side routes.
function allowedFor(u: AccountUser): string[] {
  // A dancer with a profile
  if (u.role === "host") {
    return ["/host", "/bookings", "/call", "/settings", "/verify-age"];
  }
  // She chose "dancer" but hasn't saved her profile yet (role is still "user").
  // She MUST be able to reach /host/onboarding, because saving it makes her a host.
  if (u.onboardingChoice === "dancer") {
    return ["/host", "/verify-age", "/choose-role", "/settings"];
  }
  // A party / guest
  if (u.onboardingChoice !== undefined) {
    return [
      "/hosts",
      "/bookings",
      "/call",
      "/settings",
      "/verify-age",
      "/choose-role",
    ];
  }
  return ["/choose-role"]; // hasn't chosen yet
}

export function homeFor(u: AccountUser): string {
  if (u.role === "host") return "/host/onboarding";
  if (u.onboardingChoice === "dancer") return "/host/onboarding";
  if (u.onboardingChoice !== undefined) return "/hosts";
  return "/choose-role";
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC.some((p) => matches(pathname, p));
}

export function canAccess(u: AccountUser, pathname: string): boolean {
  if (isPublicPath(pathname)) return true;
  return allowedFor(u).some((p) => matches(pathname, p));
}
