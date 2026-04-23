"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SEASON_PROFILES, MAIN_DASHBOARD_PROFILE_ID } from "./seasonProfiles";
import type { SeasonProfile } from "./types";

interface DemoValue {
  profile: SeasonProfile;
  isDemo: true;
}

const Ctx = createContext<DemoValue | null>(null);

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const profile = SEASON_PROFILES[MAIN_DASHBOARD_PROFILE_ID];
  return <Ctx.Provider value={{ profile, isDemo: true }}>{children}</Ctx.Provider>;
}

export function useDemoData(): DemoValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemoData must be used within DemoDataProvider");
  return v;
}
