# Lab Report Analyzer

Upload a lab report PDF (any language), get every biomarker extracted, translated to a standard English name and unit, and classified as **optimal**, **normal**, or **out of range** for the patient's age and sex.

Built for the sample Spanish Eurofins report (`challenge.pdf`: male, born 1978, hemogram + glucose + lipids + proteins + renal panel).

## How it works

```
PDF ──► POST /api/analyze ──► Claude (PDF input + structured output) ──► classify() ──► JSON ──► table UI
```

1. **Extraction + standardization (AI).** The PDF is sent to the Claude API as a native document block. A Zod schema (`output_config.format`) forces a typed JSON response: patient sex/birth date/report date and one row per biomarker with the canonical key, English name, value converted to the standard unit, the lab's own reference interval (also converted), and the lab's abnormal marker. The model is given the canonical key list from `lib/reference.ts` so names and units converge on one vocabulary (g/L → g/dL, decimal commas, `x10³/mm³` → `x10^3/µL`, etc.).
2. **Classification (deterministic code, not AI).** `lib/classify.ts` decides the status so results are reproducible and auditable:
   - Age is computed from birth date and report date.
   - If the biomarker has an entry in the adult reference table and the patient is ≥18: outside the sex-specific (or age-formula, e.g. ESR) normal interval → **out of range**; inside the tighter optimal band → **optimal**; otherwise **normal**.
   - Else, if the lab printed a reference interval: inside → normal, outside → out of range.
   - Else (qualitative results like blood group): the lab's own abnormal marker decides.
   - Every row carries `basis` (`reference_table` / `lab_range` / `lab_flag`) plus the applied and optimal ranges, so the UI can show why a result got its label.
3. **UI.** Single page: file input, summary counts, per-category tables with colored badges, original name/value/unit for traceability, raw JSON for download.

Reference intervals and optimal bands come from Mayo Clinic Laboratories, ARUP, ESC/EAS 2019 lipid guidelines, ADA 2024, KDIGO and Endocrine Society guidance. The table is deliberately a flat file so a clinician can review and edit it.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Self-check for the classifier (no API key needed):

```bash
node --experimental-strip-types lib/classify.test.mjs
```

## Stack

- Next.js 16 (App Router, one route handler, one client page), TypeScript
- `@anthropic-ai/sdk` with `messages.parse` + `zodOutputFormat` (model `claude-opus-5-5`)
- No database, no PDF parsing library: the PDF goes straight to the model, which handles layout, tables, and scanned pages.

## Cloud resources for deployment

Deployment was not required; this is what I would use.

| Concern | Choice | Why |
|---|---|---|
| Hosting / compute | **Vercel** (Fluid Compute, Node.js runtime) | Zero-config Next.js hosting; the 300 s default function timeout covers slow multi-page extractions. |
| Secrets | Vercel environment variables (`ANTHROPIC_API_KEY`) | Never shipped to the client; the route handler runs server-side only. |
| Large uploads | **Vercel Blob** client-side upload, route reads the blob URL | Function request bodies cap at 4.5 MB; the current direct upload is capped at 4 MB for that reason. |
| AI | Anthropic Claude API, or **Vercel AI Gateway** in front of it | Gateway adds spend limits, observability and provider fallback without code changes. |
| Persistence (if reports must be stored) | Neon Postgres via Vercel Marketplace + Blob for the original PDFs | Encrypt at rest; PHI means a BAA with every vendor and EU region pinning for Spanish patients. |
| Async / batch | Vercel Queues or Anthropic Message Batches | For bulk back-office processing at 50 % token cost. |
| Observability | Vercel runtime logs + AI Gateway traces | Token spend per report, failures, latency. |

Equivalent AWS layout: S3 (PDF upload via presigned URL) → Lambda or ECS Fargate running the Next.js app → Secrets Manager → RDS Postgres → CloudWatch.

## Limits and next steps

- Reference table covers ~65 common adult analytes; anything else falls back to the lab's printed interval. Pediatric reports always use the lab interval.
- One model call per report; a 2-page report takes roughly 20–40 s.
- Not medical advice; classification bands are population reference values, not a clinical interpretation.
