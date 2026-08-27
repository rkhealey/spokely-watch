// Single source of truth for pipeline step names. Used to validate `step` on
// /api/ingest/jobs/steps and the step-linking fields on /api/ingest/jobs
// (RunpodUsage.task, AnthropicUsage.step, JobError.step) — keeping them all
// constrained to the same list is what makes the cost-by-step join reliable.
export const PIPELINE_STEPS = [
  "download_audio",
  "transcription",
  "diarization",
  "merge",
  "load_transcript",
  "prepare_transcript",
  "llm",
  "validate",
  "persist",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];
