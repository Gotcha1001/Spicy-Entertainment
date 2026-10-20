// app/dancers/page.tsx
"use client";

import { DancerGrid } from "@/components/dancers/DangerGrid";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Book live entertainment</h1>
      <DancerGrid />
    </main>
  );
}
