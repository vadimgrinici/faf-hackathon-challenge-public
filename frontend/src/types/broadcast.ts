import { z } from "zod";

export enum ChannelId {
  Airport = "airport",
  Hotel = "hotel",
  Beach = "beach",
  Parrot = "parrot",
  Broadcast = "broadcast",
  ResortWide = "resort-wide",
}

export type ConnectionStatus = "connected" | "dropped" | "reconnecting";

export const BroadcastEventSchema = z.object({
  id: z.string(),
  channel: z.enum(ChannelId),
  event_type: z.string(),
  message: z.string(),
  sender: z.string(),
  guest_id: z.string().optional(),
  guest_name: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type BroadcastEvent = z.infer<typeof BroadcastEventSchema>;

export const AnnouncementResponseSchema = z.object({
  success: z.boolean(),
});
export type AnnouncementResponse = z.infer<typeof AnnouncementResponseSchema>;