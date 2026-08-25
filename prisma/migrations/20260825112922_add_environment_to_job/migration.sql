-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('PRODUCTION', 'DEVELOPMENT');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "environment" "Environment" NOT NULL DEFAULT 'PRODUCTION';

-- CreateIndex
CREATE INDEX "Job_environment_idx" ON "Job"("environment");
