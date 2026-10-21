import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { REFERENCE } from "@/lib/reference";
import { ageAt, classify, type Extracted } from "@/lib/classify";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel function body limit is 4.5 MB
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

const Range = z.object({ low: z.number().nullable(), high: z.number().nullable() });

const Report = z.object({
  patient: z.object({
    sex: z.enum(["male", "female", "unknown"]),
    birth_date: z.string().nullable().describe("ISO date YYYY-MM-DD"),
    report_date: z.string().nullable().describe("ISO date YYYY-MM-DD; date the report was issued/validated"),
    age: z.number().nullable().describe("Age in years if printed; otherwise null"),
  }),
  lab: z.string().nullable(),
  source_language: z.string(),
  biomarkers: z.array(
    z.object({
      key: z.string().describe("One of the canonical keys, or 'other'"),
      name: z.string().describe("Standard English name"),
      original_name: z.string(),
      value: z.number().nullable().describe("Numeric value converted to the standard unit; null if qualitative"),
      value_text: z.string().describe("Value exactly as printed"),
      unit: z.string().describe("Standard unit after conversion; empty if qualitative"),
      original_unit: z.string(),
      lab_range: Range.nullable().describe("Lab's printed reference interval, converted to the standard unit"),
      lab_flag: z.enum(["normal", "abnormal"]).nullable().describe("Lab's own marker (asterisk, H/L, bold)"),
      category: z.string().describe("Section heading in English, e.g. 'Hematology'"),
    }),
  ),
});

const KEYS = Object.entries(REFERENCE)
  .map(([k, v]) => `${k} | ${v.name} | ${v.unit}`)
  .join("\n");

const SYSTEM = `You extract laboratory results from the text of clinical lab reports in any language. Respond with JSON only.

Rules:
- Extract EVERY biomarker in the report, including qualitative ones (blood group, Rh factor, serology).
- Map each biomarker to one canonical key from the list below when it is the same analyte. Otherwise use key "other" and give a standard English name.
- Convert the value AND the lab's reference range to the canonical standard unit listed (e.g. g/L -> g/dL divide by 10; mmol/L glucose -> mg/dL multiply by 18.016; x10^3/mm³ == x10^3/µL; x106/mm³ means x10^6/mm³ == x10^6/µL). Keep original value/unit verbatim.
- Decimal commas are decimals ("4,73" -> 4.73). For "<0,2" set value 0.2 and value_text "<0,2".
- Reference ranges: "[ 4,1 - 5,75 ]" -> low 4.1 high 5.75; "< 200" -> low null high 200; "> 40" -> low 40 high null.
- lab_flag: "abnormal" if the lab marked the result (asterisk *, H, L, arrow); "normal" if a range is given and it is unmarked; null if no indication. A "ü" or check mark after a name is an accreditation mark, not a flag.
- Do not include interpretive paragraphs, recommendations or risk-tier notes as biomarkers.
- Dates: convert DD/MM/YYYY or other formats to ISO YYYY-MM-DD. Sex: HOMBRE/Varón/M/Homme/Mann -> male; MUJER/F/Femme/Frau -> female.

Canonical keys (key | name | standard unit):
${KEYS}`;

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY is not set on the server" }, { status: 500 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "Upload a PDF file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF larger than 4 MB" }, { status: 413 });
  }

  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch (e) {
    return Response.json({ error: `Could not read PDF: ${String(e)}` }, { status: 400 });
  }
  if (text.trim().length < 50) {
    // ponytail: no OCR; scanned PDFs need a vision model or OCR step
    return Response.json({ error: "PDF has no text layer (scanned image?). OCR is not supported." }, { status: 422 });
  }

  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    max_tokens: 6000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Extract all biomarkers and patient demographics from this lab report:\n\n${text}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "lab_report", schema: z.toJSONSchema(Report) } },
  });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` };
  let res = await fetch(GROQ_URL, { method: "POST", headers, body });
  if (res.status === 429) {
    // ponytail: free tier is 8k tokens/min; one report is ~6.5k. Wait out the window once.
    const wait = Number((await res.text()).match(/try again in ([\d.]+)s/)?.[1] ?? 20);
    await new Promise((r) => setTimeout(r, Math.min(wait, 60) * 1000 + 500));
    res = await fetch(GROQ_URL, { method: "POST", headers, body });
  }
  if (!res.ok) {
    return Response.json({ error: `Groq API ${res.status}: ${(await res.text()).slice(0, 500)}` }, { status: 502 });
  }
  const completion = await res.json();
  const parsed = Report.safeParse(JSON.parse(completion.choices?.[0]?.message?.content ?? "{}"));
  if (!parsed.success) {
    return Response.json({ error: `Model output did not match schema: ${parsed.error.message.slice(0, 500)}` }, { status: 502 });
  }

  const report = parsed.data;
  const age = ageAt(report.patient.birth_date, report.patient.report_date) ?? report.patient.age;
  const sex = report.patient.sex;

  const results = report.biomarkers.map((b) => {
    const ref = REFERENCE[b.key];
    const e: Extracted = {
      ...b,
      key: ref ? b.key : "other",
      // Standard name/unit come from our table, never from the model, for known analytes.
      name: ref?.name ?? b.name,
      unit: ref?.unit ?? (b.value === null ? "" : b.unit),
      lab_range: b.lab_range ? { low: b.lab_range.low ?? undefined, high: b.lab_range.high ?? undefined } : null,
    };
    return classify(e, sex, age);
  });

  return Response.json({
    patient: { ...report.patient, age },
    lab: report.lab,
    source_language: report.source_language,
    model: MODEL,
    summary: {
      total: results.length,
      optimal: results.filter((r) => r.classification === "optimal").length,
      normal: results.filter((r) => r.classification === "normal").length,
      out_of_range: results.filter((r) => r.classification === "out_of_range").length,
    },
    results,
  });
}
