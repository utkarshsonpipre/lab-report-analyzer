// Adult reference table in standard (conventional US) units.
// `normal` is the reference interval; `optimal` is a tighter, evidence-informed
// "healthy" band. Sex-specific entries use {male, female}. Age-dependent entries
// use a function of age (years). Omitted low/high means unbounded on that side.
//
// Sources: Mayo Clinic Laboratories, ARUP, ESC/EAS 2019 lipid guidelines,
// ADA 2024 (HbA1c), KDIGO (eGFR), Endocrine Society (vitamin D, thyroid).
// ponytail: single flat table, adults only; pediatric values fall back to lab range.

export type Sex = "male" | "female" | "unknown";
export type Range = { low?: number; high?: number };
type BySex = { male: Range; female: Range };
type RangeSpec = Range | BySex | ((sex: Sex, age: number) => Range);

export type RefEntry = {
  name: string; // standard English name
  unit: string; // standard unit
  normal: RangeSpec;
  optimal?: RangeSpec;
};

export const REFERENCE: Record<string, RefEntry> = {
  // --- Hematology ---
  rbc: { name: "Red blood cells", unit: "x10^6/µL", normal: { male: { low: 4.5, high: 5.9 }, female: { low: 4.0, high: 5.2 } } },
  hemoglobin: { name: "Hemoglobin", unit: "g/dL", normal: { male: { low: 13.5, high: 17.5 }, female: { low: 12.0, high: 15.5 } }, optimal: { male: { low: 14.0, high: 16.5 }, female: { low: 12.5, high: 15.0 } } },
  hematocrit: { name: "Hematocrit", unit: "%", normal: { male: { low: 41, high: 53 }, female: { low: 36, high: 46 } }, optimal: { male: { low: 42, high: 50 }, female: { low: 37, high: 44 } } },
  mcv: { name: "Mean corpuscular volume (MCV)", unit: "fL", normal: { low: 80, high: 100 }, optimal: { low: 85, high: 95 } },
  mch: { name: "Mean corpuscular hemoglobin (MCH)", unit: "pg", normal: { low: 27, high: 33 } },
  mchc: { name: "Mean corpuscular hemoglobin concentration (MCHC)", unit: "g/dL", normal: { low: 32, high: 36 } },
  rdw: { name: "Red cell distribution width (RDW)", unit: "%", normal: { low: 11.5, high: 14.5 }, optimal: { low: 11.5, high: 13.5 } },
  wbc: { name: "White blood cells", unit: "x10^3/µL", normal: { low: 4.0, high: 11.0 }, optimal: { low: 4.5, high: 8.0 } },
  neutrophils_pct: { name: "Neutrophils %", unit: "%", normal: { low: 40, high: 75 } },
  lymphocytes_pct: { name: "Lymphocytes %", unit: "%", normal: { low: 20, high: 45 } },
  monocytes_pct: { name: "Monocytes %", unit: "%", normal: { low: 2, high: 10 } },
  eosinophils_pct: { name: "Eosinophils %", unit: "%", normal: { low: 0, high: 6 } },
  basophils_pct: { name: "Basophils %", unit: "%", normal: { low: 0, high: 2 } },
  neutrophils_abs: { name: "Neutrophils (absolute)", unit: "x10^3/µL", normal: { low: 1.5, high: 7.5 }, optimal: { low: 2.0, high: 5.0 } },
  lymphocytes_abs: { name: "Lymphocytes (absolute)", unit: "x10^3/µL", normal: { low: 1.0, high: 4.0 }, optimal: { low: 1.3, high: 3.0 } },
  monocytes_abs: { name: "Monocytes (absolute)", unit: "x10^3/µL", normal: { low: 0.2, high: 0.9 } },
  eosinophils_abs: { name: "Eosinophils (absolute)", unit: "x10^3/µL", normal: { low: 0, high: 0.5 } },
  basophils_abs: { name: "Basophils (absolute)", unit: "x10^3/µL", normal: { low: 0, high: 0.2 } },
  platelets: { name: "Platelets", unit: "x10^3/µL", normal: { low: 150, high: 400 }, optimal: { low: 175, high: 300 } },
  mpv: { name: "Mean platelet volume (MPV)", unit: "fL", normal: { low: 7.5, high: 12.0 } },
  esr: { name: "Erythrocyte sedimentation rate (ESR)", unit: "mm/h", normal: (sex, age) => ({ low: 0, high: sex === "female" ? (age + 10) / 2 : age / 2 }) },

  // --- Glucose metabolism ---
  glucose_fasting: { name: "Glucose (fasting)", unit: "mg/dL", normal: { low: 70, high: 99 }, optimal: { low: 72, high: 90 } },
  hba1c: { name: "Hemoglobin A1c (NGSP)", unit: "%", normal: { low: 4.0, high: 5.6 }, optimal: { low: 4.5, high: 5.3 } },
  hba1c_ifcc: { name: "Hemoglobin A1c (IFCC)", unit: "mmol/mol", normal: { low: 20, high: 38 }, optimal: { low: 26, high: 34 } },
  insulin_fasting: { name: "Insulin (fasting)", unit: "µIU/mL", normal: { low: 2, high: 25 }, optimal: { low: 2, high: 8 } },

  // --- Lipids ---
  total_cholesterol: { name: "Total cholesterol", unit: "mg/dL", normal: { low: 120, high: 199 }, optimal: { low: 150, high: 180 } },
  hdl_cholesterol: { name: "HDL cholesterol", unit: "mg/dL", normal: { male: { low: 40 }, female: { low: 50 } }, optimal: { low: 60 } },
  ldl_cholesterol: { name: "LDL cholesterol", unit: "mg/dL", normal: { high: 115 }, optimal: { low: 50, high: 99 } },
  non_hdl_cholesterol: { name: "Non-HDL cholesterol", unit: "mg/dL", normal: { high: 129 }, optimal: { high: 99 } },
  triglycerides: { name: "Triglycerides", unit: "mg/dL", normal: { high: 149 }, optimal: { high: 99 } },
  lipoprotein_a: { name: "Lipoprotein(a)", unit: "mg/dL", normal: { high: 30 }, optimal: { high: 14 } },
  apolipoprotein_b: { name: "Apolipoprotein B", unit: "mg/dL", normal: { low: 60, high: 130 }, optimal: { low: 60, high: 89 } },
  apolipoprotein_a1: { name: "Apolipoprotein A1", unit: "mg/dL", normal: { male: { low: 110, high: 180 }, female: { low: 125, high: 215 } } },

  // --- Proteins / inflammation ---
  total_protein: { name: "Total protein", unit: "g/dL", normal: { low: 6.4, high: 8.3 }, optimal: { low: 6.8, high: 7.8 } },
  albumin: { name: "Albumin", unit: "g/dL", normal: { low: 3.5, high: 5.2 }, optimal: { low: 4.0, high: 5.0 } },
  crp: { name: "C-reactive protein (CRP)", unit: "mg/L", normal: { high: 5 }, optimal: { high: 1 } },
  ferritin: { name: "Ferritin", unit: "ng/mL", normal: { male: { low: 30, high: 400 }, female: { low: 15, high: 150 } }, optimal: { male: { low: 50, high: 150 }, female: { low: 30, high: 100 } } },

  // --- Kidney ---
  uric_acid: { name: "Uric acid", unit: "mg/dL", normal: { male: { low: 3.5, high: 7.2 }, female: { low: 2.6, high: 6.0 } }, optimal: { male: { low: 3.5, high: 6.0 }, female: { low: 2.6, high: 5.5 } } },
  creatinine: { name: "Creatinine", unit: "mg/dL", normal: { male: { low: 0.7, high: 1.2 }, female: { low: 0.5, high: 1.0 } }, optimal: { male: { low: 0.8, high: 1.1 }, female: { low: 0.6, high: 0.9 } } },
  egfr: { name: "eGFR", unit: "mL/min/1.73m²", normal: { low: 60 }, optimal: { low: 90 } },
  urea: { name: "Urea", unit: "mg/dL", normal: { low: 15, high: 45 } },
  bun: { name: "Blood urea nitrogen (BUN)", unit: "mg/dL", normal: { low: 7, high: 20 } },

  // --- Liver ---
  ast: { name: "AST", unit: "U/L", normal: { male: { low: 10, high: 40 }, female: { low: 10, high: 32 } }, optimal: { low: 10, high: 26 } },
  alt: { name: "ALT", unit: "U/L", normal: { male: { low: 10, high: 40 }, female: { low: 7, high: 35 } }, optimal: { male: { low: 10, high: 30 }, female: { low: 7, high: 25 } } },
  ggt: { name: "GGT", unit: "U/L", normal: { male: { low: 8, high: 55 }, female: { low: 5, high: 38 } }, optimal: { male: { high: 30 }, female: { high: 22 } } },
  alkaline_phosphatase: { name: "Alkaline phosphatase", unit: "U/L", normal: { low: 40, high: 130 } },
  total_bilirubin: { name: "Total bilirubin", unit: "mg/dL", normal: { low: 0.2, high: 1.2 } },

  // --- Electrolytes / minerals ---
  sodium: { name: "Sodium", unit: "mmol/L", normal: { low: 135, high: 145 }, optimal: { low: 137, high: 143 } },
  potassium: { name: "Potassium", unit: "mmol/L", normal: { low: 3.5, high: 5.1 }, optimal: { low: 4.0, high: 4.8 } },
  chloride: { name: "Chloride", unit: "mmol/L", normal: { low: 98, high: 107 } },
  calcium: { name: "Calcium", unit: "mg/dL", normal: { low: 8.6, high: 10.3 }, optimal: { low: 9.0, high: 10.0 } },
  magnesium: { name: "Magnesium", unit: "mg/dL", normal: { low: 1.7, high: 2.4 }, optimal: { low: 2.0, high: 2.4 } },
  phosphate: { name: "Phosphate", unit: "mg/dL", normal: { low: 2.5, high: 4.5 } },
  iron: { name: "Iron", unit: "µg/dL", normal: { male: { low: 60, high: 170 }, female: { low: 50, high: 170 } } },
  transferrin_saturation: { name: "Transferrin saturation", unit: "%", normal: { low: 20, high: 45 }, optimal: { low: 25, high: 40 } },

  // --- Vitamins / hormones ---
  vitamin_d: { name: "Vitamin D (25-OH)", unit: "ng/mL", normal: { low: 30, high: 100 }, optimal: { low: 40, high: 60 } },
  vitamin_b12: { name: "Vitamin B12", unit: "pg/mL", normal: { low: 200, high: 900 }, optimal: { low: 400, high: 900 } },
  folate: { name: "Folate", unit: "ng/mL", normal: { low: 3, high: 20 }, optimal: { low: 7, high: 20 } },
  tsh: { name: "TSH", unit: "mIU/L", normal: { low: 0.4, high: 4.0 }, optimal: { low: 0.5, high: 2.5 } },
  free_t4: { name: "Free T4", unit: "ng/dL", normal: { low: 0.8, high: 1.8 } },
  free_t3: { name: "Free T3", unit: "pg/mL", normal: { low: 2.3, high: 4.2 } },
  testosterone_total: { name: "Testosterone (total)", unit: "ng/dL", normal: { male: { low: 300, high: 1000 }, female: { low: 15, high: 70 } }, optimal: { male: { low: 500, high: 900 }, female: { low: 20, high: 60 } } },
};

export function resolve(spec: RangeSpec | undefined, sex: Sex, age: number): Range | undefined {
  if (!spec) return undefined;
  if (typeof spec === "function") return spec(sex, age);
  if ("male" in spec || "female" in spec) {
    const s = spec as BySex;
    if (sex === "male") return s.male;
    if (sex === "female") return s.female;
    // unknown sex: widest band so we never wrongly flag
    return {
      low: Math.min(s.male.low ?? -Infinity, s.female.low ?? -Infinity),
      high: Math.max(s.male.high ?? Infinity, s.female.high ?? Infinity),
    };
  }
  return spec as Range;
}
