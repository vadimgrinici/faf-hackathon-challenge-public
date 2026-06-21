import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postReservation } from "@/features/hotel/api/hotel-client";
import { HOTEL_KEYS } from "@/features/hotel/query-keys";
import {
  ReservationFormSchema,
  formToRequest,
  type ReservationFormValues,
} from "@/features/hotel/schemas/reservation-form-schema";
import { useSessionStore } from "@/stores/session-store";
import type { Reservation } from "@/features/hotel/types";
import { getCurrentSimulationDay, simulationDayToDate } from "@/lib/simulation-time";

export function useReservationForm() {
  const guest = useSessionStore((s) => s.guest);
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);

  const form = useForm<ReservationFormValues>({
    resolver: zodResolver(ReservationFormSchema),
    defaultValues: {
      room_type: "STANDARD",
      guest_count: 1,
      check_in_date: simulationDayToDate(getCurrentSimulationDay()),
      check_out_date: simulationDayToDate(getCurrentSimulationDay() + 1),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ReservationFormValues) => {
      if (!guest) return Promise.reject(new Error("No active session"));
      return postReservation(formToRequest(values, guest.id));
    },
    onSuccess: (reservation) => {
      setConfirmed(reservation);
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
    form,
    onSubmit: form.handleSubmit((values) => mutation.mutate(values)),
    confirmed,
    resetConfirmed: () => setConfirmed(null),
    isSubmitting: mutation.isPending,
  };
}