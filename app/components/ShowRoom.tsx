"use client";

// Two-way show, both sides on by default.
//  - The dancer ("performer") sees the PARTY big and herself small.
//  - The party ("viewer") sees the DANCER big and themselves small
//    (their small tile only appears if they actually have a camera on).
//  - Camera + mic start automatically for both. Each side can switch theirs
//    off with the control bar. The dancer can hide/mute/block the party feed.
//  - Reactions/requests (clap, slower, ...) travel over the LiveKit data channel.
// Role comes from the server (callAccess.getJoinInfo) and is also stamped into
// the LiveKit token metadata. Publish rights are granted server-side only,
// in /api/livekit-token (viewers get camera+mic, never screen share, and
// nothing at all if the dancer has blocked them).

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AudioTrack,
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  useDataChannel,
  useLocalParticipantPermissions,
  useRoomContext,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { MediaDeviceFailure, Track, type Participant } from "livekit-client";
import "@livekit/components-styles";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCountdown } from "@/convex/lib/slots";
import { useNow } from "@/hooks/useNow";

type TokenResponse = {
  token: string;
  url: string;
  identity: string;
  canPublish: boolean;
};

// ---------------------------------------------------------------- reactions
const VIEWER_KINDS = {
  clap: "👏 Clapping",
  fire: "🔥 Loving it",
  slower: "Client asks: slower",
  faster: "Client asks: faster",
  turn: "Client asks: turn around",
  music: "Client asks: change the music",
} as const;

const PERFORMER_KINDS = {
  thanks: "Thank you 💋",
  next: "Ready for the next song?",
} as const;

type ViewerKind = keyof typeof VIEWER_KINDS;
type PerformerKind = keyof typeof PERFORMER_KINDS;

const REACTION_TOPIC = "reaction";
const MIN_SEND_GAP_MS = 1000; // rate limit: ~1 per second per sender

function roleOf(p?: Participant): string | undefined {
  try {
    return (JSON.parse(p?.metadata || "{}") as { role?: string }).role;
  } catch {
    return undefined;
  }
}

/** A camera tile that is actually showing live video (not a placeholder). */
function isLive(t?: TrackReferenceOrPlaceholder): boolean {
  return !!t?.publication?.track && !t.publication.isMuted;
}

function deviceError(f?: MediaDeviceFailure): void {
  toast.error(
    f === MediaDeviceFailure.PermissionDenied
      ? "Camera or microphone is blocked. Allow it in your browser’s site settings and reload."
      : f === MediaDeviceFailure.NotFound
        ? "No camera or microphone found on this device."
        : f === MediaDeviceFailure.DeviceInUse
          ? "Your camera is being used by another app or tab."
          : "Couldn’t start your camera or microphone.",
  );
}

/** Party side: no camera is perfectly fine, so stay quiet about that. */
function viewerDeviceError(f?: MediaDeviceFailure): void {
  if (f === MediaDeviceFailure.NotFound) return;
  if (f === MediaDeviceFailure.PermissionDenied) {
    toast.info(
      "Your camera/mic is blocked, so the dancer can’t see or hear you. Allow it in your browser’s site settings and reload if you’d like to.",
    );
    return;
  }
  if (f === MediaDeviceFailure.DeviceInUse) {
    toast.info("Your camera is being used by another app or tab.");
  }
}

async function postParty(body: Record<string, unknown>): Promise<void> {
  const r = await fetch("/api/livekit-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? "Something went wrong");
  }
}

/** Sound: viewer hears only the dancer; the dancer hears the party (mutable). */
function Sound({
  performer,
  muteParty,
}: {
  performer: boolean;
  muteParty: boolean;
}): React.JSX.Element {
  const mics = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  return (
    <>
      {mics
        .filter((t) => !t.participant.isLocal)
        .filter((t) =>
          performer
            ? roleOf(t.participant) === "viewer" && !muteParty
            : roleOf(t.participant) === "performer",
        )
        .map((t) => (
          <AudioTrack key={t.participant.identity + t.source} trackRef={t} />
        ))}
    </>
  );
}

/**
 * Big view = the OTHER side, small view = yourself.
 *  - Viewer:    dancer big, own camera small (only if their camera is on).
 *  - Performer: party big, own camera small. "Hide party video" swaps to a
 *               full-size view of herself with no small tile.
 */
function Stage({
  performer,
  hideParty,
  muteParty,
  callSessionId,
}: {
  performer: boolean;
  hideParty: boolean;
  muteParty: boolean;
  callSessionId: Id<"callSessions">;
}): React.JSX.Element {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  const local = tracks.find((t) => t.participant.isLocal);

  // The other side. If there is more than one connection (phone + TV), prefer
  // the one that is actually showing video.
  const otherRole = performer ? "viewer" : "performer";
  const others = tracks.filter(
    (t) => !t.participant.isLocal && roleOf(t.participant) === otherRole,
  );
  const remote = others.find(isLive) ?? others[0];

  const big = performer && hideParty ? local : remote;
  const small = performer
    ? hideParty
      ? undefined
      : local
    : isLive(local)
      ? local
      : undefined;

  const block = async (identity: string) => {
    if (!confirm("Block this party feed for the rest of the show?")) return;
    try {
      await postParty({ callSessionId, action: "block", identity });
      toast.success("Party feed blocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t block");
    }
  };

  return (
    <div className="relative min-h-0 flex-1 bg-black">
      {big ? (
        <ParticipantTile trackRef={big} className="h-full w-full" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-neutral-400">
          {performer
            ? "Waiting for the party to join…"
            : "Waiting for the dancer to start…"}
        </div>
      )}

      {/* Small self-view */}
      {small && (
        <div className="absolute bottom-3 right-3 z-10 w-28 overflow-hidden rounded-xl border border-white/20 shadow-lg sm:w-44">
          <ParticipantTile trackRef={small} className="aspect-video w-full" />
        </div>
      )}

      {/* Dancer can shut off a party feed */}
      {performer && !hideParty && remote && (
        <button
          type="button"
          onClick={() => void block(remote.participant.identity)}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20"
        >
          Block this feed
        </button>
      )}

      <Sound performer={performer} muteParty={muteParty} />
    </div>
  );
}

/** Floating reactions / request banner, shown to whoever receives them. */
function ReactionOverlay({
  performer,
}: {
  performer: boolean;
}): React.JSX.Element {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const nextId = useRef(0);
  const lastFrom = useRef<Map<string, number>>(new Map());

  useDataChannel(REACTION_TOPIC, (msg) => {
    // Rate-limit on the receiving side too, so a modified client can't spam.
    const from = msg.from?.identity ?? "?";
    const t = Date.now();
    if (t - (lastFrom.current.get(from) ?? 0) < MIN_SEND_GAP_MS * 0.8) return;
    lastFrom.current.set(from, t);
    try {
      const { kind } = JSON.parse(new TextDecoder().decode(msg.payload)) as {
        kind: string;
      };
      // Only accept the kinds that belong to the sender's role.
      const senderRole = roleOf(msg.from);
      const text =
        performer && senderRole === "viewer"
          ? VIEWER_KINDS[kind as ViewerKind]
          : !performer && senderRole === "performer"
            ? PERFORMER_KINDS[kind as PerformerKind]
            : undefined;
      if (!text) return;
      const id = nextId.current++;
      setItems((a) => [...a.slice(-3), { id, text }]);
      setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), 4000);
    } catch {
      /* ignore malformed messages */
    }
  });

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="rounded-full bg-black/70 px-3 py-1 text-sm text-white shadow"
        >
          {i.text}
        </div>
      ))}
    </div>
  );
}

function useReactionSender() {
  const room = useRoomContext();
  const last = useRef(0);
  return useCallback(
    (kind: ViewerKind | PerformerKind) => {
      const t = Date.now();
      if (t - last.current < MIN_SEND_GAP_MS) return;
      last.current = t;
      void room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ kind })),
        { reliable: true, topic: REACTION_TOPIC },
      );
    },
    [room],
  );
}

function ViewerBar(): React.JSX.Element {
  const room = useRoomContext();
  const send = useReactionSender();
  const perms = useLocalParticipantPermissions();
  const hadPublish = useRef(false);

  // If our publish rights are taken away AFTER we had them (the dancer blocked
  // us, or we joined on another device which took over), reflect it.
  // We only react to a true -> false change, never to "not known yet".
  useEffect(() => {
    if (!perms) return;
    if (perms.canPublish) {
      hadPublish.current = true;
      return;
    }
    if (hadPublish.current) {
      hadPublish.current = false;
      void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      void room.localParticipant
        .setMicrophoneEnabled(false)
        .catch(() => undefined);
      toast.info(
        "Your camera and mic were turned off (blocked by the dancer, or another of your devices took over).",
      );
    }
  }, [perms, room]);

  return (
    <div className="space-y-2 bg-white/5 p-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(Object.keys(VIEWER_KINDS) as ViewerKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => send(k)}
            className="rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
          >
            {VIEWER_KINDS[k].replace("Client asks: ", "")}
          </button>
        ))}
      </div>
      <ControlBar
        controls={{ chat: false, screenShare: false, leave: false }}
        className="w-full"
      />
    </div>
  );
}

function PerformerBar({
  callSessionId,
  hideParty,
  setHideParty,
  muteParty,
  setMuteParty,
}: {
  callSessionId: Id<"callSessions">;
  hideParty: boolean;
  setHideParty: (v: boolean) => void;
  muteParty: boolean;
  setMuteParty: (v: boolean) => void;
}): React.JSX.Element {
  const endEarly = useMutation(api.calls.endShowEarly);
  const send = useReactionSender();
  const chip =
    "rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10";
  return (
    <div className="space-y-2 bg-white/5 p-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(Object.keys(PERFORMER_KINDS) as PerformerKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => send(k)}
            className={chip}
          >
            {PERFORMER_KINDS[k]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setHideParty(!hideParty)}
          className={chip}
        >
          {hideParty ? "Show party video" : "Hide party video"}
        </button>
        <button
          type="button"
          onClick={() => setMuteParty(!muteParty)}
          className={chip}
        >
          {muteParty ? "Unmute party sound" : "Mute party sound"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <ControlBar
          controls={{ chat: false, screenShare: false, leave: false }}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => {
            if (
              confirm("End the show early? The party will be disconnected.")
            ) {
              endEarly({ callSessionId }).catch((e: unknown) =>
                toast.error(
                  e instanceof Error ? e.message : "Couldn’t end show",
                ),
              );
            }
          }}
          className="rounded-full border border-red-400/60 px-4 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
        >
          End show
        </button>
      </div>
    </div>
  );
}

/** Centered status panel. Declared at module level so React keeps it stable. */
function Box({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[14rem] items-center justify-center rounded-2xl bg-black/60 p-6 text-center text-sm text-neutral-300">
      {children}
    </div>
  );
}

export function ShowRoom({
  callSessionId,
  compact = false,
}: {
  callSessionId: Id<"callSessions">;
  /** Smaller chrome for the 3-up party wall. */
  compact?: boolean;
}): React.JSX.Element {
  const show = useQuery(api.calls.getShow, { callSessionId });
  const [tick, setTick] = useState<number>(0);
  const join = useQuery(api.callAccess.getJoinInfo, { callSessionId, tick });
  const markJoined = useMutation(api.bookings.markHostJoined);
  const now = useNow(1000);
  const [creds, setCreds] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideParty, setHideParty] = useState(false);
  const [muteParty, setMuteParty] = useState(false);

  const canJoin = join?.ok === true;
  const retryable = join?.ok === false && join.retryable === true;

  // Room not open yet: re-check every 30s (queries don't re-run as time passes).
  useEffect(() => {
    if (!retryable) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [retryable]);

  useEffect(() => {
    if (!canJoin || creds) return;
    let cancelled = false;
    fetch(`/api/livekit-token?callSessionId=${callSessionId}`)
      .then(async (r) => {
        const d = (await r.json()) as TokenResponse | { error: string };
        if (!r.ok || "error" in d)
          throw new Error("error" in d ? d.error : "Couldn’t join");
        if (!cancelled) setCreds(d);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn’t join");
      });
    return () => {
      cancelled = true;
    };
  }, [canJoin, creds, callSessionId]);

  if (show === undefined || join === undefined) {
    return (
      <Box>
        <Loader2 className="h-5 w-5 animate-spin" />
      </Box>
    );
  }
  if (show === null) return <Box>Show not found.</Box>;
  if (show.status === "ended")
    return <Box>This show has ended. Thanks for joining!</Box>;
  if (!join.ok) {
    return (
      <Box>
        <div className="space-y-1">
          <p className="font-medium">{join.reason}</p>
          {retryable && (
            <p className="text-neutral-400">
              Starts {new Date(show.startsAt).toLocaleString()}
            </p>
          )}
        </div>
      </Box>
    );
  }
  if (error) return <Box>{error}</Box>;
  if (!creds)
    return (
      <Box>
        <Loader2 className="h-5 w-5 animate-spin" />
      </Box>
    );

  const performer = join.role === "performer";
  const msLeft = join.endsAt - now;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black">
      {!compact && (
        <div className="flex items-center justify-between gap-3 bg-white/5 px-4 py-2 text-sm">
          <span className="font-medium">
            {performer ? `Show for ${show.guestName}` : show.hostName}
            <span className="ml-2 text-neutral-400">{show.hostTagline}</span>
          </span>
          <span className="tabular-nums text-amber-300">
            {msLeft > 0 ? `${formatCountdown(msLeft)} left` : "Wrapping up…"}
          </span>
        </div>
      )}

      <LiveKitRoom
        serverUrl={creds.url}
        token={creds.token}
        connect
        // Both sides start with camera + mic on. The server decides whether
        // this connection may publish (creds.canPublish): a blocked viewer, or
        // an older device of the same viewer, joins watch-only.
        video={creds.canPublish}
        audio={creds.canPublish}
        onMediaDeviceFailure={performer ? deviceError : viewerDeviceError}
        onConnected={() => {
          if (performer)
            markJoined({ bookingId: show.bookingId }).catch(
              (): void => undefined,
            );
        }}
        onError={(e) => toast.error(e.message)}
        className="relative flex min-h-0 flex-1 flex-col"
      >
        <Stage
          performer={performer}
          hideParty={hideParty}
          muteParty={muteParty}
          callSessionId={callSessionId}
        />
        <ReactionOverlay performer={performer} />
        {performer ? (
          <PerformerBar
            callSessionId={callSessionId}
            hideParty={hideParty}
            setHideParty={setHideParty}
            muteParty={muteParty}
            setMuteParty={setMuteParty}
          />
        ) : (
          <ViewerBar />
        )}
      </LiveKitRoom>

      {!compact && (
        <p className="bg-white/5 px-4 py-1.5 text-center text-xs text-neutral-400">
          Camera and mic are on so the dancer and the party can see each other.
          Use the buttons below to turn yours off. House rules: keep it fun. No
          nudity, no porn. Shirts off is fine for guys. Nothing in this room is
          recorded.
        </p>
      )}
    </div>
  );
}
