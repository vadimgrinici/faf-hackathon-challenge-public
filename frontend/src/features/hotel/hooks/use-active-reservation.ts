import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getReservationByGuest,
  cancelReservation,
} from "@/features/hotel/api/hotel-client";
import { useSessionStore } from "@/stores/session-store";
import { HOTEL_KEYS } from "@/features/hotel/query-keys";

export function useActiveReservation() {
  const guest = useSessionStore((s) => s.guest);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...HOTEL_KEYS.RESERVATION, guest?.id],
    queryFn: () => getReservationByGuest(guest!.id),
    enabled: !!guest,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (id: string) => cancelReservation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...HOTEL_KEYS.RESERVATION],
      });
      queryClient.invalidateQueries({ queryKey: [...HOTEL_KEYS.ROOMS] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return {
    reservation: query.isError ? null : query.data ?? null,
    isLoading: query.isLoading,
    cancel: (id: string) => mutation.mutate(id),
    isCancelling: mutation.isPending,
  };
}