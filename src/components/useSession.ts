"use client";

import { useSyncExternalStore } from "react";
import { getSessionState, subscribe, type SessionState } from "../lib/client/keystore";

/** Non-secret session facts for rendering. Key material never enters React state. */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSessionState, getSessionState);
}
