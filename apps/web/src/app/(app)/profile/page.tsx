import { ProfileForm } from "@/components/profile-form";

export default function ProfilePage() {
  // Auth + onboarding gating handled by the (app) layout.
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-2 text-muted-foreground">
        This is what powers your showcase. Keep it current.
      </p>
      <div className="mt-8">
        <ProfileForm />
      </div>
    </div>
  );
}
