import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { GuestProfile } from "@/types/guest";

export type GuestSession = {
  role: "guest";
  guest: GuestProfile;
};

export type AdminSession = {
  role: "admin";
  displayName: string;
  passcode: string;
};

export type AppSession = GuestSession | AdminSession;

interface PersistedSessionState {
  session?: AppSession | null;
  guest?: GuestProfile | null;
}

interface SessionState {
  session: AppSession | null;
  guest: GuestProfile | null;
  isAdmin: boolean;
  selectGuest: (guest: GuestProfile) => void;
  loginAdmin: (displayName: string, passcode: string) => void;
  clearSession: () => void;
  clearGuest: () => void;
}

const EMPTY_SESSION_STATE = {
  session: null,
  guest: null,
  isAdmin: false,
} satisfies Pick<SessionState, "session" | "guest" | "isAdmin">;

function guestSessionState(guest: GuestProfile) {
  const session: GuestSession = { role: "guest", guest };

  return {
    session,
    guest,
    isAdmin: false,
  };
}

function adminSessionState(displayName: string, passcode: string) {
  return {
    session: { role: "admin", displayName, passcode } satisfies AdminSession,
    guest: null,
    isAdmin: true,
  };
}

function deriveGuest(session: AppSession | null): GuestProfile | null {
  return session?.role === "guest" ? session.guest : null;
}

function migrateSessionState(persisted: unknown): Partial<SessionState> {
  const state = persisted as PersistedSessionState | null;
  const session = state?.session ?? null;

  if (session) {
    return {
      session,
      guest: deriveGuest(session),
      isAdmin: session.role === "admin",
    };
  }

  if (state?.guest) {
    return guestSessionState(state.guest);
  }

  return EMPTY_SESSION_STATE;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...EMPTY_SESSION_STATE,

      selectGuest: (guest) => set(guestSessionState(guest)),

      loginAdmin: (displayName, passcode) =>
        set(adminSessionState(displayName, passcode)),

      clearSession: () => set(EMPTY_SESSION_STATE),

      clearGuest: () => set(EMPTY_SESSION_STATE),
    }),
    {
      name: "kikis-paradise-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ session: state.session }),
      merge: (persisted, current) => ({
        ...current,
        ...migrateSessionState(persisted),
      }),
    }
  )
);