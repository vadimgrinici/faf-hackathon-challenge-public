export enum EventType {
  AIRPORT_ARRIVAL = "airport.arrival",

  HOTEL_CONFIRM = "hotel.reservaiton_confirmed",
  HOTEL_CANCEL = "hotel.reservation_cancelled",

  BEACH_FULL = "beach.activity_full",

  PUBLIC_ANNOUNCEMENT = "public.announcement",
}

export interface IslandEvent {
  id: string;
  type: EventType;
  timestamp: string;
  source: string;
  payload: unknown;
  channel?: string;
  event_type?: string;
  message?: string;
  sender?: string;
}