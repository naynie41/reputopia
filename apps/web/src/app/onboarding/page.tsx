import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApi } from "@/trpc/server";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const api = await getServerApi();
  const me = await api.profile.current();
  if (me?.onboardedAt) redirect("/dashboard");

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome — how will you use Sales Roleplay?
      </h1>
      <p className="mt-2 text-muted-foreground">Pick your track. You can refine your profile next.</p>
      <div className="mt-8">
        <OnboardingForm />
      </div>
    </section>
  );
}
