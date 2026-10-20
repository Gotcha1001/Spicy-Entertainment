"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** The signed-in dancer's profile + onboarding progress in one place. */
export function useMyHost() {
  const host = useQuery(api.hosts.getMyHost);
  const status = useQuery(api.user.getOnboardingStatus);
  return {
    loading: host === undefined || status === undefined,
    host: host ?? null,
    status: status ?? null,
    // Steps, in the order /host/onboarding shows them.
    steps: {
      adult: status?.ageConfirmed === true && status?.rulesAccepted === true,
      profile: host !== null && host !== undefined,
      photo: host?.hasImage === true,
      payout: host?.payoutReady === true,
    },
  };
}
