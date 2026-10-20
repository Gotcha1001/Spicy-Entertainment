"use client";
import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence";

/**
 * Pings the server every minute while `enabled` is true (the app is open).
 * When the tab closes or the pings stop, the cron job
 * (hosts.markStaleOffline) marks the dancer offline.
 */
export function usePresenceHeartbeat(enabled: boolean): void {
  const { isAuthenticated } = useConvexAuth();
  const touch = useMutation(api.hosts.touchPresence);

  useEffect(() => {
    if (!isAuthenticated || !enabled) return;

    const beat = (): void => {
      touch().catch((e: unknown) => console.error("touchPresence failed:", e));
    };

    beat();
    const id = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    // Beat immediately when the dancer comes back to the tab or reconnects.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", beat);
    };
  }, [isAuthenticated, enabled, touch]);
}
