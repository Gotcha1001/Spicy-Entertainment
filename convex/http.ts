import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

async function hmacSha512Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

http.route({
  path: "/paystack-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text(); // raw body, must not be re-serialised
    const signature = request.headers.get("x-paystack-signature");
    const expected = await hmacSha512Hex(process.env.PAYSTACK_SECRET!, body);
    if (!signature || signature !== expected)
      return new Response("Invalid signature", { status: 401 });

    const event = JSON.parse(body);
    if (event.event !== "charge.success")
      return new Response("ok", { status: 200 });

    const data = event.data;
    const reference = String(data.reference);

    await ctx.runMutation(internal.payments.markSucceeded, {
      reference,
      amountCents: data.amount,
      currency: data.currency,
    });
    return new Response("ok", { status: 200 });
  }),
});

export default http;
