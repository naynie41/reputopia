import { RoleplayStart } from "@/components/call/roleplay-start";

export default function RoleplaysPage() {
  // Auth + onboarding gating handled by the (app) layout.
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Roleplays</h1>
      <p className="mt-2 text-muted-foreground">
        Start a live 1:1 practice call. Matchmaking comes later — for now, share the invite link.
      </p>
      <div className="mt-8">
        <RoleplayStart />
      </div>
    </div>
  );
}
