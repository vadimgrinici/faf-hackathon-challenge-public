import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { guests } from "@/data/guests";
import { GuestCard } from "@/features/guest-selection/components/guest-card";
import { SelectionPanel } from "@/features/guest-selection/components/selection-panel";
import type { GuestProfile } from "@/types/guest";

interface GuestSelectionFrontProps {
  onSelectGuest: (guest: GuestProfile) => void;
  onFlip: () => void;
  isSelectingGuest?: boolean;
}

export function GuestSelectionFront({
  onSelectGuest,
  onFlip,
  isSelectingGuest,
}: GuestSelectionFrontProps) {
  return (
    <SelectionPanel
      title="Welcome to Purrlington!"
      description="Choose a guest passport, then enter the resort as that character."
      flipLabel="Admin"
      onFlip={onFlip}
    >
      <Carousel opts={{ align: "start", loop: true }} className="w-full px-6">
        <CarouselContent className="-ml-4">
          {guests.map((guest) => (
            <CarouselItem
              key={guest.id}
              className="p-4 sm:basis-1/2 lg:basis-1/3"
            >
              <GuestCard
                guest={guest}
                onSelect={onSelectGuest}
                disabled={isSelectingGuest}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="mt-4 flex items-center justify-center gap-3">
          <CarouselPrevious className="static translate-y-0" />
          <CarouselNext className="static translate-y-0" />
        </div>
      </Carousel>
    </SelectionPanel>
  );
}
