// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Dancers whose heartbeat stopped drop off the "active now" list.
crons.interval(
  "mark stale dancers offline",
  { minutes: 1 },
  internal.hosts.markStaleOffline,
);

// Dancer never showed -> no_show + automatic refund; finished shows -> completed.
crons.interval(
  "sweep bookings (no-shows + completed)",
  { minutes: 2 },
  internal.bookings.sweep,
);

export default crons;
