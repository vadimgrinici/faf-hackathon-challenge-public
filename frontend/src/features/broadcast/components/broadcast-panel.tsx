import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventLog } from "@/features/map/components/event-log";
import { ZoneId } from "@/features/map/constants";
import { getZone } from "@/features/map/zone-registry";
import { useEventsStore } from "@/stores/events-store";
import { useIsAdmin } from "@/stores/session-selectors";
import { publishAnnouncement } from "@/features/broadcast/hooks/use-broadcast";

const { channel } = getZone(ZoneId.Broadcast);
const PUBLIC_EVENT_PREFIX = "public.";

export function BroadcastPanel() {
  const isAdmin = useIsAdmin();
  const events = useEventsStore((s) => s.events[channel]);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const visible = isAdmin
    ? events
    : events.filter((event) =>
        event.event_type.startsWith(PUBLIC_EVENT_PREFIX)
      );

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await publishAnnouncement(trimmed, "Resort Admin");
      setMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish announcement");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex gap-2">
          <Input
            placeholder="Announce something to the whole resort..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            {sending ? "Sending..." : "Announce"}
          </Button>
        </div>
      )}
      <EventLog events={visible} />
    </div>
  );
}