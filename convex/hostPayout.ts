// convex/hostPayout.ts
//
// Dancer enters HER OWN bank details -> we create a Paystack subaccount ->
// Paystack pays her share straight to her bank after every show. You never
// pay anyone manually.

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { PLATFORM_PCT } from "./lib/fees";

type PaystackBank = { name: string; code: string; active?: boolean };
type PaystackBanksResponse = {
  status: boolean;
  message?: string;
  data?: PaystackBank[];
};
type PaystackSubaccountResponse = {
  status: boolean;
  message?: string;
  data?: { subaccount_code: string; settlement_bank?: string };
};

export type BankOption = { name: string; code: string };

function paystackSecret(): string {
  const secret = process.env.PAYSTACK_SECRET;
  if (!secret)
    throw new Error("PAYSTACK_SECRET is not set in this Convex deployment");
  return secret;
}

/** Bank list for the onboarding dropdown. Signed-in users only. */
export const listBanks = action({
  args: {},
  handler: async (ctx): Promise<BankOption[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const res = await fetch(
      "https://api.paystack.co/bank?country=south%20africa&perPage=100",
      { headers: { Authorization: `Bearer ${paystackSecret()}` } },
    );
    const data = (await res.json()) as PaystackBanksResponse;
    if (!res.ok || !data.status || !data.data) {
      throw new Error(data.message ?? "Could not load banks");
    }
    return data.data
      .filter((b) => b.active !== false)
      .map((b) => ({ name: b.name, code: b.code }));
  },
});

/**
 * Creates the dancer's Paystack subaccount. The full account number goes to
 * Paystack and is then discarded: we store only the subaccount code, the bank
 * name and the last 4 digits. NEVER console.log this action's arguments.
 */
export const setupPayout = action({
  args: {
    bankCode: v.string(),
    accountNumber: v.string(),
    accountHolder: v.string(),
  },
  handler: async (
    ctx,
    { bankCode, accountNumber, accountHolder },
  ): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const bank = bankCode.trim();
    const account = accountNumber.replace(/\s+/g, "");
    const holder = accountHolder.trim();

    if (!/^[A-Za-z0-9-]{1,20}$/.test(bank)) throw new Error("Invalid bank");
    if (!/^\d{6,16}$/.test(account)) {
      throw new Error("Account number must be 6 to 16 digits");
    }
    if (holder.length < 2 || holder.length > 80) {
      throw new Error("Enter the account holder’s name");
    }

    const host = await ctx.runQuery(internal.hosts.getHostForPayout, {
      clerkId: identity.subject,
    });
    if (!host) throw new Error("Save your profile first");
    if (!host.adult)
      throw new Error("Confirm you are 18+ and accept the house rules first");
    if (host.hasPayout) {
      throw new Error(
        "Payout account already set up. Contact support to change it.",
      );
    }

    const res = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_name: `Dancer ${host.hostId}`, // internal label, no personal data
        description: `Account holder: ${holder}`, // helps you reconcile payouts
        settlement_bank: bank,
        account_number: account,
        // Default platform cut. payments.ts overrides it per booking with a flat
        // transaction_charge, so this is only the fallback.
        percentage_charge: PLATFORM_PCT,
      }),
    });
    const data = (await res.json()) as PaystackSubaccountResponse;
    if (!res.ok || !data.status || !data.data?.subaccount_code) {
      throw new Error(data.message ?? "Could not create payout account");
    }

    await ctx.runMutation(internal.hosts.savePayout, {
      hostId: host.hostId,
      payoutAccountRef: data.data.subaccount_code,
      bankName: data.data.settlement_bank,
      bankLast4: account.slice(-4),
    });
  },
});
