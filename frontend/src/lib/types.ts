export type Status = "red" | "yellow" | "green";
export type Level = "red" | "yellow" | "info";

export interface User {
  id: number;
  email: string;
  name: string;
  language: Lang;
  auth_provider: string;
  email_verified: boolean;
  profile_incomplete: boolean;
  is_demo: boolean;
  ai_enabled: boolean;
  ai_engine: string | null;
}
export type Lang = "en" | "hi" | "ta";

export interface Profile {
  id: number;
  name: string;
  relation: string;
  sex: "F" | "M";
  dob: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  conditions: string[];
  is_primary: boolean;
  color: string;
  counts: { reports: number; results: number; medicines: number };
  bmi_category?: string | null;
  blood_group?: string | null;
  allergies?: string[];
  emergency_name?: string | null;
  emergency_phone?: string | null;
  abha?: { number: string | null; address: string | null; linked_at: string | null; mock: boolean } | null;
  profile_incomplete?: boolean;
  is_demo?: boolean;
}

export interface Urgent {
  level: string;
  message: string;
  reasons: string[];
  call: { label: string; number: string }[];
}

export interface InputView {
  code: string;
  name: string;
  value: number;
  unit: string;
  date: string;
  lab?: string | null;
  result_id?: number | null;
  report_id?: number | null;
  source_text?: string | null;
  ref_low?: number | null;
  ref_high?: number | null;
  flag: string;
}

export interface RiskPoint {
  date: string;
  value: number;
  status: Status;
  label: string;
  text: string;
  inputs: InputView[];
  reports_combined: number;
  labs_combined: string[];
  all_inputs_normal: boolean;
  max_gap_days: number;
}

export interface Risk {
  id: string;
  name: string;
  hidden_condition: string;
  organ: string;
  equation: string;
  citation: string;
  next_step: string;
  why_hidden: string;
  simple: string;
  notes: string | null;
  applies_when: string | null;
  status: Status;
  label: string;
  text: string;
  current: RiskPoint;
  history: RiskPoint[];
  trend: { per_year: number; r2: number; first: number; first_date: string } | null;
  stage?: string;
}

export interface Drift {
  code: string;
  name: string;
  unit: string;
  first: number;
  latest: number;
  first_date: string;
  latest_date: string;
  change_pct: number;
  months_to_limit: number | null;
  limit: number;
  points: { date: string; value: number; lab: string | null; result_id: number | null }[];
  message: string;
}

export interface Alert {
  id: string;
  type: string;
  level: Level;
  title: string;
  text: string;
  action: string | null;
  citation: string | null;
  refs: number[];
  panel: string | null;
}

export interface NextTest {
  panel: string;
  name: string;
  price_inr: number;
  unlocks: string[];
  care_gaps: string[];
  follow_ups: string[];
  score: number;
}

export interface Analysis {
  hidden_risks: Risk[];
  drifts: Drift[];
  alerts: Alert[];
  next_tests: NextTest[];
  score: { value: number; label: string; explanation: string };
  questions: string[];
}

export interface LabResult {
  id: number;
  report_id: number;
  test_code: string | null;
  test_name: string;
  test_name_raw: string;
  category: string;
  value: number | null;
  unit: string | null;
  value_raw: string | null;
  unit_raw: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: string | null;
  date: string | null;
  confidence: number;
  source_text: string | null;
  confirmed: boolean;
  loinc: string | null;
  flag_computed?: "normal" | "low" | "high" | "critical_low" | "critical_high" | null;
  needs_review?: boolean;
  user_verified?: boolean;
}

export interface DraftMed {
  brand: string;
  generic: string | null;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  source_text: string | null;
  confidence: number;
  matched: boolean;
}

export interface Report {
  id: number;
  filename: string;
  kind: "lab" | "prescription";
  lab_name: string | null;
  doctor_name: string | null;
  report_date: string | null;
  status: "review" | "confirmed";
  method: string;
  has_file: boolean;
  mime: string | null;
  created_at: string;
  n_results: number;
  n_abnormal: number;
  n_medicines: number;
  results?: LabResult[];
  medicines?: { id: number; brand: string; generic: string | null; dose: string | null; frequency: string | null; start_date: string | null; reason: string | null; source_text: string | null }[];
  draft_medicines?: DraftMed[];
  warnings?: string[];
  redactions?: number;
  pages?: number | null;
  user_verified?: boolean;
  is_demo?: boolean;
  n_critical?: number;
  n_needs_review?: number;
  needs_review?: number[];
  reader?: string | null;
}

export interface PlainSummary {
  language: string;
  headline: string;
  lines: { result_id: number; flag: string; text: string }[];
  disclaimer: string;
}

export interface Meta {
  ai_enabled: boolean;
  model: string | null;
  ai_engines?: string[];
  tests: { code: string; name: string; unit: string; category: string; loinc: string | null }[];
  formulas: { id: string; name: string; hidden_condition: string; equation: string; citation: string }[];
  conditions: string[];
  symptoms: { key: string; label: string }[];
}
