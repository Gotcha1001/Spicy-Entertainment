// app/dancers/page.tsx
"use client";

import { Suspense } from "react";
import { DancerGrid } from "@/components/dancers/DancerGrid";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Book live entertainment</h1>
      {/* DancerGrid reads the URL (?q=…), which Next requires inside Suspense. */}
      <Suspense
        fallback={
          <p className="py-10 text-center text-neutral-400">Loading…</p>
        }
      >
        <DancerGrid />
      </Suspense>
    </main>
  );
}
