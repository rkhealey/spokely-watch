import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isoDateString } from "@/lib/zod-helpers";

// One event per step transition (STARTED, then SUCCEEDED or FAILED). Each
// event upserts a single JobStep row keyed on (jobId, step) — this is a
// progress feed, not a log, so later events overwrite the same row rather
// than appending. showId/showName/environment only apply if this is the
// first event seen for externalId and a Job has to be created.
const stepIngestSchema = z.object({
  externalId: z.string().min(1),
  step: z.string().min(1),
  status: z.enum(["STARTED", "SUCCEEDED", "FAILED"]),
  at: isoDateString.optional(),
  showId: z.string().optional(),
  showName: z.string().optional(),
  environment: z.enum(["PRODUCTION", "DEVELOPMENT"]).default("PRODUCTION"),
});

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!process.env.INGEST_API_KEY || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = stepIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }
  const { externalId, step, status, at, showId, showName, environment } = parsed.data;

  const eventAt = at ? new Date(at) : new Date();
  const startedAt = status === "STARTED" ? eventAt : undefined;
  const completedAt = status !== "STARTED" ? eventAt : undefined;

  const jobStep = await db.$transaction(async (tx) => {
    // Only sets fields on create — an existing job's status/show/environment
    // are owned by POST /api/ingest/jobs, not this endpoint, so a step event
    // arriving after job completion can't regress a SUCCEEDED/FAILED job
    // back to PROCESSING.
    const job = await tx.job.upsert({
      where: { externalId },
      create: { externalId, showId, showName, environment, status: "PROCESSING" },
      update: {},
    });

    return tx.jobStep.upsert({
      where: { jobId_step: { jobId: job.id, step } },
      create: { jobId: job.id, step, status, startedAt, completedAt },
      update: { status, startedAt, completedAt },
    });
  });

  return NextResponse.json({ id: jobStep.id, step: jobStep.step, status: jobStep.status });
}
