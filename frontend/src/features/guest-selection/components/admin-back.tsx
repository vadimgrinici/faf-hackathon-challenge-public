import { Button } from "@/components/ui/button";
import { AdminLoginCard } from "@/features/guest-selection/components/admin-login-card";

interface AdminBackProps {
  onLogin: (passcode: string) => void;
  onFlip: () => void;
}

export function AdminBack({ onLogin, onFlip }: AdminBackProps) {
  return (
    <div className="relative flex min-h-[40rem] items-center justify-center p-6">
      <Button
        variant="pill"
        size="sm"
        className="absolute top-6 right-6 z-10 bg-background/95 text-primary shadow-sm hover:bg-background"
        onClick={onFlip}
      >
        Back
      </Button>

      <div className="w-full max-w-xl rounded-2xl bg-background/95 p-6">
        <div className="mb-5 space-y-2">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-primary md:text-6xl">
            Admin access
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            Enter observer mode without selecting a guest.
          </p>
        </div>

        <AdminLoginCard onLogin={onLogin} />
      </div>
    </div>
  );
}
