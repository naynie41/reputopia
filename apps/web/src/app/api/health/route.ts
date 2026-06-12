import { NextResponse } from "next/server";
import { prisma } from "@sr/db";

/**
 * Liveness/readiness probe. Phase 0 checks DB connectivity; later phases extend this
 * with Redis + a lightweight LiveKit/Anthropic reachability ping (DevOps handover §10).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
