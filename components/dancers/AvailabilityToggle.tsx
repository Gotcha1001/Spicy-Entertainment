"use client";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useMyHost } from "@/hooks/useMyHost";

export function AvailabilityToggle(): React.JSX.Element | null {
  const { host } = useMyHost();
  const setAvailable = useMutation(api.hosts.setAvailable);
  if (!host) return null;

  const on = host.wantsOnline === true;
  const listed = host.isOnboarded && host.status === "active";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={!listed}
      onClick={() =>
        setAvailable({ available: !on }).catch((e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Couldn't update"),
        )
      }
      className={`relative h-7 w-12 rounded-full transition disabled:opacity-40 ${
        on ? "bg-emerald-500" : "bg-neutral-600"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
          on ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
}
