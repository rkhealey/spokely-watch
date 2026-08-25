-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "showId" TEXT,
ADD COLUMN     "showName" TEXT;

-- CreateIndex
CREATE INDEX "Job_showId_idx" ON "Job"("showId");
