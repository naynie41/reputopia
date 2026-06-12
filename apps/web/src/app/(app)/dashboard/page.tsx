import Link from "next/link";
import { getServerApi } from "@/trpc/server";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TRACKS = [
  { key: "discovery", label: "Discovery" },
  { key: "objection", label: "Objection" },
  { key: "dmSetting", label: "DM / Cold" },
  { key: "closing", label: "Closing" },
] as const;

const ROLE_LABEL: Record<string, string> = {
  PRACTITIONER: "Practitioner",
  RECRUITER: "Recruiter",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

export default async function DashboardPage() {
  // Auth + onboarding gating handled by the (app) layout.
  const api = await getServerApi();
  const me = await api.profile.current();
  if (!me) return null;

  const isRecruiterSide =
    me.role === "RECRUITER" || me.role === "MANAGER" || me.role === "ADMIN";
  const org = me.memberships[0]?.organization;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar src={me.avatarUrl} name={me.name ?? me.email} className="size-14" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome{me.name ? `, ${me.name}` : ""}.
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="brand">{ROLE_LABEL[me.role] ?? me.role}</Badge>
              {org && <Badge variant="secondary">{org.name}</Badge>}
            </div>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/profile">Edit profile</Link>
        </Button>
      </div>

      {isRecruiterSide ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Candidate discovery</CardTitle>
            <CardDescription>
              Filtering candidates by skill score arrives in a later phase. Your organization
              {org ? ` (${org.name})` : ""} is set up and ready.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">Skill profile</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TRACKS.map((t) => (
              <Card key={t.key}>
                <CardContent className="pt-6">
                  <div className="text-3xl font-semibold">{me.skillProfile?.[t.key] ?? 0}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{t.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Scores stay at 0 until live calls + AI scoring ship in later phases.
          </p>
        </section>
      )}
    </div>
  );
}
