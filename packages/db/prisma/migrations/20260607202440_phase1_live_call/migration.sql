-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'LIVE', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('NONE', 'RECORDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "sellerId" TEXT NOT NULL,
    "counterpartId" TEXT,
    "videoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingStatus" "RecordingStatus" NOT NULL DEFAULT 'NONE',
    "egressId" TEXT,
    "recordingKey" TEXT,
    "scenarioId" TEXT,
    "scenarioVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_roomId_key" ON "Session"("roomId");

-- CreateIndex
CREATE INDEX "Session_sellerId_idx" ON "Session"("sellerId");

-- CreateIndex
CREATE INDEX "Session_counterpartId_idx" ON "Session"("counterpartId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "RecordingConsent_userId_idx" ON "RecordingConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingConsent_userId_version_key" ON "RecordingConsent"("userId", "version");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_counterpartId_fkey" FOREIGN KEY ("counterpartId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingConsent" ADD CONSTRAINT "RecordingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
