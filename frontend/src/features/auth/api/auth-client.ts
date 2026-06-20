import { api } from "@/lib/api-client";
import {
  AuthAdminRequestSchema,
  AuthGuestRequestSchema,
  AuthMeResponseSchema,
  AuthTokenResponseSchema,
  type AuthAdminRequest,
  type AuthGuestRequest,
  type AuthMeResponse,
  type AuthTokenResponse,
} from "@/features/auth/types";

export function loginGuest(body: AuthGuestRequest): Promise<AuthTokenResponse> {
  return api.gateway.post(AuthTokenResponseSchema, "/auth/guest", body);
}

export function loginAdmin(body: AuthAdminRequest): Promise<AuthTokenResponse> {
  return api.gateway.post(AuthTokenResponseSchema, "/auth/admin", body);
}

export function getAuthMe(): Promise<AuthMeResponse> {
  return api.gateway.get(AuthMeResponseSchema, "/auth/me");
}

export { AuthAdminRequestSchema, AuthGuestRequestSchema };