import { api } from "@/lib/api-client";
import {
  PostArrivalResponseSchema,
  ArrivalStatusSchema,
  QueueResponseSchema,
  OpenGateResponseSchema,
  CloseGateResponseSchema,
  type PostArrivalRequest,
  type PostArrivalResponse,
  type ArrivalStatus,
  type QueueResponse,
  type OpenGateRequest,
  type OpenGateResponse,
  type CloseGateResponse,
} from "@/features/airport/types";

export function postArrival(
  body: PostArrivalRequest
): Promise<PostArrivalResponse> {
  return api.airport.post(PostArrivalResponseSchema, "/arrivals", body);
}

export function getArrivalStatus(guestId: string): Promise<ArrivalStatus> {
  return api.airport.get(ArrivalStatusSchema, `/arrivals/${guestId}`);
}

export function getQueue(): Promise<QueueResponse> {
  return api.airport.get(QueueResponseSchema, "/queue");
}

export function openGate(body: OpenGateRequest): Promise<OpenGateResponse> {
  return api.airport.post(OpenGateResponseSchema, "/admin/gates", body);
}

export function closeGate(gateId: string): Promise<CloseGateResponse> {
  return api.airport.delete(CloseGateResponseSchema, `/admin/gates/${gateId}`);
}