/** Prompts and response schemas for Sarvam-105B (Prompt Pack v2). See docs/TECH-SPEC.md §8. */
import { DELIVERIES } from '../../shared/constants';
import type { SegmentRequest } from '../../shared/schemas';
import type { Role, Source, Station } from '../../shared/types';
import type { ChatMessage } from '../sarvam';
import { AD_PLAN_FIELDS, adPrompt, type AdPlan } from './ad';
import { contextBlock, EN_FIELD, subtitleRule, subtitlesOn, systemPreamble, type LlmPlan, type LlmSegmentType } from './common';
import { KAHANI_PLAN_FIELDS, kahaniPrompt, storyPlan, type StoryPlan } from './kahani';
import { NEWS_HEADLINES, NEWS_PLAN_FIELDS, newsMessages } from './news';
import { RJ_PLAN_FIELDS, rjLinkPrompt } from './rj';

export type { LlmPlan, LlmSegmentType } from './common';
export { contextBlock, maxTokensFor, onAirName, rjName, rjOnAir, spokenTime, subtitlesOn, systemPreamble } from './common';
export { callerPlaceholder, studioCallsBlock } from './rj';
export { NEWS_HEADLINES, newsFrameText } from './news';
export type { AdPlan } from './ad';
export { storyPlan } from './kahani';
export type { StoryPlan } from './kahani';
export { CALL_PLAN, callJsonSchema, callMessages } from './call';

export const SEGMENT_ROLES: Record<LlmSegmentType, Role[]> = {
  rj_link: ['rj'],
  news: ['news'],
  ad_break: ['ad_announcer', 'ad_customer'],
  kahani: ['narrator', 'char_a', 'char_b', 'char_kid'],
};

export const SEGMENT_PLAN: Record<LlmSegmentType, LlmPlan> = {
  rj_link: { temperature: 0.7, maxTokens: 1400, reasoningEffort: null, timeoutMs: 10_000 },
  // A full bulletin is at most 12 short lines (an update 5); a higher cap only gave a runaway bulletin more room
  news: { temperature: 0.3, maxTokens: 1600, reasoningEffort: null, timeoutMs: 16_000 },
  ad_break: { temperature: 0.9, maxTokens: 1400, reasoningEffort: null, timeoutMs: 13_000 },
  // A serial part (prefetched as soon as the previous part is accepted); the outline and the one-shot story have their own plans in ../fiction
  kahani: { temperature: 0.8, maxTokens: 3200, reasoningEffort: null, timeoutMs: 25_000 },
};

/** A short news update (at most 5 lines) gets a smaller token budget than a full bulletin. */
const NEWS_UPDATE_PLAN: LlmPlan = { ...SEGMENT_PLAN.news, maxTokens: 700, timeoutMs: 10_000 };

/** The plan for one request: SEGMENT_PLAN by type, with the smaller budget for a news update. */
export function segmentPlanFor(type: LlmSegmentType, req: Pick<SegmentRequest, 'mode'>): LlmPlan {
  return type === 'news' && req.mode === 'update' ? NEWS_UPDATE_PLAN : SEGMENT_PLAN[type];
}

/** Most lines the model may write per type (lines can still be split later). */
export const MAX_LINES: Record<LlmSegmentType, number> = { rj_link: 5, news: NEWS_HEADLINES * 2 + 2, ad_break: 5, kahani: 16 };

/**
 * The pack's "plan" object, flattened: sarvam-105b loops on whitespace until max_tokens when the response
 * schema carries nested objects, nullable types or length limits, so every field is a plain string and
 * limits are enforced in post-processing. zod strips the plan fields after validation.
 */
const PLAN_FIELDS: Record<LlmSegmentType, string[]> = {
  rj_link: RJ_PLAN_FIELDS,
  news: NEWS_PLAN_FIELDS,
  ad_break: AD_PLAN_FIELDS,
  kahani: KAHANI_PLAN_FIELDS,
};

export function segmentJsonSchema(type: LlmSegmentType, subtitles = false): Record<string, unknown> {
  const plan = PLAN_FIELDS[type];
  const lines = {
    type: 'array',
    // A news line's delivery comes before its text: after the text the newsreader closes the line, where a
    // required "delivery" after the text left it writing whitespace until the token cap (2026-10-15)
    items:
      type === 'news'
        ? {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'delivery', 'text', ...(subtitles ? ['en'] : [])],
            properties: {
              role: { type: 'string', enum: SEGMENT_ROLES[type] },
              delivery: { type: 'string', enum: [...DELIVERIES] },
              text: { type: 'string' },
              ...(subtitles ? EN_FIELD : {}),
            },
          }
        : {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'text', ...(subtitles ? ['en'] : []), 'delivery'],
            properties: {
              role: { type: 'string', enum: SEGMENT_ROLES[type] },
              text: { type: 'string' },
              ...(subtitles ? EN_FIELD : {}),
              delivery: { type: 'string', enum: [...DELIVERIES] },
            },
          },
  };
  const extra = type === 'news' ? ['mood'] : [];
  return {
    type: 'object',
    additionalProperties: false,
    required: [...plan, 'title', 'lines', ...extra, 'summary_en'],
    properties: {
      ...Object.fromEntries(plan.map((k) => [k, { type: 'string' }])),
      title: { type: 'string' },
      lines,
      ...(type === 'news' ? { mood: { type: 'string', enum: ['light', 'heavy'] } } : {}),
      summary_en: { type: 'string' },
    },
  };
}

/** Plans for the segment being written (each optional; missing ones are drawn fresh). */
export interface SegmentPlans {
  story?: StoryPlan;
  ad?: AdPlan;
}

export function segmentMessages(
  station: Station,
  type: LlmSegmentType,
  req: SegmentRequest,
  headlines: Source[] = [],
  plans: SegmentPlans = {},
): ChatMessage[] {
  // The newsreader has its own system prompt and sees only its slate (no show log, local pack or listener)
  if (type === 'news') return newsMessages(station, req, headlines, subtitlesOn(station, req.subtitles));
  const plan = type === 'kahani' ? (plans.story ?? storyPlan(station, req.listener.daypart)) : undefined;
  const system = systemPreamble(station, SEGMENT_ROLES[type], req.listener, plan?.cast);
  let task: string;
  switch (type) {
    case 'rj_link':
      task = rjLinkPrompt(station, req);
      break;
    case 'ad_break':
      task = adPrompt(station, req, plans.ad);
      break;
    case 'kahani':
      task = kahaniPrompt(station, req, plan!);
      break;
  }
  return [
    { role: 'system', content: subtitlesOn(station, req.subtitles) ? `${system}\n\n${subtitleRule(type)}` : system },
    { role: 'user', content: `${contextBlock(station, req)}\n\n${task}` },
  ];
}
