-- CreateEnum
CREATE TYPE "PreferredRole" AS ENUM ('SELLER', 'COUNTERPART', 'EITHER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'MATCHED', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "MatchRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "track" "Track" NOT NULL,
    "scenarioId" TEXT,
    "preferredRole" "PreferredRole" NOT NULL DEFAULT 'EITHER',
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchRequest_userId_status_idx" ON "MatchRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "MatchRequest_status_idx" ON "MatchRequest"("status");

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
