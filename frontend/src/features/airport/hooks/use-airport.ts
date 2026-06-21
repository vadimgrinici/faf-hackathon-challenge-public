import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getArrivalStatus,
  getQueue,
  openGate,
  closeGate,
} from "@/features/airport/api/airport-client";
import { AIRPORT_KEYS } from "@/features/airport/query-keys";
import { useSessionStore } from "@/stores/session-store";
import { POLL_INTERVAL_MS } from "@/lib/polling";
import { toast } from "sonner";
import type { OpenGateRequest } from "@/features/airport/types";

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
  const guest = useSessionStore((s) => s.guest);
  const { data } = useArrivalStatus(guest?.id ?? null);
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

export function useOpenGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OpenGateRequest) => openGate(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...AIRPORT_KEYS.QUEUE] });
      toast.success(`Gate ${data.gate_id} opened`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useCloseGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gateId: string) => closeGate(gateId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...AIRPORT_KEYS.QUEUE] });
      toast.success(data.message);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}