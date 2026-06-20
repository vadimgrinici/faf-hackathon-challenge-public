import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInitials } from "@/lib/guest";
import type { GuestProfile } from "@/types/guest";

interface GuestCardProps {
  guest: GuestProfile;
  onSelect: (guest: GuestProfile) => void;
  disabled?: boolean;
}

export function GuestCard({ guest, onSelect, disabled }: GuestCardProps) {
  const initials = getInitials(guest);

  return (
    <Card
      data-testid={`guest-card-${guest.id}`}
      className="group relative flex h-full overflow-hidden border-2 bg-card/95 shadow-lg transition duration-200 hover:-translate-y-1 hover:rotate-[0.35deg] hover:border-primary/50 hover:shadow-xl"
    >
      <div className="absolute top-4 right-4 size-20 rounded-full border-[10px] border-secondary/35 transition-transform duration-200 group-hover:scale-110" />

      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-4">
          <Avatar className="size-16 rotate-[-3deg] border-4 border-secondary bg-primary text-xl font-bold text-primary-foreground shadow-md">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Badge
            variant={guest.priority === "fast" ? "default" : "secondary"}
            className="rounded-full px-3 py-1 font-semibold tracking-wide uppercase"
          >
            {guest.priority === "fast" ? "Fast pass" : "Standard"}
          </Badge>
        </div>
        <div>
          <CardTitle className="font-display text-2xl font-semibold text-foreground">
            {guest.name} {guest.surname}
          </CardTitle>
          <CardDescription className="font-medium">
            Age {guest.age} · Passport {guest.passport}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="relative">
        <div className="rounded-lg border border-dashed border-primary/30 bg-accent/50 p-4">
          <p className="text-sm leading-6 font-medium text-accent-foreground">
            {guest.personality}
          </p>
        </div>
        {guest.disability ? (
          <p className="mt-3 text-xs font-semibold tracking-wide text-primary uppercase">
            Accessible route requested
          </p>
        ) : (
          <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Standard route
          </p>
        )}
      </CardContent>

      <CardFooter className="relative mt-auto">
        <Button
          data-testid="guest-confirm"
          className="w-full"
          disabled={disabled}
          onClick={() => onSelect(guest)}
        >
          Choose this guest
        </Button>
      </CardFooter>
    </Card>
  );
}
