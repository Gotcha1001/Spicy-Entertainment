"use client";

// Shows any price in the VIEWER's currency (what they chose at onboarding).
//
//   const { show, own } = useMoney();
//   show(5000, "USD")   // 5000 USD cents → viewer's currency
//   own(5000, "USD")    // no conversion, just formatted

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CHARGE_CURRENCY,
  convertMinor,
  currencySymbol,
  formatMoney,
  resolveCurrency,
  type Rates,
} from "@/convex/lib/currency";

export function useMoney() {
  const me = useQuery(api.user.getMe);
  const fx = useQuery(api.fx.getRates);
  const rates: Rates | undefined = fx?.rates;

  return useMemo(() => {
    const viewerCurrency = resolveCurrency(me, rates);
    return {
      viewerCurrency,
      viewerSymbol: currencySymbol(viewerCurrency),
      ready: rates !== undefined && me !== undefined,
      show: (minor: number, currency: string = CHARGE_CURRENCY): string => {
        if (!rates || me === undefined) return "…";
        return formatMoney(
          convertMinor(minor, currency, viewerCurrency, rates),
          viewerCurrency,
        );
      },
      toViewer: (minor: number, currency: string = CHARGE_CURRENCY): number =>
        rates ? convertMinor(minor, currency, viewerCurrency, rates) : minor,
      own: (minor: number, currency: string = CHARGE_CURRENCY): string =>
        formatMoney(minor, currency),
    };
  }, [me, rates]);
}
