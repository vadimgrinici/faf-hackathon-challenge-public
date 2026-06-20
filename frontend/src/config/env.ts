import { z } from "zod";

const EnvSchema = z.object({
  VITE_GATEWAY_URL: z.string().default(""),
  VITE_MOCK: z.string().default("false"),
  VITE_ADMIN_PASSCODE: z.string().default(""),
  VITE_TRAFFIC_GENERATOR: z.string().default("on"),
  VITE_PARROT_CHAT_COOLDOWN_MS: z.coerce.number().int().positive().catch(30_000),
  VITE_SIMULATION_START_TIME: z.string().default("2026-06-14T09:00:00Z"),
  VITE_GAME_SPEED: z.coerce.number().positive().catch(300),
});

const parsed = EnvSchema.parse(import.meta.env);

export const env = {
  gatewayUrl: parsed.VITE_GATEWAY_URL,
  mock: parsed.VITE_MOCK === "true",
  adminPasscode: parsed.VITE_ADMIN_PASSCODE,
  trafficGeneratorEnabled: parsed.VITE_TRAFFIC_GENERATOR !== "off",
  parrotChatCooldownMs: parsed.VITE_PARROT_CHAT_COOLDOWN_MS,
  simulationStartTime: parsed.VITE_SIMULATION_START_TIME,
  gameSpeed: parsed.VITE_GAME_SPEED,
} as const;
