"use client";

import { useRef, useState } from "react";
import type { Classification, Classified } from "@/lib/classify";

type Result = {
  patient: { sex: string; birth_date: string | null; report_date: string | null; age: number | null };
  lab: string | null;
  source_language: string;
  model: string;
  summary: { total: number; optimal: number; normal: number; out_of_range: number };
  results: Classified[];
};
type Range = { low?: number; high?: number } | null;
type Filter = "all" | Classification;

const LABEL: Record<Classification, string> = { optimal: "Optimal", normal: "Normal", out_of_range: "Out of range" };
const ORDER: Record<Classification, number> = { out_of_range: 0, normal: 1, optimal: 2 };

const fmtRange = (r: Range) => {
  if (!r) return "—";
  if (r.low !== undefined && r.high !== undefined) return `${r.low} – ${r.high}`;
  if (r.low !== undefined) return `≥ ${r.low}`;
  if (r.high !== undefined) return `≤ ${r.high}`;
  return "—";
};

/** Horizontal bar: normal band, optimal band, value marker. */
function RangeBar({ value, normal, optimal }: { value: number; normal: Range; optimal: Range }) {
  if (!normal) return null;
  const pts = [normal.low, normal.high, optimal?.low, optimal?.high, value].filter((n): n is number => n !== undefined);
  let lo = Math.min(...pts), hi = Math.max(...pts);
  const pad = (hi - lo) * 0.25 || Math.abs(value) * 0.25 || 1;
  lo -= pad; hi += pad;
  const pct = (n: number) => `${(((n - lo) / (hi - lo)) * 100).toFixed(1)}%`;
  const band = (r: Range, cls: string) =>
    r && (
      <div
        className={`band ${cls}`}
        style={{ left: pct(r.low ?? lo), width: `calc(${pct(r.high ?? hi)} - ${pct(r.low ?? lo)})` }}
      />
    );
  return (
    <div className="rangebar" aria-hidden>
      {band(normal, "normal")}
      {band(optimal, "optimal")}
      <div className="marker" style={{ left: pct(value) }} />
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Result | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf") return setError("Please choose a PDF file.");
    setError(null);
    setFile(f);
  }

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setData(null);
    setFilter("all");
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

  const rows = data?.results.filter((r) => filter === "all" || r.classification === filter) ?? [];
  const groups = Object.groupBy(rows, (r) => r.category);

  return (
    <main>
      <header className="hero">
        <h1>Lab Report Analyzer</h1>
        <p>
          Drop a lab report PDF in any language. Every biomarker is extracted, translated to a standard English name and
          unit, and classified for the patient&apos;s age and sex.
        </p>
      </header>

      <section
        className={`dropzone ${drag ? "drag" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      >
        <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="dz-icon">📄</div>
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="muted">{(file.size / 1024).toFixed(0)} KB · click to change</span>
          </>
        ) : (
          <>
            <strong>Drop a PDF here or click to browse</strong>
            <span className="muted">Text-layer PDFs up to 4 MB</span>
          </>
        )}
      </section>

      <div className="actions">
        <button className="primary" onClick={analyze} disabled={!file || busy}>
          {busy ? <><span className="spinner" /> Analyzing…</> : "Analyze report"}
        </button>
        {data && (
          <a
            className="secondary"
            href={`data:application/json,${encodeURIComponent(JSON.stringify(data, null, 2))}`}
            download="lab-report.json"
          >
            Download JSON
          </a>
        )}
      </div>

      {busy && <p className="muted hint">Reading the PDF and extracting biomarkers. Usually 10–30 seconds.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {data && (
        <>
          <section className="patient">
            <Chip label="Sex" value={data.patient.sex} />
            <Chip label="Age" value={data.patient.age !== null ? `${data.patient.age} y` : "unknown"} />
            <Chip label="Born" value={data.patient.birth_date ?? "—"} />
            <Chip label="Report" value={data.patient.report_date ?? "—"} />
            <Chip label="Lab" value={data.lab ?? "—"} />
            <Chip label="Language" value={data.source_language} />
          </section>

          <section className="tiles">
            <Tile n={data.summary.total} label="biomarkers" active={filter === "all"} onClick={() => setFilter("all")} />
            <Tile n={data.summary.out_of_range} label="out of range" cls="out_of_range" active={filter === "out_of_range"} onClick={() => setFilter("out_of_range")} />
            <Tile n={data.summary.normal} label="normal" cls="normal" active={filter === "normal"} onClick={() => setFilter("normal")} />
            <Tile n={data.summary.optimal} label="optimal" cls="optimal" active={filter === "optimal"} onClick={() => setFilter("optimal")} />
          </section>

          {rows.length === 0 && <p className="muted">Nothing in this category.</p>}

          {Object.entries(groups).map(([category, list]) => (
            <section key={category} className="group">
              <h2>{category}</h2>
              <div className="rows">
                {list!
                  .slice()
                  .sort((a, b) => ORDER[a.classification] - ORDER[b.classification])
                  .map((r, i) => (
                    <div key={i} className={`row ${r.classification}`}>
                      <div className="cell name">
                        <div>{r.name}</div>
                        <div className="muted small">{r.original_name}</div>
                      </div>
                      <div className="cell value">
                        <span className="num">{r.value ?? r.value_text}</span> <span className="muted">{r.unit}</span>
                        {r.value !== null && String(r.value) !== r.value_text.replace(",", ".") && (
                          <div className="muted small">as printed: {r.value_text} {r.original_unit}</div>
                        )}
                      </div>
                      <div className="cell bar">
                        {r.value !== null && <RangeBar value={r.value} normal={r.applied_range} optimal={r.optimal_range} />}
                        <div className="muted small">
                          Ref {fmtRange(r.applied_range)}
                          {r.optimal_range && <> · Optimal {fmtRange(r.optimal_range)}</>}
                          <span className="basis"> · {r.basis.replace("_", " ")}</span>
                        </div>
                      </div>
                      <div className="cell status">
                        <span className={`badge ${r.classification}`}>{LABEL[r.classification]}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}

          <p className="muted small footnote">
            Classification uses sex- and age-specific adult reference intervals; where none exists, the laboratory&apos;s
            printed interval is used. Not medical advice. Extracted with {data.model}.
          </p>
        </>
      )}
    </main>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="chip">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Tile({ n, label, cls = "", active, onClick }: { n: number; label: string; cls?: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`tile ${cls} ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}>
      <span className="n">{n}</span>
      <span className="l">{label}</span>
    </button>
  );
}
