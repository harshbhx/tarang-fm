/** Shared shapes for the producer check: what is reviewed, what the scorer returns. */
import type { StationId } from '../../shared/types';

export type ReviewType = 'rj_link' | 'news' | 'ad_break' | 'kahani';

export interface ReviewLine {
  role: string;
  text: string;
  delivery?: string;
  /** Machine subtitle; the judge reads the native text */
  en?: string;
}

export interface SlateItem {
  id?: string;
  slot?: string;
  title: string;
  detail?: string;
  source?: string;
  light?: boolean;
}

/** Everything the writer was given that the producer may check against. All optional. */
export interface ReviewContext {
  /** The one thing the segment had to deliver (code decides); a default per type and mode is used otherwise */
  point?: string;
  /** Labelled real-world fact blocks exactly as the writer saw them (TIME, WEATHER, FESTIVAL, PAYLOAD, CITY FACT...) */
  blocks?: { label: string; text: string }[];
  /** News: the slate */
  slate?: SlateItem[];
  /** Heard summaries of what aired, oldest first */
  showLog?: string[];
  /** The next segment and what the handover may say about it */
  next?: { type: string; allowed: string };
  /** rj_link: the payload type chosen in code */
  payloadType?: string;
  /** Numbers and Latin tokens the payload must keep verbatim */
  keptTokens?: string[];
  /** Words the segment may always say: station, frequency, RJ or newsreader name, city, state */
  frame?: string[];
  timePhrase?: string;
  listenerName?: string;
  catchphrase?: { text: string; allowed: boolean };
  /** Lines that already aired this session */
  airedLines?: string[];
  /** rj_link: studio calls read on air (each adds one line to the mode's range) */
  calls?: number;
  /** Place-name groups (aliases across scripts) known to the station */
  knownPlaces?: string[][];
  /** Kahani: the serial outline (flat fields) and the recap source */
  outline?: Record<string, string>;
  recap?: { heard: string; cliffhanger: string; lastLines?: { role: string; text: string }[] };
  /** Kahani: character names by role; relations_en; the line this part must end on */
  names?: Partial<Record<string, string>>;
  relations?: string;
  expectedLastLine?: string;
  /** Ad: the format card */
  ad?: { format?: string; signature?: string; tnc?: 'required' | 'optional' };
  /** More example fragments to guard */
  extraFragments?: string[];
}

/** The writer's own plan fields. Free checks may use them; the judge never sees them. */
export interface ReviewPlan {
  title?: string;
  plan_punchline?: string;
  plan_brand_pun?: string;
  [key: string]: string | undefined;
}

export interface JudgeInput {
  type: ReviewType;
  mode?: string;
  part?: 1 | 2 | 3;
  oneShot?: boolean;
  station: StationId;
  /** "Tarang FM 91.1" */
  onAir?: string;
  lines: ReviewLine[];
  context: ReviewContext;
}

export const DIMS = ['hook', 'coherence', 'point_landed', 'specificity', 'fidelity', 'story_resolved', 'cliffhanger'] as const;
export type Dim = (typeof DIMS)[number];
export type Scores = Record<Dim, number | null>;

export interface JudgeVerdict {
  /** What a listener actually heard (feeds the show log and the next recap) */
  heardSummaryEn: string;
  /** Real-world claims not in the context, each with its line ("L5: ...") */
  invented: string[];
  /** Problems a listener would notice, each with its line ("L3: ..."), listed before the scores */
  faults: string[];
  scores: Scores;
  /** The quoted evidence per scored dimension */
  evidence: Partial<Record<Dim, string>>;
  worstLine: number | null;
  fix: string;
  /** Scores the code lowered because the evidence or the invented list contradicted them */
  capped: string[];
}
