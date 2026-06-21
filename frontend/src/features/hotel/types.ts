import { z } from "zod";

export const ROOM_TYPES = ["STANDARD", "DELUXE", "SUITE"] as const;

export const RoomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const ROOM_MAX_GUESTS: Record<RoomType, number> = {
  STANDARD: 2,
  DELUXE: 3,
  SUITE: 4,
};

export const ROOM_PRICE_PER_NIGHT: Record<RoomType, number> = {
  STANDARD: 100,
  DELUXE: 200,
  SUITE: 400,
};

export const ReservationStatusSchema = z.enum(["CONFIRMED", "CANCELLED"]);
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  type: RoomTypeSchema,
  capacity: z.number().int(),
  price_per_night: z.number().int(),
  current_guests: z.number().int(),
});

export const RoomsResponseSchema = z.object({
  rooms: z.array(RoomSchema),
});

export const ReservationSchema = z.object({
  id: z.string(),
  guest_id: z.string(),
  room_id: z.string(),
  room_type: RoomTypeSchema,
  guest_count: z.number().int(),
  check_in_day: z.number().int(),
  check_out_day: z.number().int(),
  status: ReservationStatusSchema,
});

export const PostReservationRequestSchema = z.object({
  guest_id: z.string(),
  room_type: RoomTypeSchema,
  guest_count: z.number().int().min(1),
  check_in_day: z.number().int().min(0),
  check_out_day: z.number().int().min(1),
});

export const CancelReservationResponseSchema = z.object({
  id: z.string(),
  status: z.literal("CANCELLED"),
});

export type Room = z.infer<typeof RoomSchema>;
export type RoomsResponse = z.infer<typeof RoomsResponseSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type PostReservationRequest = z.infer<
  typeof PostReservationRequestSchema
>;
export type CancelReservationResponse = z.infer<
  typeof CancelReservationResponseSchema
>;
