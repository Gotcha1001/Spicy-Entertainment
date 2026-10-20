// app/call/[callSessionId]/page.tsx

import { ShowRoom } from "@/app/components/ShowRoom";
import type { Id } from "@/convex/_generated/dataModel";
export default async function Page({
  params,
}: {
  params: Promise<{ callSessionId: string }>;
}) {
  const { callSessionId } = await params;
  return (
    <div className="h-[calc(100dvh-8rem)]">
      <ShowRoom callSessionId={callSessionId as Id<"callSessions">} />
    </div>
  );
}
