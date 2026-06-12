import { describe, expect, it } from "vitest";
import { onboardingInputSchema } from "@sr/core";

describe("onboardingInputSchema", () => {
  it("accepts the practitioner path with an empty/absent org name", () => {
    expect(onboardingInputSchema.safeParse({ choice: "PRACTITIONER", organizationName: "" }).success).toBe(true);
    expect(onboardingInputSchema.safeParse({ choice: "PRACTITIONER" }).success).toBe(true);
  });

  it("requires a 2+ char org name for the recruiter/manager path", () => {
    expect(onboardingInputSchema.safeParse({ choice: "RECRUITER_MANAGER", organizationName: "" }).success).toBe(false);
    expect(onboardingInputSchema.safeParse({ choice: "RECRUITER_MANAGER", organizationName: "A" }).success).toBe(false);
    expect(onboardingInputSchema.safeParse({ choice: "RECRUITER_MANAGER", organizationName: "Acme" }).success).toBe(true);
  });
});
