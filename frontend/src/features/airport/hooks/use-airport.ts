import { useQuery } from "@tanstack/react-query";
import {
  getArrivalStatus,
  getQueue,
} from "@/features/airport/api/airport-client";
import { AIRPORT_KEYS } from "@/features/airport/query-keys";
import { useSessionStore } from "@/stores/session-store";
import { POLL_INTERVAL_MS } from "@/lib/polling";

const ARRIVAL_COMPLETE_STATUS = "processed";

type ArrivalStatusQuery = {
  state: {
    data?: { status: string };
  };
};

function arrivalRefetchInterval(query: ArrivalStatusQuery): number | false {
  return query.state.data?.status === ARRIVAL_COMPLETE_STATUS
    ? false
    : POLL_INTERVAL_MS;
}

export function useLanded(): boolean {
  const arrivalGuestId = useSessionStore((s) => s.arrivalGuestId);
  const { data } = useArrivalStatus(arrivalGuestId);
  return data?.status === ARRIVAL_COMPLETE_STATUS;
}

export function useArrivalStatus(guestId: string | null) {
  return useQuery({
    queryKey: [...AIRPORT_KEYS.ARRIVAL, guestId],
    queryFn: () => getArrivalStatus(guestId!),
    enabled: guestId !== null,
    refetchInterval: arrivalRefetchInterval,
  });
}

export function useQueue() {
  return useQuery({
    queryKey: [...AIRPORT_KEYS.QUEUE],
    queryFn: getQueue,
    refetchInterval: POLL_INTERVAL_MS,
  });
}
