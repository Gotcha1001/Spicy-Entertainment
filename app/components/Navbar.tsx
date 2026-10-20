"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { CreditCard, Flame, UserCog, Video } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import type { NavShow } from "@/convex/notifications";
import { useNow } from "@/hooks/useNow";
import { useAppearance } from "@/app/context/AppearanceContext";
import { accentBackground, alpha, type AccentTheme } from "@/lib/appearance";
import { ThemeToggle } from "./ThemeToggle";

const APP_NAME = "Spicy Entertainment"; // keep in sync with the landing page + sidebar
// Rooms open 10 minutes before the start (convex/lib/showWindow.ts EARLY_JOIN_MS).
const EARLY_JOIN_MS = 10 * 60_000;

function CountBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Green pulsing button: a show is open to join right now. No mutation needed any more. */
function LiveShowButton({
  show,
  extraCount,
}: {
  show: NavShow;
  extraCount: number;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const label =
    show.role === "performer"
      ? `Go live for ${show.otherName}`
      : show.otherName;
  return (
    <motion.div
      animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <Link
        href={`/call/${show.callSessionId}`}
        aria-label={`${label}: join show`}
        title={`Join the show with ${show.otherName}`}
        className="relative flex items-center gap-2 rounded-full bg-green-600 px-3 py-2 text-white shadow-lg shadow-green-600/40 hover:bg-green-500"
      >
        <Video size={18} />
        <span className="hidden max-w-36 truncate text-sm font-semibold sm:inline">
          {label}
        </span>
        <CountBadge count={extraCount} />
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-green-500/30" />
      </Link>
    </motion.div>
  );
}

/** Amber pill linking to where the user needs to act. */
function ActionPill({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: typeof CreditCard;
  label: string;
  count?: number;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      title={label}
      className="relative flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-400/15 px-3 py-2 text-amber-700 hover:bg-amber-400/25 dark:text-amber-200"
    >
      <Icon size={16} />
      <span className="hidden text-sm font-medium sm:inline">{label}</span>
      {count !== undefined && <CountBadge count={count} />}
    </Link>
  );
}

// Everything comes from ONE reactive query (notifications.getNavCounts):
//  - a show that is open to join (party or dancer)
//  - unpaid bookings on the 15-minute hold (party)
//  - unfinished dancer setup (photo or bank details missing)
function NavNotifications(): React.JSX.Element | null {
  const counts = useQuery(api.notifications.getNavCounts);
  // Convex doesn't re-run queries as time passes, so decide "live now" on our own clock.
  const now = useNow(15_000);

  if (!counts) return null;

  const live = counts.upcomingShows.filter(
    (s) => now >= s.startsAt - EARLY_JOIN_MS && now <= s.endsAt,
  );

  return (
    <>
      {counts.hostSetupIncomplete && (
        <ActionPill
          href="/host/onboarding"
          icon={UserCog}
          label="Finish setup"
        />
      )}
      {counts.awaitingPayment > 0 && (
        <ActionPill
          href="/bookings"
          icon={CreditCard}
          label="Pay now"
          count={counts.awaitingPayment}
        />
      )}
      {live.length > 0 && (
        <LiveShowButton show={live[0]} extraCount={live.length - 1} />
      )}
    </>
  );
}

/* ------------------------------ animated brand ------------------------------ */

const ORBIT_TOKENS = [
  { label: "fire", radius: 20, duration: 7, delay: 0, startAngle: 20 },
  { label: "dance", radius: 20, duration: 7, delay: 3.5, startAngle: 200 },
];

const flicker = {
  opacity: [0.55, 0.9, 0.5, 1, 0.6, 0.85, 0.55],
  scale: [0.95, 1.05, 0.92, 1.1, 0.97, 1.04, 0.95],
};

/** Tiled HUD grid as an SVG data-URI, drawn in the accent color. */
function hudGridBackground(hex: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'>` +
    `<path d='M48 0H0V48' fill='none' stroke='${hex}' stroke-width='1' opacity='0.5'/>` +
    `<circle cx='0' cy='0' r='1.5' fill='${hex}'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function BrandMark({ theme }: { theme: AccentTheme }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const { hex400, shades } = theme;

  const spin = (reverse = false) =>
    reduceMotion ? undefined : { rotate: reverse ? -360 : 360 };
  const spinTransition = (duration: number) =>
    reduceMotion
      ? { duration: 0 }
      : { duration, repeat: Infinity, ease: "linear" as const };

  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      {/* Words orbiting the mark */}
      {!reduceMotion &&
        ORBIT_TOKENS.map((t) => (
          <motion.span
            key={t.label}
            className="pointer-events-none absolute font-mono text-[8px] font-medium uppercase tracking-wide"
            style={{
              left: "50%",
              top: "50%",
              color: shades[300],
              opacity: 0.8,
            }}
            animate={{
              x: Array.from({ length: 13 }, (_, i) => {
                const angle = ((t.startAngle + (i / 12) * 360) * Math.PI) / 180;
                return Math.cos(angle) * t.radius;
              }),
              y: Array.from({ length: 13 }, (_, i) => {
                const angle = ((t.startAngle + (i / 12) * 360) * Math.PI) / 180;
                return Math.sin(angle) * t.radius;
              }),
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{
              duration: t.duration,
              delay: t.delay,
              repeat: Infinity,
              ease: "linear",
              opacity: {
                duration: t.duration,
                delay: t.delay,
                repeat: Infinity,
                times: [0, 0.08, 0.5, 0.92, 1],
              },
            }}
          >
            {t.label}
          </motion.span>
        ))}

      {/* Counter-rotating rings */}
      <motion.div
        className="absolute inset-0 rounded-full border border-dashed"
        style={{ borderColor: alpha(hex400, 0.4) }}
        animate={spin()}
        transition={spinTransition(10)}
      />
      <motion.div
        className="absolute inset-1 rounded-full border"
        style={{ borderColor: alpha(shades[600], 0.4) }}
        animate={spin(true)}
        transition={spinTransition(6.5)}
      />

      {/* Pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2"
        style={{ borderColor: alpha(shades[300], 0.3) }}
        animate={
          reduceMotion
            ? undefined
            : { scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }
        }
        transition={{ duration: 1.8, repeat: Infinity }}
      />

      {/* Flickering glow (reads as a flame) */}
      <motion.div
        className="absolute h-5 w-5 rounded-full blur-md"
        style={{ backgroundColor: shades[300] }}
        animate={reduceMotion ? undefined : flicker}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Core: accent gradient + flame */}
      <div
        className="relative flex h-6 w-6 items-center justify-center rounded-full border"
        style={{
          borderColor: alpha(hex400, 0.5),
          background: accentBackground(theme),
          boxShadow: `0 0 12px -2px ${alpha(hex400, 0.9)}`,
        }}
      >
        <Flame className="h-3 w-3 fill-white text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
      </div>
    </div>
  );
}

/* --------------------------------- navbar --------------------------------- */

export default function Navbar(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const { theme } = useAppearance();
  const { hex400, shades } = theme;
  const gridBg = useMemo(() => hudGridBackground(hex400), [hex400]);

  return (
    <motion.nav
      className="relative grid grid-cols-3 items-center overflow-hidden border-b bg-white px-6 py-4 shadow-sm dark:bg-[#04070a]"
      style={{ borderColor: alpha(hex400, 0.15) }}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* HUD background (dark mode) */}
      <div className="pointer-events-none absolute inset-0 hidden dark:block">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url("${gridBg}")`,
            backgroundSize: "48px 48px",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top, color-mix(in oklab, var(--accent-from) 18%, #04070a) 0%, #04070a 70%)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${alpha(hex400, 0.4)}, transparent)`,
          }}
        />
        {/* Corner brackets */}
        {[
          "-left-px -top-px border-l-2 border-t-2",
          "-right-px -top-px border-r-2 border-t-2",
          "-left-px -bottom-px border-l-2 border-b-2",
          "-right-px -bottom-px border-r-2 border-b-2",
        ].map((cls) => (
          <div
            key={cls}
            className={`absolute ${cls} h-3.5 w-3.5`}
            style={{ borderColor: alpha(hex400, 0.45) }}
          />
        ))}
        {/* Scanning line */}
        {!reduceMotion && (
          <motion.div
            className="absolute bottom-0 top-0 w-px"
            style={{
              background: `linear-gradient(to bottom, transparent, ${alpha(shades[300], 0.35)}, transparent)`,
            }}
            animate={{ left: ["0%", "100%"] }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Left: sidebar toggle (opens the slide-over on mobile, collapses to icons on desktop) */}
      <div className="relative z-10 justify-self-start">
        <SidebarTrigger className="text-slate-700 dark:text-stone-300" />
      </div>

      {/* Center: brand */}
      <div className="relative z-10 justify-self-center">
        <Link href="/" className="flex items-center gap-4">
          <BrandMark theme={theme} />
          <span
            className="accent-gradient-text whitespace-nowrap text-base font-black tracking-tight sm:text-lg"
            style={{ filter: `drop-shadow(0 0 10px ${alpha(hex400, 0.35)})` }}
          >
            {APP_NAME}
          </span>
        </Link>
      </div>

      {/* Right: actions */}
      <div className="relative z-10 flex items-center gap-2 justify-self-end">
        <SignedOut>
          <Link href="/sign-in">
            <Button
              variant="ghost"
              className="text-slate-700 dark:text-stone-200"
            >
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button
              className="border text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] hover:opacity-90"
              style={{
                borderColor: alpha(hex400, 0.4),
                background: accentBackground(theme),
                boxShadow: `0 0 20px -6px ${alpha(hex400, 0.6)}`,
              }}
            >
              Sign Up
            </Button>
          </Link>
        </SignedOut>
        <SignedIn>
          <NavNotifications />
          <ThemeToggle />
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </div>
    </motion.nav>
  );
}
