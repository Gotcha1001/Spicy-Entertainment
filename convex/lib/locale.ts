// convex/lib/locale.ts
import type { QueryCtx } from "../_generated/server";
import { COUNTRY_CURRENCY, FALLBACK_RATES, type Rates } from "./currency";

/** Current exchange rates (live row, else the built-in fallback). */
export async function loadRates(ctx: Pick<QueryCtx, "db">): Promise<Rates> {
  const row = await ctx.db.query("fxRates").first();
  return row?.rates ?? FALLBACK_RATES;
}

/** Validates country + currency from the browser. Returns clean values. */
export function checkCountryCurrency(
  input: { country: string; currency: string },
  rates: Rates,
): { country: string; currency: string } {
  const country = input.country.trim().toUpperCase();
  const currency = input.currency.trim().toUpperCase();
  if (!COUNTRY_CURRENCY[country]) throw new Error("Invalid country");
  if (!/^[A-Z]{3}$/.test(currency) || !rates[currency]) {
    throw new Error("That currency isn't supported");
  }
  return { country, currency };
}
