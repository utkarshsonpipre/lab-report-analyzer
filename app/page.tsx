"use client";

import { useState } from "react";
import type { Classified } from "@/lib/classify";

type Result = {
  patient: { sex: string; birth_date: string | null; report_date: string | null; age: number | null };
  lab: string | null;
  source_language: string;
  summary: { total: number; optimal: number; normal: number; out_of_range: number };
  results: Classified[];
};

const LABEL = { optimal: "Optimal", normal: "Normal", out_of_range: "Out of range" } as const;

const fmtRange = (r: { low?: number; high?: number } | null) => {
  if (!r) return "—";
  if (r.low !== undefined && r.high !== undefined) return `${r.low} – ${r.high}`;
  if (r.low !== undefined) return `> ${r.low}`;
  if (r.high !== undefined) return `< ${r.high}`;
  return "—";
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setData(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const groups = data ? Object.groupBy(data.results, (r) => r.category) : {};

  return (
    <main>
      <h1>Lab Report Analyzer</h1>
      <p className="muted">
        Upload a lab report PDF in any language. Biomarkers are extracted, translated to standard English names and
        units, and classified by the patient&apos;s age and sex.
      </p>

      <form onSubmit={submit} className="upload">
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="submit" disabled={!file || busy}>
          {busy ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <section className="patient">
            <div><span className="muted">Sex</span> {data.patient.sex}</div>
            <div><span className="muted">Age</span> {data.patient.age ?? "unknown"}</div>
            <div><span className="muted">Report date</span> {data.patient.report_date ?? "—"}</div>
            <div><span className="muted">Lab</span> {data.lab ?? "—"}</div>
            <div><span className="muted">Source language</span> {data.source_language}</div>
          </section>

          <section className="summary">
            <span className="badge optimal">{data.summary.optimal} optimal</span>
            <span className="badge normal">{data.summary.normal} normal</span>
            <span className="badge out_of_range">{data.summary.out_of_range} out of range</span>
          </section>

          {Object.entries(groups).map(([category, rows]) => (
            <section key={category}>
              <h2>{category}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Biomarker</th>
                    <th>Value</th>
                    <th>Unit</th>
                    <th>Reference</th>
                    <th>Optimal</th>
                    <th>Status</th>
                    <th>Original</th>
                  </tr>
                </thead>
                <tbody>
                  {rows!.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.value ?? r.value_text}</td>
                      <td>{r.unit}</td>
                      <td title={r.basis}>{fmtRange(r.applied_range)}</td>
                      <td>{fmtRange(r.optimal_range)}</td>
                      <td>
                        <span className={`badge ${r.classification}`}>{LABEL[r.classification]}</span>
                      </td>
                      <td className="muted">
                        {r.original_name}: {r.original_value} {r.original_unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <details>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </details>
        </>
      )}
    </main>
  );
}
