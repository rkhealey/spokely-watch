-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'TRANSCRIBED';

-- CreateIndex
CREATE UNIQUE INDEX "AnthropicUsage_jobId_step_key" ON "AnthropicUsage"("jobId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "RunpodUsage_jobId_task_key" ON "RunpodUsage"("jobId", "task");

