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
- Prisma + Postgres (Neon)
- Deployed on Vercel

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

See `.env.example` for the environment variables each part of the app needs
(database connection, ingestion API key, dashboard login).

## Database

1. Create a Postgres database in [Neon](https://neon.com) (or use an existing
   project).
2. Copy the connection string (Dashboard → Connect → your branch/database)
   into `DATABASE_URL` in your `.env`.
3. Run the migration and seed the database with sample data:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

`pnpm db:seed` wipes and regenerates ~30 days of realistic sample jobs —
useful for building/testing the dashboard before real data is flowing in from
the pipeline. Re-run it anytime to reset local data.
