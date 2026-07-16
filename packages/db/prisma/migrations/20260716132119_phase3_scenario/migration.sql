-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "track" "Track" NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "sellerObjective" TEXT NOT NULL,
    "counterpartPersona" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "rubricWeights" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_slug_key" ON "Scenario"("slug");

-- CreateIndex
CREATE INDEX "Scenario_track_difficulty_idx" ON "Scenario"("track", "difficulty");

-- CreateIndex
CREATE INDEX "Scenario_active_idx" ON "Scenario"("active");
