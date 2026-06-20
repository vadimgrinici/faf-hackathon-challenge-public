import { z } from "zod";

export const ArrivalStatusValue = z.enum(["queued", "processing", "processed"]);
export type ArrivalStatusValue = z.infer<typeof ArrivalStatusValue>;

export const PostArrivalRequestSchema = z.object({
  guest_id: z.string(),
  name: z.string(),
  surname: z.string(),
  age: z.number().int().positive(),
  passport_type: z.enum(["EU", "non-EU"]),
  priority: z.enum(["standard", "fast"]),
  disability: z.boolean(),
});

export const PostArrivalResponseSchema = z.object({
  guest_id: z.string(),
  gate: z.string(),
  position: z.number().int(),
  queue_size: z.number().int(),
  queued_at: z.number(),
});

export const ArrivalStatusSchema = z.object({
  guest_id: z.string(),
  status: ArrivalStatusValue,
  gate: z.string(),
  position: z.number().int().nullable(),
  queued_at: z.number(),
  processed_at: z.number().nullable(),
  wait_time_seconds: z.number().nullable(),
});

export const QueuedGuestSchema = z.object({
  guest_id: z.string(),
  name: z.string(),
  surname: z.string(),
  passport_type: z.enum(["EU", "non-EU"]),
  priority: z.enum(["standard", "fast"]),
  disability: z.boolean(),
  status: ArrivalStatusValue,
  gate: z.string(),
  position: z.number().int(),
  queued_at: z.number(),
  wait_time_seconds: z.number(),
});

export const GateStatusSchema = z.object({
  gate_id: z.string(),
  gate_type: z.enum(["EU", "ALL"]),
  queue_size: z.number().int(),
  queue: z.array(QueuedGuestSchema),
});

export const QueueResponseSchema = z.object({
  gates: z.array(GateStatusSchema),
  total_queued: z.number().int(),
  current_game_time: z.number(),
});

export type PostArrivalRequest = z.infer<typeof PostArrivalRequestSchema>;
export type PostArrivalResponse = z.infer<typeof PostArrivalResponseSchema>;
export type ArrivalStatus = z.infer<typeof ArrivalStatusSchema>;
export type QueueResponse = z.infer<typeof QueueResponseSchema>;
export type GateStatus = z.infer<typeof GateStatusSchema>;
