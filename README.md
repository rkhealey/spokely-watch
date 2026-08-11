# Spokely Watch

Admin dashboard for monitoring the AI pipeline: jobs processed, audio hours
processed, per-job processing time, and cost (RunPod GPU spend + Anthropic
token spend) — plus pipeline errors.

The pipeline itself runs in a separate NestJS service, which pushes one event
per completed job to this app's ingestion API. See
[`docs/nestjs-integration.md`](./docs/nestjs-integration.md) for the
NestJS-side module (added once the ingestion API exists).

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS
- Prisma + Postgres (Supabase)
- Deployed on Vercel

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

See `.env.example` for the environment variables each part of the app needs
(database connection, ingestion API key, dashboard login).
