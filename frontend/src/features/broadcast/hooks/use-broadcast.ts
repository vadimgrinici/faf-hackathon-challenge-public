import { useEffect, useRef, useState } from "react";

import { env } from "@/config/env";
import { useEventsStore } from "@/stores/events-store";
import { BroadcastEventSchema } from "@/types/broadcast";
import type { ConnectionStatus } from "@/types/broadcast";
import { api } from "@/lib/api-client";
import { AnnouncementResponseSchema } from "@/types/broadcast";

export function publishAnnouncement(message: string, sender?: string) {
  return api.admin.post(AnnouncementResponseSchema, "/admin/announcements", {
    message,
    sender,
  });
}

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

const BROADCAST_PATH = "/api/broadcast/events";

export function useBroadcast() {
  const [status, setStatus] = useState<ConnectionStatus>(() => {
    if (!env.gatewayUrl) {
      console.warn(
        "[useBroadcast] VITE_GATEWAY_URL is not set — SSE connections skipped"
      );
      return "dropped";
    }
    return "reconnecting";
  });
  const connectionRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(BACKOFF_INITIAL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    if (!env.gatewayUrl) return;

    activeRef.current = true;

    function connect() {
      if (!activeRef.current) return;

      const base = env.gatewayUrl.replace(/\/+$/, "");
      const es = new EventSource(`${base}${BROADCAST_PATH}`);
      connectionRef.current = es;

      es.onopen = () => {
        backoffRef.current = BACKOFF_INITIAL_MS;
        setStatus("connected");
      };

      es.onmessage = (e: MessageEvent) => {
        try {
          const parsed = BroadcastEventSchema.safeParse(
            JSON.parse(e.data as string)
          );
          if (parsed.success) {
            useEventsStore
              .getState()
              .ingestEvent(parsed.data, { mirrorToResortWide: true });
          }
        } catch {
          // malformed payload
        }
      };

      es.onerror = () => {
        es.close();
        connectionRef.current = null;
        setStatus("reconnecting");

        if (!activeRef.current) return;

        const current = backoffRef.current;
        backoffRef.current = Math.min(current * 2, BACKOFF_MAX_MS);

        timerRef.current = setTimeout(() => {
          if (activeRef.current) connect();
        }, current);
      };
    }

    connect();

    // EventSource is closed automatically on unmount
  }, []);

  return { status };
}
