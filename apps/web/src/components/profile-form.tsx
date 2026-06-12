"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXPERIENCE_LEVELS,
  TRACKS,
  practitionerProfileSchema,
  recruiterProfileSchema,
  type PractitionerProfileInput,
  type RecruiterProfileInput,
} from "@sr/core";
import { useTRPC } from "@/trpc/client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TRACK_LABELS: Record<(typeof TRACKS)[number], string> = {
  DM_SETTING: "DM / Cold setting",
  OBJECTION: "Objection handling",
  DISCOVERY: "Discovery",
  CLOSING: "Closing",
};

const EXPERIENCE_LABELS: Record<(typeof EXPERIENCE_LEVELS)[number], string> = {
  STUDENT: "Student",
  JUNIOR: "Junior",
  MID: "Mid",
  SENIOR: "Senior",
  LEAD: "Lead",
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProfileForm() {
  const trpc = useTRPC();
  const meQuery = useQuery(trpc.profile.me.queryOptions());

  if (meQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  }
  if (meQuery.isError || !meQuery.data) {
    return <p className="text-sm text-destructive">Could not load your profile.</p>;
  }

  const me = meQuery.data;
  const isRecruiterSide = me.role === "RECRUITER" || me.role === "MANAGER" || me.role === "ADMIN";

  return isRecruiterSide ? (
    <RecruiterFields
      email={me.email}
      role={me.role}
      organizationName={me.memberships[0]?.organization?.name ?? null}
      defaults={{ name: me.name ?? "", headline: me.headline ?? "" }}
    />
  ) : (
    <PractitionerFields
      email={me.email}
      defaults={{
        name: me.name ?? "",
        headline: me.headline ?? "",
        targetRole: me.targetRole ?? "",
        experienceLevel: me.experienceLevel ?? undefined,
        industries: me.industries ?? [],
        primaryTrack: me.primaryTrack ?? undefined,
        avatarUrl: me.avatarUrl ?? "",
      }}
    />
  );
}

function SavedHint({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="text-sm text-green-600">Saved.</p>;
}

function PractitionerFields({
  email,
  defaults,
}: {
  email: string;
  defaults: PractitionerProfileInput;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<PractitionerProfileInput>({
    resolver: zodResolver(practitionerProfileSchema),
    defaultValues: defaults,
  });

  const update = useMutation(
    trpc.profile.updatePractitionerProfile.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.profile.me.queryKey() }),
      onError: (err) => form.setError("root", { message: err.message }),
    }),
  );

  const onSubmit = form.handleSubmit((values) => update.mutate(values));
  const industries = useWatch({ control: form.control, name: "industries" }) ?? [];
  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" });
  const name = useWatch({ control: form.control, name: "name" });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Avatar src={avatarUrl || null} name={name || email} className="size-16" />
          <div className="flex-1 space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              placeholder="https://…/avatar.png"
              {...form.register("avatarUrl")}
            />
            {form.formState.errors.avatarUrl && (
              <p className="text-sm text-destructive">{form.formState.errors.avatarUrl.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Headline" error={form.formState.errors.headline?.message}>
            <Input placeholder="SDR aiming for AE" {...form.register("headline")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target role" error={form.formState.errors.targetRole?.message}>
              <Input placeholder="AE" {...form.register("targetRole")} />
            </Field>
            <Field label="Experience level">
              <select
                className={selectClass}
                {...form.register("experienceLevel", {
                  setValueAs: (v) => (v === "" ? undefined : v),
                })}
              >
                <option value="">—</option>
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {EXPERIENCE_LABELS[lvl]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Primary track">
            <select
              className={selectClass}
              {...form.register("primaryTrack", {
                setValueAs: (v) => (v === "" ? undefined : v),
              })}
            >
              <option value="">—</option>
              {TRACKS.map((t) => (
                <option key={t} value={t}>
                  {TRACK_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Industries (comma-separated)"
            error={form.formState.errors.industries?.message}
          >
            <Textarea
              defaultValue={defaults.industries.join(", ")}
              placeholder="SaaS, Fintech, Healthcare"
              onChange={(e) =>
                form.setValue(
                  "industries",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  { shouldValidate: true },
                )
              }
            />
            {industries.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {industries.length} industr{industries.length === 1 ? "y" : "ies"}
              </p>
            )}
          </Field>
        </CardContent>
      </Card>

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
        <SavedHint show={update.isSuccess && !form.formState.isDirty} />
      </div>
    </form>
  );
}

function RecruiterFields({
  email,
  role,
  organizationName,
  defaults,
}: {
  email: string;
  role: string;
  organizationName: string | null;
  defaults: RecruiterProfileInput;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<RecruiterProfileInput>({
    resolver: zodResolver(recruiterProfileSchema),
    defaultValues: defaults,
  });

  const update = useMutation(
    trpc.profile.updateRecruiterProfile.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.profile.me.queryKey() }),
      onError: (err) => form.setError("root", { message: err.message }),
    }),
  );

  const onSubmit = form.handleSubmit((values) => update.mutate(values));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Headline" error={form.formState.errors.headline?.message}>
            <Input placeholder="Technical Recruiter @ Acme" {...form.register("headline")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <Input value={role} disabled readOnly />
            </Field>
            <Field label="Organization">
              <Input
                value={organizationName ?? "— (created via Clerk)"}
                disabled
                readOnly
              />
            </Field>
          </div>
          <Field label="Email">
            <Input value={email} disabled readOnly />
          </Field>
        </CardContent>
      </Card>

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
        <SavedHint show={update.isSuccess && !form.formState.isDirty} />
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
