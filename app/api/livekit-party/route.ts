// app/api/livekit-party/route.ts
//
// Controls who may SEND audio/video into a show room besides the dancer.
//   viewer    -> action "allow" (mode "audio" | "video") or "revoke"
//   performer -> action "block" (identity of the viewer feed to shut off)
//
// Every call re-runs the Convex guard, so only a paid participant inside the
// show window can change anything. Permissions are applied with LiveKit's
// server API (updateParticipant), so a client can't grant itself publish rights.
//
// NOTE: check TrackSource is exported by your livekit-server-sdk version
// (it is re-exported from @livekit/protocol in v2.x).
import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Body =
  | {
      callSessionId: string;
      action: "allow";
      mode: "audio" | "video";
      identity: string; // the caller's own LiveKit identity (verified below)
    }
  | { callSessionId: string; action: "revoke"; identity: string }
  | { callSessionId: string; action: "block"; identity: string };

type RoomMeta = { blockedUserIds?: string[] };

function parseMeta(raw: string | undefined): RoomMeta {
  try {
    return raw ? (JSON.parse(raw) as RoomMeta) : {};
  } catch {
    return {};
  }
}

function roleOf(metadata: string | undefined): string | undefined {
  try {
    return (JSON.parse(metadata || "{}") as { role?: string }).role;
  } catch {
    return undefined;
  }
}

// Participant ids look like `${clerkUserId}-${8 chars}` for viewers.
function userIdOf(identity: string): string {
  const i = identity.lastIndexOf("-");
  return i === -1 ? identity : identity.slice(0, i);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body?.callSessionId || !body?.action) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { getToken } = await auth();
  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const user = await currentUser();
  if (!user) {
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
  const join = await convex.query(api.callAccess.getJoinInfo, {
    callSessionId: body.callSessionId as Id<"callSessions">,
  });
  if (!join.ok) {
    return NextResponse.json({ error: join.reason }, { status: 403 });
  }

  const host = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const lk = new RoomServiceClient(host, apiKey, apiSecret);
  const room = join.roomName;

  const [rooms, participants] = await Promise.all([
    lk.listRooms([room]),
    lk.listParticipants(room),
  ]);
  const meta = parseMeta(rooms[0]?.metadata);
  const blocked = new Set(meta.blockedUserIds ?? []);

  // ---------------------------------------------------------------- performer
  if (body.action === "block") {
    if (join.role !== "performer") {
      return NextResponse.json(
        { error: "Only the dancer can do that" },
        { status: 403 },
      );
    }
    const target = participants.find((p) => p.identity === body.identity);
    if (!target || target.identity === user.id) {
      return NextResponse.json(
        { error: "Participant not found" },
        { status: 404 },
      );
    }
    blocked.add(userIdOf(target.identity));
    // Room metadata outlives the viewer's reconnects (new identity each time).
    await lk.updateRoomMetadata(
      room,
      JSON.stringify({ ...meta, blockedUserIds: [...blocked] }),
    );
    // Removing publish rights also unpublishes whatever they were sending.
    await lk.updateParticipant(room, target.identity, {
      permission: {
        canSubscribe: true,
        canPublish: false,
        canPublishData: true,
        canPublishSources: [],
      },
    });
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------- viewer
  if (join.role !== "viewer") {
    return NextResponse.json({ error: "Viewers only" }, { status: 403 });
  }
  // The client says which of its connections; we verify it really is theirs.
  const mine = participants.find(
    (p) => p.identity === body.identity && userIdOf(p.identity) === user.id,
  );
  if (!mine) {
    return NextResponse.json(
      { error: "You are not connected to this room" },
      { status: 400 },
    );
  }

  if (body.action === "revoke") {
    await lk.updateParticipant(room, mine.identity, {
      permission: {
        canSubscribe: true,
        canPublish: false,
        canPublishData: true,
        canPublishSources: [],
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "allow") {
    if (blocked.has(user.id)) {
      return NextResponse.json(
        { error: "The dancer has turned off your party feed" },
        { status: 403 },
      );
    }
    // One party feed at a time: phone + TV must not both send.
    const someoneElse = participants.find(
      (p) =>
        p.identity !== mine.identity &&
        p.permission?.canPublish === true &&
        roleOf(p.metadata) === "viewer",
    );
    if (someoneElse) {
      return NextResponse.json(
        { error: "Another device is already sending party video or sound" },
        { status: 409 },
      );
    }
    const sources =
      body.mode === "video"
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
        : [TrackSource.MICROPHONE];
    await lk.updateParticipant(room, mine.identity, {
      permission: {
        canSubscribe: true,
        canPublish: true,
        canPublishData: true,
        canPublishSources: sources, // never screen share
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
