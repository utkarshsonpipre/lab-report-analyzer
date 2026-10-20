import { REFERENCE, resolve, type Range, type Sex } from "./reference.ts";

export type Classification = "optimal" | "normal" | "out_of_range";

export type Extracted = {
  key: string; // canonical key from REFERENCE, or "other"
  name: string; // standard English name
  original_name: string;
  value: number | null; // numeric value in standard unit (null if qualitative)
  value_text: string; // as printed, e.g. "<0,2" or "Positivo"
  unit: string; // standard unit (empty for qualitative)
  original_value: string;
  original_unit: string;
  lab_range: Range | null; // lab's own reference interval, converted to standard unit
  lab_flag: "normal" | "abnormal" | null; // lab's own marking (e.g. asterisk), if any
  category: string;
};

export type Classified = Extracted & {
  classification: Classification;
  basis: "reference_table" | "lab_range" | "lab_flag";
  applied_range: Range | null;
  optimal_range: Range | null;
};

const inRange = (v: number, r: Range) =>
  (r.low === undefined || v >= r.low) && (r.high === undefined || v <= r.high);

export function classify(b: Extracted, sex: Sex, age: number | null): Classified {
  const ref = REFERENCE[b.key];
  const adult = age === null || age >= 18;

  // 1. Our age/sex-aware table (adults only; pediatric ranges differ too much).
  if (ref && adult && b.value !== null) {
    const normal = resolve(ref.normal, sex, age ?? 40)!;
    const optimal = resolve(ref.optimal, sex, age ?? 40) ?? null;
    const classification: Classification = !inRange(b.value, normal)
      ? "out_of_range"
      : optimal && inRange(b.value, optimal)
        ? "optimal"
        : "normal";
    return { ...b, classification, basis: "reference_table", applied_range: normal, optimal_range: optimal };
  }
  // 2. Lab's own printed interval.
  if (b.lab_range && b.value !== null) {
    return {
      ...b,
      classification: inRange(b.value, b.lab_range) ? "normal" : "out_of_range",
      basis: "lab_range",
      applied_range: b.lab_range,
      optimal_range: null,
    };
  }
  // 3. Qualitative or unranged: trust the lab's abnormal marker.
  return {
    ...b,
    classification: b.lab_flag === "abnormal" ? "out_of_range" : "normal",
    basis: "lab_flag",
    applied_range: null,
    optimal_range: null,
  };
}

export function ageAt(birth: string | null, at: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  const d = at ? new Date(at) : new Date();
  if (isNaN(b.getTime()) || isNaN(d.getTime())) return null;
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}
