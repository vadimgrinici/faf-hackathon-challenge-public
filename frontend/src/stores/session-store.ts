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
};

export type AppSession = GuestSession | AdminSession;

interface PersistedSessionState {
  session?: AppSession | null;
  guest?: GuestProfile | null;
  arrivalGuestId?: string | null;
  authToken?: string | null;
}

interface SessionState {
  session: AppSession | null;
  guest: GuestProfile | null;
  arrivalGuestId: string | null;
  authToken: string | null;
  isAdmin: boolean;
  selectGuest: (guest: GuestProfile) => void;
  loginAdmin: (displayName?: string, authToken?: string | null) => void;
  setArrivalGuestId: (guestId: string | null) => void;
  setAuthToken: (token: string | null) => void;
  clearSession: () => void;
  clearGuest: () => void;
}

const EMPTY_SESSION_STATE = {
  session: null,
  guest: null,
  arrivalGuestId: null,
  authToken: null,
  isAdmin: false,
} satisfies Pick<SessionState, "session" | "guest" | "isAdmin">;

function guestSessionState(guest: GuestProfile) {
  const session: GuestSession = { role: "guest", guest };

  return {
    session,
    guest,
    arrivalGuestId: null,
    authToken: null,
    isAdmin: false,
  };
}

function adminSessionState(displayName: string, authToken: string | null) {
  return {
    session: { role: "admin", displayName } satisfies AdminSession,
    guest: null,
    arrivalGuestId: null,
    authToken,
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
      arrivalGuestId: state?.arrivalGuestId ?? null,
      authToken: state?.authToken ?? null,
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

      loginAdmin: (displayName = "Admin", authToken = null) =>
        set(adminSessionState(displayName, authToken)),

      setArrivalGuestId: (guestId) => set({ arrivalGuestId: guestId }),

      setAuthToken: (token) => set({ authToken: token }),

      clearSession: () => set(EMPTY_SESSION_STATE),

      clearGuest: () => set(EMPTY_SESSION_STATE),
    }),
    {
      name: "kikis-paradise-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        session: state.session,
        arrivalGuestId: state.arrivalGuestId,
        authToken: state.authToken,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...migrateSessionState(persisted),
      }),
    }
  )
);
