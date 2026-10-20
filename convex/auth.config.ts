// convex/auth.config.ts
const authConfig = {
  providers: [
    {
      domain: "https://innocent-bug-6824.clerk.accounts.dev",
      applicationID: "convex", // ← must be "convex", not a dynamic env var
    },
  ],
};

export default authConfig;
