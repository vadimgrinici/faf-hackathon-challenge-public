import { useState } from "react";
import { useNavigate } from "react-router";

import oceanBg from "@/assets/ocean-bg.svg";
import { MadeByCredit } from "@/components/made-by-credit";
import { AdminBack } from "@/features/guest-selection/components/admin-back";
import { FlipCard } from "@/features/guest-selection/components/flip-card";
import { GuestSelectionFront } from "@/features/guest-selection/components/guest-selection-front";
import { useSessionStore } from "@/stores/session-store";
import type { GuestProfile } from "@/types/guest";

export function GuestSelectionPage() {
  const navigate = useNavigate();

  const selectGuest = useSessionStore((state) => state.selectGuest);
  const loginAdmin = useSessionStore((state) => state.loginAdmin);

  const [flipped, setFlipped] = useState(false);

  function handleSelectGuest(guest: GuestProfile) {
    selectGuest(guest);
    navigate("/map");
  }

  function handleAdminLogin(passcode: string) {
    loginAdmin("Admin Observer", passcode);
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
