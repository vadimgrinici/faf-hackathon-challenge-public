import { IconPlaneDeparture, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ZoneEventLog } from "@/features/map/components/zone-event-log";
import { ZoneId } from "@/features/map/constants";
import { useZoneEvents } from "@/features/map/hooks/use-zone-events";
import { useGuest, useIsAdmin } from "@/stores/session-selectors";
import { useSessionStore } from "@/stores/session-store";
import { useArrivalForm } from "@/features/airport/hooks/use-arrival-form";
import { useArrivalStatus } from "@/features/airport/hooks/use-airport";
import { AirportAdminQueueSummary } from "./airport-admin-queue-summary";
import { ArrivalStatusCard } from "./arrival-status";
import { ArrivalFormResult } from "./arrival-form-result";
import { BoardingPass } from "./boarding-pass";

export function AirportPanel() {
  const isAdmin = useIsAdmin();
  const guest = useGuest();
  const events = useZoneEvents(ZoneId.Airport);
  const { onSubmit, result, isSubmitting } = useArrivalForm();
  const arrivalGuestId = useSessionStore((s) => s.arrivalGuestId);
  const { data: arrivalStatus } = useArrivalStatus(
    result?.guest_id ?? arrivalGuestId ?? null
  );

  if (isAdmin) {
    return (
      <>
        <AirportAdminQueueSummary />
        <ZoneEventLog events={events} />
      </>
    );
  }

  return (
    <>
      {guest && <BoardingPass guest={guest} />}

      {arrivalStatus ? (
        <ArrivalStatusCard status={arrivalStatus} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Button
            type="submit"
            data-testid="airport-board"
            disabled={isSubmitting}
            className="w-full cursor-pointer bg-(--zone-accent) text-white"
          >
            {isSubmitting ? (
              <>
                <IconLoader2 size={16} className="mr-2 animate-spin" />
                Joining queue…
              </>
            ) : (
              <>
                <IconPlaneDeparture size={16} className="mr-2" />
                Board the flight
              </>
            )}
          </Button>

          {result && (
            <>
              <Separator />
              <ArrivalFormResult result={result} />
            </>
          )}
        </form>
      )}
    </>
  );
}
