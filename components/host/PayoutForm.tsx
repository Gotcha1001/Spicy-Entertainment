"use client";
// Bank details -> Paystack subaccount (hostPayout.setupPayout). We never store the
// full account number; the server keeps only the last 4 digits.
import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { BankOption } from "@/convex/hostPayout";

export function PayoutForm({
  bankName,
  bankLast4,
}: {
  bankName: string | null;
  bankLast4: string | null;
}): React.JSX.Element {
  const listBanks = useAction(api.hostPayout.listBanks);
  const setup = useAction(api.hostPayout.setupPayout);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [bankCode, setBankCode] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [accountHolder, setAccountHolder] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(!bankLast4);

  useEffect(() => {
    if (!editing || banks.length > 0) return;
    listBanks()
      .then(setBanks)
      .catch(() => toast.error("Couldn’t load the bank list"));
  }, [editing, banks.length, listBanks]);

  if (!editing && bankLast4) {
    return (
      <div className="flex items-center justify-between rounded-xl border bg-white/5 p-4">
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {bankName ?? "Bank"} ••••{bankLast4}. You’ll be paid automatically.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs underline text-neutral-400"
        >
          Change
        </button>
      </div>
    );
  }

  async function save(): Promise<void> {
    setBusy(true);
    try {
      await setup({
        bankCode,
        accountNumber: accountNumber.replace(/\s/g, ""),
        accountHolder: accountHolder.trim(),
      });
      toast.success("Bank details saved");
      setAccountNumber("");
      setEditing(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn’t save bank details",
      );
    } finally {
      setBusy(false);
    }
  }

  const valid =
    bankCode && accountNumber.length >= 6 && accountHolder.trim().length > 2;

  return (
    <div className="space-y-3">
      <select
        value={bankCode}
        onChange={(e) => setBankCode(e.target.value)}
        className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
      >
        <option value="" className="text-black">
          {banks.length ? "Choose your bank" : "Loading banks…"}
        </option>
        {banks.map((b) => (
          <option key={b.code} value={b.code} className="text-black">
            {b.name}
          </option>
        ))}
      </select>
      <input
        inputMode="numeric"
        value={accountNumber}
        onChange={(e) =>
          setAccountNumber(e.target.value.replace(/[^\d\s]/g, ""))
        }
        placeholder="Account number"
        className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
      />
      <input
        value={accountHolder}
        onChange={(e) => setAccountHolder(e.target.value)}
        placeholder="Account holder name"
        className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={!valid || busy}
        onClick={save}
        className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Save bank details
      </button>
    </div>
  );
}
