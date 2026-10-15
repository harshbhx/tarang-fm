/** The producer's calibration set: the "before" sample, hand-written good scripts, and subtly broken variants. */
import { BASELINE } from './baseline';
import { BROKEN, GOOD } from './good';
import type { CalibrationCase } from './types';

export type { CalibrationCase } from './types';
export { BASELINE } from './baseline';
export { BROKEN, GOOD } from './good';

export const CALIBRATION: CalibrationCase[] = [...BASELINE, ...GOOD, ...BROKEN];
