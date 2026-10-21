"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Flame, PartyPopper } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { OnboardingChoice } from "@/convex/lib/validators";
import { Locale, LocalePicker } from "../components/LocalePicker";

const card =
  "rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

export default function ChooseRolePage(): React.JSX.Element {
  const router = useRouter();
  const status = useQuery(api.user.getOnboardingStatus);
  const chooseAccountType = useMutation(api.user.chooseAccountType);
  const confirmAdult = useMutation(api.user.confirmAdult);

  const [locale, setLocale] = useState<Locale | null>(null);
  const [dob, setDob] = useState<string>("");
  const [agreed, setAgreed] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyAdult =
    status?.ageConfirmed === true && status?.rulesAccepted === true;
  const today = new Date().toISOString().slice(0, 10);

  async function pick(choice: OnboardingChoice): Promise<void> {
    if (!locale) return;
    setError(null);
    if (!alreadyAdult) {
      if (!dob) return setError("Enter your date of birth");
      if (!agreed) return setError("Please tick the box to confirm");
    }
    setBusy(true);
    try {
      if (!alreadyAdult) {
        await confirmAdult({ dateOfBirth: dob, acceptRules: true });
      }
      await chooseAccountType({
        choice,
        country: locale.country,
        timezone: locale.timezone,
        currency: locale.currency,
      });
      // Align with sidebar/route guard: party home is /dancers (or /hosts if that's your real path)
      router.push(choice === "party" ? "/dancers" : "/host/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (status?.role === "host") {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-3xl font-bold">You&apos;re set up as a dancer</h1>
        <p className="text-neutral-400">
          Your account type can&apos;t be changed once your dancer profile is
          saved.
        </p>
        <Link
          href="/host/onboarding"
          className="inline-block rounded-full bg-rose-600 px-5 py-2 font-semibold text-white"
        >
          Go to my profile
        </Link>
      </main>
    );
  }

  const disabled = busy || !locale || status === undefined;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold">How will you use FitGirls Live?</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Live party entertainment: fire blowing, hula hoop, funky and fancy
          dress acts.
        </p>
      </header>

      <section className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">Where are you?</h2>
        <p className="text-sm text-neutral-400">
          We use this to show show times in the right time zone and prices in
          your currency.
        </p>
        <LocalePicker onChange={setLocale} />
      </section>

      {status !== undefined && !alreadyAdult && (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold">Adults only (18+)</h2>
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-300">Date of birth</span>
            <input
              type="date"
              value={dob}
              max={today}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-900 p-2 text-sm"
            />
          </label>
          <label className="flex items-start gap-3 text-sm leading-snug text-neutral-300">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              I confirm I am 18 or older and the date I entered is true. I agree
              to the house rules: <strong>no nudity and no pornography</strong>{" "}
              (guys may perform shirtless). We don&apos;t store your date of
              birth.
            </span>
          </label>
        </section>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => pick("dancer")}
          disabled={disabled}
          className={card}
        >
          <Flame className="mb-3 h-6 w-6 text-rose-400" />
          <p className="text-xl font-semibold">I&apos;m a dancer</p>
          <p className="mt-2 text-sm text-neutral-400">
            Entertainer? Create your profile, list your acts, set your price per
            half hour and get paid straight to your bank.
          </p>
        </button>
        <button
          type="button"
          onClick={() => pick("party")}
          disabled={disabled}
          className={card}
        >
          <PartyPopper className="mb-3 h-6 w-6 text-rose-400" />
          <p className="text-xl font-semibold">I&apos;m a client</p>
          <p className="mt-2 text-sm text-neutral-400">
            Hosting a party or braai? Browse who&apos;s live, book 30-minute
            slots and pay securely with Paystack.
          </p>
        </button>
      </div>
    </main>
  );
}
