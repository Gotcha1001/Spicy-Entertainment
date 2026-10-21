"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { getCountriesForTimezone } from "countries-and-timezones";
import { api } from "@/convex/_generated/api";
import { tzLabel } from "@/convex/lib/schedule";
import {
  allZones,
  browserZone,
  COUNTRIES,
  zonesForCountry,
} from "@/convex/lib/timezones";
import {
  COUNTRY_CURRENCY,
  currencyForCountry,
  currencySymbol,
  FALLBACK_RATES,
} from "@/convex/lib/currency";

export type Locale = { country: string; timezone: string; currency: string };

const sel =
  "w-full rounded-lg border border-white/10 bg-neutral-900 p-2 text-sm";

function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    return name && name !== code
      ? `${code} (${currencySymbol(code)}) · ${name}`
      : code;
  } catch {
    return code;
  }
}

export function LocalePicker({
  onChange,
  initial,
}: {
  /** Fires with a complete locale, or null while incomplete. */
  onChange: (v: Locale | null) => void;
  /** Start from this value instead of guessing from the browser. */
  initial?: Locale | null;
}) {
  const fx = useQuery(api.fx.getRates);
  const rates = fx?.rates ?? FALLBACK_RATES;

  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  // Once she picks a currency by hand, changing country stops overwriting it.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [showAll, setShowAll] = useState(false);

  function commit(c: string, tz: string, cur: string) {
    setCountry(c);
    setTimezone(tz);
    setCurrency(cur);
    onChange(
      c && tz && cur ? { country: c, timezone: tz, currency: cur } : null,
    );
  }

  // Pre-fill once: from `initial` if given, otherwise from the browser.
  useEffect(() => {
    if (initial) {
      setShowAll(!zonesForCountry(initial.country).includes(initial.timezone));
      setCurrencyTouched(
        initial.currency !== COUNTRY_CURRENCY[initial.country],
      );
      commit(initial.country, initial.timezone, initial.currency);
      return;
    }
    const tz = browserZone();
    const guess = getCountriesForTimezone(tz)[0]?.id;
    if (guess && COUNTRIES.some((c) => c.code === guess)) {
      commit(guess, tz, currencyForCountry(guess, rates));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live rates arrived: re-pick the default currency if she hasn't chosen one.
  useEffect(() => {
    if (!fx || !country || currencyTouched) return;
    const next = currencyForCountry(country, fx.rates);
    if (next !== currency) commit(country, timezone, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  function pickCountry(code: string) {
    const zones = zonesForCountry(code);
    const browser = browserZone();
    const tz =
      zones.length === 1 ? zones[0] : zones.includes(browser) ? browser : "";
    const cur = currencyTouched ? currency : currencyForCountry(code, rates);
    commit(code, tz, cur);
  }

  // Only currencies we have a rate for (so prices can always be converted).
  const currencyOptions = useMemo(() => {
    const valid = Object.keys(rates).filter((c) => {
      try {
        new Intl.NumberFormat("en", { style: "currency", currency: c });
        return true;
      } catch {
        return false;
      }
    });
    const top = ["USD", "EUR", "GBP", "ZAR"].filter((c) => rates[c]);
    const list = [...new Set([...top, ...valid.sort()])];
    if (currency && !list.includes(currency)) list.unshift(currency);
    return list;
  }, [rates, currency]);

  const now = Date.now();
  const zones = showAll ? allZones() : country ? zonesForCountry(country) : [];

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm text-neutral-300">Country</span>
        <select
          className={sel}
          value={country}
          onChange={(e) => pickCountry(e.target.value)}
        >
          <option value="">Select your country…</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-neutral-300">Time zone</span>
        <select
          className={sel}
          value={timezone}
          disabled={!country && !showAll}
          onChange={(e) => commit(country, e.target.value, currency)}
        >
          <option value="">Select your time zone…</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {tzLabel(z, now)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setShowAll((s) => !s)}
        className="text-xs text-neutral-400 underline"
      >
        {showAll
          ? "Only show zones for my country"
          : "Show all time zones (I live abroad)"}
      </button>

      <label className="block space-y-1">
        <span className="text-sm text-neutral-300">Currency</span>
        <select
          className={sel}
          value={currency}
          disabled={!country}
          onChange={(e) => {
            setCurrencyTouched(true);
            commit(country, timezone, e.target.value);
          }}
        >
          <option value="">Select your currency…</option>
          {currencyOptions.map((c) => (
            <option key={c} value={c}>
              {currencyLabel(c)}
            </option>
          ))}
        </select>
        <span className="block text-xs text-neutral-500">
          Prices are shown to you in this currency. Dancers set their rate in
          it. You can change it later in Settings.
        </span>
      </label>
    </div>
  );
}
