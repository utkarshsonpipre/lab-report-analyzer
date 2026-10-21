# Lab Report Analyzer

Upload a lab report PDF (any language), get every biomarker extracted, translated to a standard English name and unit, and classified as **optimal**, **normal**, or **out of range** for the patient's age and sex.

Verified on the sample Spanish Eurofins report (male, born 1978, hemogram + glucose + lipids + proteins + renal panel): all 37 results extracted, units converted (g/L → g/dL, x10³/mm³ → x10^3/µL), 3 flagged out of range (total, LDL and non-HDL cholesterol), 14 optimal, 20 normal.

## How it works

```
PDF ──► POST /api/analyze ──► unpdf (text) ──► Groq LLM (JSON schema) ──► classify() ──► JSON ──► table UI
```

1. **Text extraction.** `unpdf` (pdf.js) pulls the text layer server-side. Scanned PDFs without a text layer are rejected with a clear error (no OCR step yet).
2. **Extraction + standardization (AI).** The text goes to the Groq API (`qwen/qwen3.8-27b` by default, OpenAI-compatible endpoint, plain `fetch`) with `response_format: json_schema` generated from a Zod schema. The model returns patient sex / birth date / report date and one row per biomarker: canonical key, value converted to the standard unit, the lab's own reference interval (also converted), the lab's abnormal marker, and the original name/value/unit for traceability. The canonical key list comes from `lib/reference.ts`, so names and units converge on one vocabulary. For known analytes the English name and unit are then taken from the table, not from the model.
3. **Classification (deterministic code, not AI).** `lib/classify.ts` decides the status so results are reproducible and auditable:
   - Age is computed from birth date and report date.
   - If the biomarker has an entry in the adult reference table and the patient is ≥18: outside the sex-specific (or age-formula, e.g. ESR) normal interval → **out of range**; inside the tighter optimal band → **optimal**; otherwise **normal**.
   - Else, if the lab printed a reference interval: inside → normal, outside → out of range.
   - Else (qualitative results like blood group, Rh): the lab's own abnormal marker decides.
   - Every row carries `basis` (`reference_table` / `lab_range` / `lab_flag`) plus the applied and optimal ranges, so the UI can show why a result got its label.
4. **UI.** Single page: file input, summary counts, per-category tables with colored badges, original name/value/unit next to each row, raw JSON.

Reference intervals and optimal bands come from Mayo Clinic Laboratories, ARUP, ESC/EAS 2019 lipid guidelines, ADA 2024, KDIGO and Endocrine Society guidance. The table is deliberately a flat file so a clinician can review and edit it.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your GROQ_API_KEY (free at console.groq.com)
npm run dev                  # http://localhost:3000
```

Self-check for the classifier (no API key needed):

```bash
node --experimental-strip-types lib/classify.test.mjs
```

API only:

```bash
curl -F "file=@report.pdf;type=application/pdf" http://localhost:3000/api/analyze
```

## Stack

- Next.js 16 (App Router, one route handler, one client page), TypeScript
- `unpdf` for PDF text, `zod` for the output schema and validation
- Groq API via `fetch`. Set `GROQ_MODEL` to switch models; `openai/gpt-oss-120b` also tested and works.
- No database.

Groq free tier allows 8 000 tokens/minute; one two-page report uses ~6 500, so the route waits and retries once on a 429. Paid tier removes this.

## Cloud resources for deployment

Deployment was not required; this is what I would use.

| Concern | Choice | Why |
|---|---|---|
| Hosting / compute | **Vercel** (Fluid Compute, Node.js runtime) | Zero-config Next.js hosting; the 300 s default function timeout covers slow extractions and rate-limit waits. |
| Secrets | Vercel environment variables (`GROQ_API_KEY`) | Never shipped to the client; the route handler runs server-side only. |
| Large uploads | **Vercel Blob** client-side upload, route reads the blob URL | Function request bodies cap at 4.5 MB; the current direct upload is capped at 4 MB for that reason. |
| AI | Groq (paid tier for real throughput), or **Vercel AI Gateway** in front | Gateway adds spend limits, observability and provider fallback (e.g. to Claude for PDFs with tables or scans) without code changes. |
| OCR for scanned reports | Google Document AI or AWS Textract, or a vision model (Llama 4 on Groq) | Current build needs a text layer. |
| Persistence (if reports must be stored) | Neon Postgres via Vercel Marketplace + Blob for the original PDFs | PHI: encrypt at rest, BAA with every vendor, EU region pinning for Spanish patients. |
| Async / batch | Vercel Queues | Bulk back-office processing without hitting per-minute token limits. |
| Observability | Vercel runtime logs + AI Gateway traces | Token spend per report, failures, latency. |

Equivalent AWS layout: S3 (PDF upload via presigned URL) → Lambda or ECS Fargate running the Next.js app → Secrets Manager → RDS Postgres → CloudWatch.

## Limits and next steps

- Reference table covers ~65 common adult analytes; anything else falls back to the lab's printed interval. Pediatric reports always use the lab interval.
- Text-layer PDFs only; no OCR.
- One model call per report, roughly 10–30 s on the free tier.
- Not medical advice; classification bands are population reference values, not a clinical interpretation.
