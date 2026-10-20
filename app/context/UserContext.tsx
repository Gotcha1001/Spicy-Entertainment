"use client";

import { createContext, useContext } from "react";
import type { Doc } from "@/convex/_generated/dataModel";

export type User = Doc<"users">;

export const UserContext = createContext<User | null>(null);

export function useUserContext(): User | null {
  return useContext(UserContext);
}
