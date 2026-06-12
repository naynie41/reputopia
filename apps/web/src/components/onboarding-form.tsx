"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { onboardingInputSchema, type OnboardingInput } from "@sr/core";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CHOICES = [
  {
    value: "PRACTITIONER",
    title: "Practitioner",
    description: "Practice live roleplays, get AI scoring, and build a showcase portfolio.",
  },
  {
    value: "RECRUITER_MANAGER",
    title: "Recruiter / Manager",
    description: "Create an organization to discover and review candidates by skill.",
  },
] as const;

export function OnboardingForm() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingInputSchema),
    defaultValues: { choice: "PRACTITIONER", organizationName: "" },
  });

  const choice = useWatch({ control: form.control, name: "choice" });

  const completeOnboarding = useMutation(
    trpc.profile.completeOnboarding.mutationOptions({
      onSuccess: () => router.push("/profile"),
      onError: (err) => form.setError("root", { message: err.message }),
    }),
  );

  const onSubmit = form.handleSubmit((values) => completeOnboarding.mutate(values));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {CHOICES.map((c) => {
          const selected = choice === c.value;
          return (
            <label key={c.value} className="cursor-pointer">
              <input
                type="radio"
                value={c.value}
                className="sr-only"
                {...form.register("choice")}
              />
              <Card className={selected ? "border-primary ring-2 ring-ring" : ""}>
                <CardHeader>
                  <CardTitle>{c.title}</CardTitle>
                  <CardDescription>{c.description}</CardDescription>
                </CardHeader>
              </Card>
            </label>
          );
        })}
      </div>

      {choice === "RECRUITER_MANAGER" && (
        <div className="space-y-2">
          <Label htmlFor="organizationName">Organization name</Label>
          <Input
            id="organizationName"
            placeholder="Acme Talent"
            {...form.register("organizationName")}
          />
          {form.formState.errors.organizationName && (
            <p className="text-sm text-destructive">
              {form.formState.errors.organizationName.message}
            </p>
          )}
        </div>
      )}

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
      )}

      <Button type="submit" disabled={completeOnboarding.isPending}>
        {completeOnboarding.isPending ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
