import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { REFERENCE } from "@/lib/reference";
import { ageAt, classify, type Extracted } from "@/lib/classify";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel function body limit is 4.5 MB

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
      original_value: z.string(),
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

const SYSTEM = `You extract laboratory results from clinical lab reports in any language.

Rules:
- Extract EVERY biomarker in the report, including qualitative ones (blood group, Rh factor, serology).
- Map each biomarker to one canonical key from the list below when it is the same analyte. Otherwise use key "other" and give a standard English name.
- Convert the value AND the lab's reference range to the canonical standard unit listed (e.g. g/L -> g/dL divide by 10; mmol/L glucose -> mg/dL multiply by 18.016; x10^3/mm³ == x10^3/µL). Keep original value/unit verbatim.
- Decimal commas are decimals ("4,73" -> 4.73). For "<0,2" set value 0.2 and value_text "<0,2".
- Reference ranges: "[ 4,1 - 5,75 ]" -> low 4.1 high 5.75; "< 200" -> low null high 200; "> 40" -> low 40 high null.
- lab_flag: "abnormal" if the lab marked the result (asterisk, H, L, bold, arrow); "normal" if a range is given and it is unmarked; null if no indication.
- Do not include interpretive paragraphs, recommendations or risk-tier notes as biomarkers.
- Dates: convert DD/MM/YYYY or other formats to ISO YYYY-MM-DD. Sex: HOMBRE/Varón/M/Homme/Mann -> male; MUJER/F/Femme/Frau -> female.

Canonical keys (key | name | standard unit):
${KEYS}`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 500 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "Upload a PDF file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF larger than 4 MB" }, { status: 413 });
  }
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
            { type: "text", text: "Extract all biomarkers and patient demographics from this lab report." },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(Report) },
    });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e);
    return Response.json({ error: `Extraction failed: ${msg}` }, { status: 502 });
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return Response.json({ error: "Model did not return a parseable report" }, { status: 502 });
  }

  const report = response.parsed_output;
  const age = ageAt(report.patient.birth_date, report.patient.report_date) ?? report.patient.age;
  const sex = report.patient.sex;

  const results = report.biomarkers.map((b) => {
    const e: Extracted = {
      ...b,
      key: b.key in REFERENCE ? b.key : "other",
      lab_range: b.lab_range ? { low: b.lab_range.low ?? undefined, high: b.lab_range.high ?? undefined } : null,
    };
    return classify(e, sex, age);
  });

  return Response.json({
    patient: { ...report.patient, age },
    lab: report.lab,
    source_language: report.source_language,
    summary: {
      total: results.length,
      optimal: results.filter((r) => r.classification === "optimal").length,
      normal: results.filter((r) => r.classification === "normal").length,
      out_of_range: results.filter((r) => r.classification === "out_of_range").length,
    },
    results,
  });
}
