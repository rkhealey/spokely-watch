-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "AnthropicUsage" ADD COLUMN     "step" TEXT;

-- AlterTable
ALTER TABLE "JobError" ADD COLUMN     "step" TEXT;

-- CreateTable
CREATE TABLE "JobStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStep_jobId_idx" ON "JobStep"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobStep_jobId_step_key" ON "JobStep"("jobId", "step");

-- AddForeignKey
ALTER TABLE "JobStep" ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
