import { IconAlertCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { Spinner } from "@/components/ui/spinner";
import { getRooms } from "@/features/hotel/api/hotel-client";
import { HOTEL_KEYS } from "@/features/hotel/query-keys";
import type { Room, RoomType } from "@/features/hotel/types";
import { formatRoomType } from "@/lib/format";
import { POLL_INTERVAL_MS } from "@/lib/polling";
import { cn } from "@/lib/utils";

const ROOM_CONFIG: Record<
  RoomType,
  {
    bgClass: string;
    pillClass: string;
    label: string;
  }
> = {
  STANDARD: {
    label: "Standard",
    pillClass:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    bgClass:
      "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300/70 dark:border-emerald-700/40",
  },
  DELUXE: {
    label: "Deluxe",
    pillClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25",
    bgClass:
      "bg-sky-50/80 dark:bg-sky-950/30 border-sky-300/70 dark:border-sky-700/40",
  },
  SUITE: {
    label: "Suite",
    pillClass:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25",
    bgClass:
      "bg-violet-50/80 dark:bg-violet-950/30 border-violet-300/70 dark:border-violet-700/40",
  },
};

function OccupancyBar({
  current,
  capacity,
}: {
  current: number;
  capacity: number;
}) {
  const pct = capacity > 0 ? Math.min((current / capacity) * 100, 100) : 0;

  return (
    <div data-testid="occupancy-bar" className="flex items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct >= 100
              ? "bg-destructive"
              : pct >= 60
                ? "bg-amber-500"
                : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {current}/{capacity}
      </span>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const config = ROOM_CONFIG[room.type];
  const vacant = room.current_guests === 0;

  return (
    <div
      data-testid={`room-card-${room.id}`}
      className={cn(
        "flex flex-col gap-2.5 rounded-md border p-3.5",
        config.bgClass
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-medium">{room.id}</span>
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                config.pillClass
              )}
            >
              {formatRoomType(room.type)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {room.capacity} guests max · ${room.price_per_night}/night
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
            vacant
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          )}
        >
          {vacant ? "vacant" : "occupied"}
        </span>
      </div>
      <OccupancyBar current={room.current_guests} capacity={room.capacity} />
    </div>
  );
}

export function HotelAdminRoomSummary() {
  const { data, isLoading, error } = useQuery({
    queryKey: [...HOTEL_KEYS.ROOMS],
    queryFn: getRooms,
    refetchInterval: POLL_INTERVAL_MS,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <IconAlertCircle
            size={16}
            className="mt-0.5 shrink-0 text-destructive"
          />
          <p>{error?.message ?? "Room state could not be loaded."}</p>
        </div>
      </div>
    );
  }

  const rooms = data.rooms;
  const occupiedCount = rooms.filter((r) => r.current_guests > 0).length;

  return (
    <div data-testid="room-summary" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-medium">Room occupancy</span>
        <span data-testid="rooms-occupied-count" className="text-xs text-muted-foreground">
          {occupiedCount}/{rooms.length} occupied
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </div>
  );
}
