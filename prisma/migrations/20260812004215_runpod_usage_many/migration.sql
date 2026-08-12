-- DropIndex
DROP INDEX "RunpodUsage_jobId_key";

-- AlterTable
ALTER TABLE "RunpodUsage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "task" TEXT;

-- CreateIndex
CREATE INDEX "RunpodUsage_jobId_idx" ON "RunpodUsage"("jobId");
