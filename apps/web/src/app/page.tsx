import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { getServerApi } from "@/trpc/server";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    const api = await getServerApi();
    const me = await api.profile.current();
    redirect(me?.onboardedAt ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">Sales Roleplay</span>
        <nav className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Sign up</Button>
            </SignUpButton>
          </Show>
        </nav>
      </header>

      <section className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Prove your sales skills, live.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Match for live roleplay calls, get AI analysis and scoring after every rep, and build a
          showcase portfolio recruiters can trust.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
