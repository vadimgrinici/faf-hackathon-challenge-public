import { useState } from "react";
import { IconAlertCircle, IconPlus } from "@tabler/icons-react";

import { Spinner } from "@/components/ui/spinner";
import { AirportGateCard } from "@/features/airport/components/airport-gate-card";
import { useQueue, useOpenGate } from "@/features/airport/hooks/use-airport";

export function AirportAdminQueueSummary() {
  const { data: queue, isLoading, error } = useQueue();
  const { mutate: openGate, isPending: isOpening } = useOpenGate();
  const [openingType, setOpeningType] = useState<"EU" | "ALL" | null>(null);

  function handleOpen(gate_type: "EU" | "ALL") {
    setOpeningType(gate_type);
    openGate({ gate_type }, { onSettled: () => setOpeningType(null) });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <IconAlertCircle
            size={16}
            className="mt-0.5 shrink-0 text-destructive"
          />
          <p>{error?.message ?? "Queue state could not be loaded."}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="airport-queue-summary" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-medium">
          Departure queues
        </span>
        <span data-testid="queue-total" className="text-xs text-muted-foreground">
          {queue.total_queued + 1} total
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {queue.gates.map((gate) => (
          <div data-testid={`gate-row-${gate.gate_id}`} key={gate.gate_id}>
            <AirportGateCard gate={gate} isAdmin />
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          data-testid="open-gate-eu"
          disabled={isOpening}
          onClick={() => handleOpen("EU")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-400"
        >
          <IconPlus size={12} />
          {openingType === "EU" ? "Opening…" : "Open EU gate"}
        </button>
        <button
          data-testid="open-gate-all"
          disabled={isOpening}
          onClick={() => handleOpen("ALL")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-400"
        >
          <IconPlus size={12} />
          {openingType === "ALL" ? "Opening…" : "Open ALL gate"}
        </button>
      </div>
    </div>
  );
}