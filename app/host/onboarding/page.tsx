"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  MAX_ACTS,
  MAX_RATE_CENTS,
  MIN_RATE_CENTS,
} from "@/convex/lib/hostRules";
import { actValidator, type Act } from "@/convex/lib/validators";

// Set to false once you've found the problem.
const DEBUG = true;
const log = (...args: unknown[]) => {
  if (DEBUG) console.log("[onboarding]", ...args);
};

// Where she confirms 18+, accepts the house rules, picks "I'm a dancer" and
// sets her time zone. Change this to your real route.
const USER_ONBOARDING_PATH = "/onboarding";

const DEFAULT_RATE_CENTS = Math.min(
  MAX_RATE_CENTS,
  Math.max(MIN_RATE_CENTS, 30000),
);

// Act options come straight from the validator so they can never drift.
const ACT_OPTIONS: Act[] = (
  actValidator as unknown as { members: Array<{ value?: string }> }
).members
  .map((m) => m.value)
  .filter((x): x is string => typeof x === "string") as Act[];

type Bank = { name: string; code: string };

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

const zar = (cents: number) =>
  `R${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Resize to max 1024px and re-encode as JPEG, so uploads stay small. */
async function fileToJpegDataUri(
  file: File,
  maxSide = 1024,
  quality = 0.85,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Your browser can't process this image.");
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

// rose-* is remapped to the chosen accent in globals.css, so everything below
// follows the theme. Glow comes from the "accent-card" class (needs data-glow="on").
const card = "accent-card space-y-4 rounded-2xl border bg-zinc-900/60 p-5";

const field =
  "w-full rounded-lg border border-rose-500/40 bg-neutral-900 p-2 text-white placeholder:text-neutral-500 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500";

const button =
  "rounded-xl bg-rose-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:hover:bg-rose-600";

const checkbox = "mt-1 accent-rose-500";

export default function HostOnboarding() {
  const host = useQuery(api.hosts.getMyHost);
  const me = useQuery(api.user.getMe);
  const saveProfile = useMutation(api.hosts.saveProfile);
  const setImage = useMutation(api.hosts.setImage);
  const uploadProfilePhoto = useAction(api.uploads.uploadProfilePhoto);
  const deleteProfilePhoto = useAction(api.uploads.deleteProfilePhoto);
  const listBanks = useAction(api.hostPayout.listBanks);
  const setupPayout = useAction(api.hostPayout.setupPayout);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [acts, setActs] = useState<Act[]>([]);
  const [rateRand, setRateRand] = useState(""); // rand per 30 minutes
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountNumberConfirm, setAccountNumberConfirm] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [namesMatch, setNamesMatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const prefilled = useRef(false);

  // Fill the form once: from her saved profile if she has one, otherwise
  // defaults. Runs once, so it never overwrites her typing.
  useEffect(() => {
    if (prefilled.current || host === undefined || me === undefined) return;
    if (host) {
      log("prefilling from saved host profile");
      setDisplayName(host.displayName);
      setTagline(host.tagline);
      setBio(host.bio);
      setCity(host.city ?? "");
      setActs(host.acts);
      setRateRand((host.ratePerHalfHourCents / 100).toString());
    } else {
      log("no host yet, prefilling defaults");
      // First name only: her full legal name must not become her public name.
      setDisplayName(me?.name?.trim().split(/\s+/)[0] ?? "");
      setRateRand((DEFAULT_RATE_CENTS / 100).toString());
    }
    prefilled.current = true;
  }, [host, me]);

  // Log the raw query results whenever they change.
  // undefined = still loading, null = signed out / no row.
  useEffect(() => {
    log("me:", me);
    log("host:", host);
  }, [me, host]);

  // Log the act options once: an empty list means actValidator.members
  // didn't have the shape this page expects.
  useEffect(() => {
    log("ACT_OPTIONS:", ACT_OPTIONS, "MAX_ACTS:", MAX_ACTS);
    log("rate limits (cents):", MIN_RATE_CENTS, MAX_RATE_CENTS);
  }, []);

  // Load banks once a profile exists and payouts aren't set up yet
  const payoutReady = host?.payoutReady ?? false;
  useEffect(() => {
    if (host && !payoutReady && banks.length === 0) {
      log("loading banks…");
      listBanks()
        .then((b) => {
          log("banks loaded:", b.length);
          setBanks(b);
        })
        .catch((e: unknown) => {
          console.error("[onboarding] listBanks failed:", e);
          setError(errorMessage(e));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?._id, payoutReady]);

  if (host === undefined || me === undefined) {
    return <p className="p-8">Loading…</p>;
  }

  // What saveProfile (requireAdult etc.) needs BEFORE she can save.
  const missing: string[] = [];
  if (!host) {
    if (!me?.ageConfirmedAt) missing.push("confirm you are 18 or older");
    if (!me?.rulesAcceptedAt) missing.push("accept the house rules");
    if (me?.role !== "host" && me?.onboardingChoice !== "dancer")
      missing.push("choose “I’m a dancer”");
    if (!me?.timezone) missing.push("choose your time zone");
  }
  const canSave = missing.length === 0;

  // Runs on every render, so it shows exactly why a button is disabled.
  log("gate", {
    hasHost: !!host,
    missing,
    canSave,
    busy,
    saveDisabled: busy || !canSave,
    photoDisabled: busy || !host,
    me: {
      ageConfirmedAt: me?.ageConfirmedAt,
      rulesAcceptedAt: me?.rulesAcceptedAt,
      onboardingChoice: me?.onboardingChoice,
      role: me?.role,
      timezone: me?.timezone,
    },
  });

  function toggleAct(act: Act) {
    setActs((prev) =>
      prev.includes(act)
        ? prev.filter((a) => a !== act)
        : prev.length >= MAX_ACTS
          ? prev
          : [...prev, act],
    );
  }

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    log("save clicked", { displayName, tagline, bio, city, acts, rateRand });
    setError("");
    setDone("");

    const cents = Math.round(parseFloat(rateRand) * 100);
    if (
      !Number.isFinite(cents) ||
      cents < MIN_RATE_CENTS ||
      cents > MAX_RATE_CENTS
    ) {
      log("blocked: rate out of range", cents);
      setError(
        `Your rate must be between ${zar(MIN_RATE_CENTS)} and ${zar(MAX_RATE_CENTS)} per 30 minutes.`,
      );
      return;
    }
    if (acts.length < 1) {
      log("blocked: no acts picked");
      setError("Pick at least one thing you perform.");
      return;
    }

    setBusy(true);
    try {
      const hostId = await saveProfile({
        displayName,
        tagline,
        bio,
        acts,
        ratePerHalfHourCents: cents,
        city: city.trim() || undefined,
      });
      log("saved, hostId:", hostId);
      setDone("Profile saved.");
    } catch (err: unknown) {
      console.error("[onboarding] save failed:", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    log("photo picked:", file.name, file.size, file.type);
    setError("");
    setDone("");
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("That image is over 5 MB. Please choose a smaller one.");
      return;
    }
    setBusy(true);
    try {
      const dataUri = await fileToJpegDataUri(file);
      log("resized, data URI length:", dataUri.length);

      const image = await uploadProfilePhoto({ imageDataUri: dataUri });
      // Shows the real field names of CloudinaryImage (url? secureUrl?).
      log("cloudinary result:", image);

      // If the field is named differently in CloudinaryImage (lib/cloudinary.ts),
      // TypeScript will flag the next line: use the https://res.cloudinary.com URL.
      const { previousPublicId } = await setImage({
        imageUrl: image.url,
        imagePublicId: image.publicId,
      });
      log("setImage ok, previous publicId:", previousPublicId);

      // Clean up the photo she replaced. Failure here is harmless.
      if (previousPublicId && previousPublicId !== image.publicId) {
        deleteProfilePhoto({ publicId: previousPublicId })
          .then(() => log("old photo deleted:", previousPublicId))
          .catch((err: unknown) =>
            log("old photo delete failed (harmless):", err),
          );
      }
      setDone("Photo updated.");
    } catch (err: unknown) {
      console.error("[onboarding] photo failed:", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSavePayout(e: React.FormEvent) {
    e.preventDefault();
    // Never log the account number itself.
    log("payout save clicked", { bankCode, accountHolder });
    setError("");
    setDone("");
    const a = accountNumber.replace(/\s+/g, "");
    const b = accountNumberConfirm.replace(/\s+/g, "");
    if (a !== b) {
      log("blocked: account numbers differ");
      setError("The two account numbers don't match.");
      return;
    }
    setBusy(true);
    try {
      await setupPayout({ bankCode, accountNumber, accountHolder });
      log("payout set up");
      // don't keep the number in memory
      setAccountNumber("");
      setAccountNumberConfirm("");
      setDone("Payouts are set up.");
    } catch (err: unknown) {
      console.error("[onboarding] payout failed:", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function statusBanner(): {
    text: string;
    tone: "info" | "ok" | "warn";
  } | null {
    if (!host) {
      return {
        text: "Start by saving your profile. Then add a photo and your bank details to go live.",
        tone: "info",
      };
    }
    if (host.status === "suspended") {
      return {
        text: "Your profile is suspended after reports. Please contact support.",
        tone: "warn",
      };
    }
    if (!host.hasImage || !host.payoutReady) {
      const todo = [
        !host.hasImage && "add a photo",
        !host.payoutReady && "add your bank details",
      ]
        .filter(Boolean)
        .join(" and ");
      return {
        text: `Almost there: ${todo}. You're listed automatically once both are done.`,
        tone: "info",
      };
    }
    if (host.status === "paused") {
      return {
        text: "You're set up but currently paused, so parties can't see you.",
        tone: "info",
      };
    }
    return { text: "You're live. Parties can now book you.", tone: "ok" };
  }

  const banner = statusBanner();

  return (
    <main className="mx-auto max-w-xl space-y-8 px-4 py-10 text-white">
      <header>
        <h1 className="text-2xl font-semibold">
          {host ? "Your dancer profile" : "Set up your dancer profile"}
        </h1>
        <p className="mt-2 text-neutral-400">
          Parties book you in 30-minute blocks. Your share of every booking is
          paid straight to your bank account through Paystack. You&apos;re
          listed automatically once your photo and payouts are set up.
        </p>
      </header>

      {banner && (
        <p
          role="status"
          className={`rounded-lg p-3 ${
            banner.tone === "ok"
              ? "bg-green-500/10 text-green-300"
              : banner.tone === "warn"
                ? "bg-yellow-500/10 text-yellow-300"
                : "accent-card border bg-zinc-900/60 text-rose-50"
          }`}
        >
          {banner.text}
        </p>
      )}

      {!canSave && (
        <p
          role="alert"
          className="rounded-lg bg-yellow-500/10 p-3 text-yellow-300"
        >
          Before you can save your profile, you need to {missing.join(", ")}.{" "}
          <Link href={USER_ONBOARDING_PATH} className="underline">
            Go to that step
          </Link>
          .
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">
          {error}
        </p>
      )}

      {done && (
        <p
          role="status"
          className="rounded-lg bg-green-500/10 p-3 text-green-300"
        >
          {done}
        </p>
      )}

      <form onSubmit={onSaveProfile} className={card}>
        <h2 className="text-lg font-semibold">Your profile</h2>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Stage name</span>
          <input
            className={field}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={40}
            required
          />
          <span className="mt-1 block text-xs text-neutral-500">
            This is the name parties see. You can change it any time.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tagline</span>
          <input
            className={field}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            minLength={3}
            maxLength={80}
            placeholder="e.g. Fire blower & hoop queen"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Bio</span>
          <textarea
            className={field}
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            City <span className="text-neutral-500">(optional)</span>
          </span>
          <input
            className={field}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={60}
            placeholder="e.g. Durban"
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            What you perform (up to {MAX_ACTS})
          </legend>
          <div className="flex flex-wrap gap-2">
            {ACT_OPTIONS.map((act) => {
              const on = acts.includes(act);
              return (
                <button
                  type="button"
                  key={act}
                  onClick={() => toggleAct(act)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
                    on
                      ? "border-rose-400 bg-rose-600 text-white"
                      : "border-rose-500/40 bg-neutral-900 text-neutral-300 hover:border-rose-400"
                  }`}
                >
                  {act.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Your rate (ZAR per 30 minutes)
          </span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-rose-300">R</span>
            <input
              className={field}
              type="number"
              min={MIN_RATE_CENTS / 100}
              max={MAX_RATE_CENTS / 100}
              step={1}
              value={rateRand}
              onChange={(e) => setRateRand(e.target.value)}
              required
            />
          </div>
          <span className="mt-1 block text-xs text-neutral-500">
            Allowed: {zar(MIN_RATE_CENTS)} to {zar(MAX_RATE_CENTS)} per
            30-minute block. A 1-hour booking costs double.
          </span>
        </label>

        <button className={button} disabled={busy || !canSave}>
          Save profile
        </button>
      </form>

      <section className={card}>
        <h2 className="text-lg font-semibold">Your photo</h2>
        <div className="flex items-center gap-4">
          {host?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={host.imageUrl}
              alt="Your profile photo"
              className="accent-card h-20 w-20 rounded-full border-2 object-cover"
            />
          ) : (
            <div className="accent-card flex h-20 w-20 items-center justify-center rounded-full border-2 bg-neutral-800 text-xs text-neutral-400">
              No photo
            </div>
          )}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickAvatar}
              disabled={busy || !host}
              className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-rose-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-rose-500"
            />
            <p className="mt-1 text-xs text-neutral-500">
              {host
                ? host.imageUrl
                  ? "Choose a new photo to replace this one. JPG or PNG, up to 5 MB."
                  : "JPG or PNG, up to 5 MB. Required to be listed."
                : "Save your profile first, then you can add a photo."}
            </p>
          </div>
        </div>
      </section>

      {host && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Where we pay you</h2>

          {payoutReady ? (
            <p className="rounded-lg border border-rose-500/40 bg-rose-600/10 p-3">
              Payouts go to the account ending in{" "}
              <strong>{host.bankLast4}</strong>
              {host.bankName ? ` (${host.bankName})` : ""}. To change it,
              contact support.
            </p>
          ) : (
            <form onSubmit={onSavePayout} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Bank</span>
                <select
                  className={field}
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  required
                >
                  <option value="">Choose your bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Account holder name
                </span>
                <input
                  className={field}
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  autoComplete="off"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Account number
                </span>
                <input
                  className={field}
                  inputMode="numeric"
                  pattern="[0-9 ]{6,20}"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Confirm account number
                </span>
                <input
                  className={field}
                  inputMode="numeric"
                  pattern="[0-9 ]{6,20}"
                  value={accountNumberConfirm}
                  onChange={(e) => setAccountNumberConfirm(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={namesMatch}
                  onChange={(e) => setNamesMatch(e.target.checked)}
                  className={checkbox}
                />
                <span>This account is in my own name.</span>
              </label>

              <button className={button} disabled={busy || !namesMatch}>
                Save bank details
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
