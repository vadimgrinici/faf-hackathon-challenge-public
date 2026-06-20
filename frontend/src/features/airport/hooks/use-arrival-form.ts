import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postArrival } from "@/features/airport/api/airport-client";
import {
  ArrivalFormSchema,
  guestToArrivalForm,
  type ArrivalFormValues,
} from "@/features/airport/schemas/arrival-form-schema";
import { useSessionStore } from "@/stores/session-store";
import { AIRPORT_KEYS } from "@/features/airport/query-keys";

export function useArrivalForm() {
  const guest = useSessionStore((s) => s.guest);
  const setArrivalGuestId = useSessionStore((s) => s.setArrivalGuestId);
  const queryClient = useQueryClient();

  const form = useForm<ArrivalFormValues>({
    resolver: zodResolver(ArrivalFormSchema),
    defaultValues: guest ? guestToArrivalForm(guest) : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: ArrivalFormValues) => postArrival(values),
    onSuccess: (response) => {
      setArrivalGuestId(response.guest_id);
      queryClient.invalidateQueries({
        queryKey: [...AIRPORT_KEYS.ARRIVAL, response.guest_id],
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (guest) {
      form.reset(guestToArrivalForm(guest));
    }
  }, [form, guest]);

  return {
    form,
    onSubmit: form.handleSubmit((values) => mutation.mutate(values)),
    result: mutation.data ?? null,
    isSubmitting: mutation.isPending,
  };
}
