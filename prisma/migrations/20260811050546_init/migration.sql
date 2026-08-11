-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "audioDurationSec" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "processingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunpodUsage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "endpointId" TEXT,
    "gpuType" TEXT NOT NULL,
    "executionMs" INTEGER NOT NULL,
    "delayMs" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "RunpodUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnthropicUsage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnthropicUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobError" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "code" TEXT,
    "message" TEXT NOT NULL,
    "stage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_externalId_key" ON "Job"("externalId");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RunpodUsage_jobId_key" ON "RunpodUsage"("jobId");

-- CreateIndex
CREATE INDEX "AnthropicUsage_jobId_idx" ON "AnthropicUsage"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobError_jobId_key" ON "JobError"("jobId");

-- AddForeignKey
ALTER TABLE "RunpodUsage" ADD CONSTRAINT "RunpodUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropicUsage" ADD CONSTRAINT "AnthropicUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobError" ADD CONSTRAINT "JobError_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
