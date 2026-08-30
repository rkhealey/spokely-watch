// Single source of truth for pipeline step names. Used to validate `step` on
// /api/ingest/jobs/steps and the step-linking fields on /api/ingest/jobs
// (RunpodUsage.task, AnthropicUsage.step, JobError.step) — keeping them all
// constrained to the same list is what makes the cost-by-step join reliable.
//
// Deliberately limited to the steps that incur cost (RunPod GPU or Anthropic
// tokens) — the rest of the pipeline (download_audio, merge, load_transcript,
// prepare_transcript, validate, persist) still runs, it's just not reported
// here. Each additional tracked step is two more ingest calls per job
// (STARTED + SUCCEEDED), and that call volume is what was driving connection
// pressure against Postgres — so this list stays intentionally narrow.
export const PIPELINE_STEPS = ["transcription", "diarization", "llm"] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];
