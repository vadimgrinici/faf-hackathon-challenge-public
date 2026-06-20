import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import oceanBg from "@/assets/ocean-bg.svg";
import { MadeByCredit } from "@/components/made-by-credit";
import { AdminBack } from "@/features/guest-selection/components/admin-back";
import { FlipCard } from "@/features/guest-selection/components/flip-card";
import { GuestSelectionFront } from "@/features/guest-selection/components/guest-selection-front";
import { loginGuest } from "@/features/auth/api/auth-client";
import { useSessionStore } from "@/stores/session-store";
import type { GuestProfile } from "@/types/guest";

export function GuestSelectionPage() {
  const navigate = useNavigate();

  const selectGuest = useSessionStore((state) => state.selectGuest);
  const loginAdmin = useSessionStore((state) => state.loginAdmin);
  const setAuthToken = useSessionStore((state) => state.setAuthToken);

  const [flipped, setFlipped] = useState(false);
  const [isSelectingGuest, setIsSelectingGuest] = useState(false);

  async function handleSelectGuest(guest: GuestProfile) {
    setIsSelectingGuest(true);
    try {
      const result = await loginGuest({ guest_id: guest.id });
      setAuthToken(result.token);
      selectGuest(guest, result.token);
      navigate("/map");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Guest login failed");
    } finally {
      setIsSelectingGuest(false);
    }
  }

  function handleAdminLogin(token: string) {
    loginAdmin("Admin Observer", token);
    navigate("/map");
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-6">
      <img
        src={oceanBg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      <section className="relative w-full max-w-6xl perspective-distant">
        <FlipCard
          flipped={flipped}
          front={
            <GuestSelectionFront
              onSelectGuest={handleSelectGuest}
              onFlip={() => setFlipped(true)}
              isSelectingGuest={isSelectingGuest}
            />
          }
          back={
            <AdminBack
              onLogin={handleAdminLogin}
              onFlip={() => setFlipped(false)}
            />
          }
        />
      </section>

      <MadeByCredit />
    </main>
  );
}
