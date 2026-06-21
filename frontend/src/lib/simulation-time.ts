import { differenceInDays, startOfDay } from "date-fns";

import { env } from "@/config/env";

const GAME_SPEED = env.gameSpeed;
const anchor = new Date(env.simulationStartTime);

export function getCurrentSimulationDay(): number {
  const elapsedRealSeconds = (Date.now() - anchor.getTime()) / 1000;
  const elapsedGameSeconds = elapsedRealSeconds * GAME_SPEED;
  return Math.floor(elapsedGameSeconds / 86400);
}

export function dateToSimulationDay(date: Date): number {
  return differenceInDays(startOfDay(date), startOfDay(anchor));
}

export function simulationDayToDate(day: number): Date {
  const d = new Date(anchor);
  d.setDate(d.getDate() + day);
  return startOfDay(d);
}