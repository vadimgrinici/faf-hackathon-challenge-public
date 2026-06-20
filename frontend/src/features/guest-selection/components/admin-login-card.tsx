import { zodResolver } from "@hookform/resolvers/zod";
import { IconShieldLock } from "@tabler/icons-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAdmin } from "@/features/auth/api/auth-client";
import { useSessionStore } from "@/stores/session-store";
import { toast } from "sonner";

interface AdminLoginCardProps {
  onLogin: (token: string) => void;
}

const AdminLoginSchema = z.object({
  passcode: z.string().trim().min(1, "Enter the admin passcode."),
});

type AdminLoginValues = z.infer<typeof AdminLoginSchema>;

export function AdminLoginCard({ onLogin }: AdminLoginCardProps) {
  const setAuthToken = useSessionStore((state) => state.setAuthToken);
  const form = useForm<AdminLoginValues>({
    resolver: zodResolver(AdminLoginSchema),
    defaultValues: { passcode: "" },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: AdminLoginValues) {
    setIsSubmitting(true);
    try {
      const result = await loginAdmin({ passcode: values.passcode });
      setAuthToken(result.token);
      onLogin(result.token);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Admin login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const error = form.formState.errors.passcode?.message;

  return (
    <Card className="group relative flex h-full overflow-hidden border-2 bg-card/95 shadow-lg">
      <CardHeader className="relative">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 rotate-[-3deg] border-4 border-secondary bg-primary text-primary-foreground shadow-md">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <IconShieldLock size={28} />
            </AvatarFallback>
          </Avatar>
        </div>
        <div>
          <CardTitle className="font-display text-2xl font-semibold text-foreground">
            Admin
          </CardTitle>
          <p className="font-medium text-muted-foreground">Observer mode</p>
        </div>
      </CardHeader>

      <CardContent className="relative">
        <form
          id="admin-login-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          className="grid gap-3"
        >
          <div className="rounded-lg border border-dashed border-primary/30 bg-accent/50 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="admin-passcode" className="text-xs font-semibold">
                Admin passcode
              </Label>
              <Input
                id="admin-passcode"
                data-testid="admin-passcode"
                type="password"
                placeholder="Enter passcode"
                autoComplete="off"
                aria-invalid={!!error}
                {...form.register("passcode", {
                  onChange: () => form.clearErrors("passcode"),
                })}
              />
            </div>
          </div>

          {error && (
            <p data-testid="admin-login-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </CardContent>

      <CardFooter className="relative mt-auto">
        <Button
          data-testid="admin-submit"
          className="w-full"
          type="submit"
          form="admin-login-form"
          disabled={isSubmitting}
        >
          Enter as admin
        </Button>
      </CardFooter>
    </Card>
  );
}
