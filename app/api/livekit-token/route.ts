// app/api/livekit-token/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const MAX_TTL_SECONDS = 3 * 60 * 60; // never longer than 3h
const MIN_TTL_SECONDS = 60;

const WATCH_ONLY = {
  canSubscribe: true,
  canPublish: false,
  canPublishData: true,
  canPublishSources: [] as TrackSource[],
};

function roleOf(metadata: string | undefined): string | undefined {
  try {
    return (JSON.parse(metadata || "{}") as { role?: string }).role;
  } catch {
    return undefined;
  }
}

// Viewer identities look like `${clerkUserId}-${8 chars}`.
function userIdOf(identity: string): string {
  const i = identity.lastIndexOf("-");
  return i === -1 ? identity : identity.slice(0, i);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const callSessionId = new URL(req.url).searchParams.get("callSessionId");
  if (!callSessionId) {
    return NextResponse.json(
      { error: "callSessionId is required" },
      { status: 400 },
    );
  }

  const { getToken } = await auth();
  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!convexUrl || !apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: "Server is missing LiveKit/Convex settings" },
      { status: 500 },
    );
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(convexToken);

  // THE guard: participant, paid, inside the window. Runs with the user's identity.
  const join = await convex.query(api.callAccess.getJoinInfo, {
    callSessionId: callSessionId as Id<"callSessions">,
  });
  if (!join.ok) {
    return NextResponse.json(
      { error: join.reason, retryable: join.retryable === true },
      { status: 403 },
    );
  }

  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const displayName = user.fullName ?? user.username ?? "Guest";

  const ttlSeconds = Math.max(
    MIN_TTL_SECONDS,
    Math.min(
      MAX_TTL_SECONDS,
      Math.floor((join.validUntil - Date.now()) / 1000),
    ),
  );

  const isPerformer = join.role === "performer";

  // A viewer may watch on the phone AND the TV: a unique identity per connection
  // stops LiveKit from kicking the first device when the second joins.
  const identity = isPerformer
    ? user.id
    : `${user.id}-${crypto.randomUUID().slice(0, 8)}`;

  // ------------------------------------------------------------------
  // Can this connection send camera + mic?
  //  - Dancer: always.
  //  - Party:  yes by default, EXCEPT
  //      * if the dancer has blocked them (room metadata, survives reconnects)
  //      * (older devices of the same person are switched to watch-only, so
  //        the newest device is the one sending and there is no echo)
  // ------------------------------------------------------------------
  let canPublish = true;

  if (!isPerformer) {
    const host = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const lk = new RoomServiceClient(host, apiKey, apiSecret);

    try {
      const rooms = await lk.listRooms([join.roomName]);
      // Room not created yet -> nothing to be blocked from, nothing to downgrade.
      if (rooms.length > 0) {
        let blockedIds: string[] = [];
        try {
          blockedIds =
            (
              JSON.parse(rooms[0].metadata || "{}") as {
                blockedUserIds?: string[];
              }
            ).blockedUserIds ?? [];
        } catch {
          blockedIds = [];
        }
        if (blockedIds.includes(user.id)) canPublish = false;

        if (canPublish) {
          try {
            const participants = await lk.listParticipants(join.roomName);
            await Promise.all(
              participants
                .filter(
                  (p) =>
                    roleOf(p.metadata) === "viewer" &&
                    userIdOf(p.identity) === user.id &&
                    p.permission?.canPublish === true,
                )
                .map((p) =>
                  lk
                    .updateParticipant(join.roomName, p.identity, {
                      permission: WATCH_ONLY,
                    })
                    .catch(() => undefined),
                ),
            );
          } catch {
            /* best effort: worst case two devices briefly both send */
          }
        }
      }
    } catch {
      // Couldn't check for blocks: fail closed so a blocked viewer can't slip
      // through. They still watch; the dancer sees a placeholder.
      canPublish = false;
    }
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    ttl: ttlSeconds,
    // Server-set, so clients can trust it (a viewer can't fake being the performer).
    metadata: JSON.stringify({ role: join.role }),
  });

  token.addGrant({
    room: join.roomName, // from the guard, never from the request
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    // Data channel carries reactions/requests both ways.
    canPublishData: true,
    // Party can only ever send camera + mic, never screen share.
    ...(isPerformer
      ? {}
      : { canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE] }),
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl,
    roomName: join.roomName,
    role: join.role,
    identity,
    canPublish,
    bookingId: join.bookingId,
    startsAt: join.startsAt,
    endsAt: join.endsAt,
  });
}
