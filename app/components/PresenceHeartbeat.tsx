"use client";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { useMyHost } from "@/hooks/useMyHost";

// Mounted once in the root layout. Any signed-in, active, fully onboarded
// dancer is "online" for as long as the app is open. No manual switch.
export function PresenceHeartbeat(): null {
  const { host } = useMyHost();
  usePresenceHeartbeat(!!host && host.status === "active" && host.isOnboarded);
  return null;
}
