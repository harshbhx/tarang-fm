import type { Dim, JudgeInput, ReviewPlan } from '../types';

export interface CalibrationCase {
  id: string;
  /** baseline = the "before" sample; good = hand-written to the bible; broken = a good script with one subtle fault */
  set: 'baseline' | 'good' | 'broken';
  expect: 'pass' | 'fail';
  /** What a producer must notice */
  known?: string;
  /** At least one of these must appear in the judge's unsupported list (case-insensitive) */
  mustInvent?: string[];
  /** These scores must come back ≤ 2 */
  lowDims?: Dim[];
  input: JudgeInput;
  plan?: ReviewPlan;
}
