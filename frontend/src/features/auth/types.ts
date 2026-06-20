import { z } from "zod";

export const AuthGuestRequestSchema = z.object({
  guest_id: z.string().trim().min(1),
});

export const AuthAdminRequestSchema = z.object({
  passcode: z.string().trim().min(1),
});

export const AuthTokenResponseSchema = z.object({
  token: z.string(),
});

export const AuthMeResponseSchema = z.union([
  z.object({
    role: z.literal("admin"),
  }),
  z.object({
    role: z.literal("guest"),
    guest_id: z.string(),
  }),
]);

export type AuthGuestRequest = z.infer<typeof AuthGuestRequestSchema>;
export type AuthAdminRequest = z.infer<typeof AuthAdminRequestSchema>;
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;