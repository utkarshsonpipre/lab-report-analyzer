// Run: node --experimental-strip-types lib/classify.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, ageAt } from "./classify.ts";

const base = { original_name: "", value_text: "", original_value: "", original_unit: "", lab_flag: null, category: "" };
const b = (key, value, extra = {}) => ({ ...base, key, name: key, value, unit: "", lab_range: null, ...extra });

test("sex-specific table ranges", () => {
  assert.equal(classify(b("hemoglobin", 13.9), "male", 48).classification, "normal"); // in [13.5,17.5], below optimal 14
  assert.equal(classify(b("hemoglobin", 13.9), "female", 48).classification, "optimal");
  assert.equal(classify(b("hemoglobin", 13.0), "male", 48).classification, "out_of_range");
  assert.equal(classify(b("hdl_cholesterol", 49), "male", 48).classification, "normal");
  assert.equal(classify(b("hdl_cholesterol", 49), "female", 48).classification, "out_of_range");
});

test("one-sided ranges and optimal", () => {
  assert.equal(classify(b("ldl_cholesterol", 149), "male", 48).classification, "out_of_range");
  assert.equal(classify(b("triglycerides", 60), "male", 48).classification, "optimal");
  assert.equal(classify(b("crp", 0.2), "male", 48).classification, "optimal");
});

test("age-dependent range", () => {
  assert.equal(classify(b("esr", 20), "male", 48).classification, "normal"); // limit 24
  assert.equal(classify(b("esr", 20), "male", 30).classification, "out_of_range"); // limit 15
});

test("pediatric and unknown keys fall back to lab range, then lab flag", () => {
  const r = classify(b("hemoglobin", 11.5, { lab_range: { low: 11, high: 14 } }), "male", 10);
  assert.equal(r.basis, "lab_range");
  assert.equal(r.classification, "normal");
  assert.equal(classify(b("other", 7, { lab_range: { low: 1, high: 5 } }), "male", 48).classification, "out_of_range");
  assert.equal(classify(b("other", null, { lab_flag: "abnormal" }), "male", 48).classification, "out_of_range");
  assert.equal(classify(b("other", null), "male", 48).classification, "normal");
});

test("ageAt", () => {
  assert.equal(ageAt("1978-02-13", "2026-02-23"), 48);
  assert.equal(ageAt("1978-02-13", "2026-02-12"), 47);
  assert.equal(ageAt(null, null), null);
});
