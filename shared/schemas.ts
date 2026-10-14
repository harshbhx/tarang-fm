/** zod schemas for API request bodies and LLM output. See docs/TECH-SPEC.md §5 and §8. */
import { z } from 'zod';
import { LISTENER_NAME_MAX, TTS_MAX_CHARS } from './constants';

export const StationIdSchema = z.enum(['hi', 'ta', 'bn', 'mr', 'en', 'te', 'kn', 'pa', 'gu']);
export const SegmentTypeSchema = z.enum(['station_id', 'rj_link', 'news', 'ad_break', 'kahani']);
export const RoleSchema = z.enum([
  'station_id',
  'rj',
  'news',
  'ad_announcer',
  'ad_customer',
  'narrator',
  'char_a',
  'char_b',
  'char_kid',
]);
export const DaypartSchema = z.enum(['morning', 'afternoon', 'evening', 'night']);

export const SourceSchema = z.object({
  title: z.string().min(1).max(300),
  url: z.string().url().max(2000),
  source: z.string().max(120).optional(),
});

export const ListenerContextSchema = z.object({
  name: z.string().trim().max(LISTENER_NAME_MAX).optional(),
  city: z.string().trim().max(80).optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  daypart: DaypartSchema,
});

export const SegmentRequestSchema = z.object({
  station: StationIdSchema,
  type: SegmentTypeSchema,
  listener: ListenerContextSchema,
  headlines: z.array(SourceSchema).max(8).optional(),
  theme: z.string().trim().max(120).optional(),
  recentCalls: z.array(z.string().max(300)).max(5).optional(),
  /** Segment type that follows (rj_link teases it) */
  upNext: SegmentTypeSchema.optional(),
});

export const TtsRequestSchema = z.object({
  station: StationIdSchema,
  speaker: z.string().min(3).max(64),
  text: z.string().trim().min(1).max(TTS_MAX_CHARS),
  pace: z.number().min(0.5).max(2),
  temperature: z.number().min(0.01).max(1),
});

/** Non-file fields of the multipart /api/call body (listener arrives as a JSON string). */
export const CallMetaSchema = z.object({
  station: StationIdSchema,
  listener: ListenerContextSchema,
  nowPlaying: z.string().max(120).optional(),
});

/** Raw LLM output for a segment, before role → voice mapping and cleaning. */
export const LlmSegmentSchema = z.object({
  title: z.string().min(1).max(120),
  lines: z
    .array(z.object({ role: RoleSchema, text: z.string().min(1).max(600) }))
    .max(16),
});

export const CallIntentSchema = z.enum(['chat', 'dedication', 'story_request', 'news_request', 'other']);

/** Raw LLM output for a call-in reply. */
export const LlmCallSchema = z.object({
  intent: CallIntentSchema,
  reply: z.string().min(1).max(400),
  theme: z.string().max(120).nullable().optional(),
});

export type SegmentRequest = z.infer<typeof SegmentRequestSchema>;
export type TtsRequest = z.infer<typeof TtsRequestSchema>;
export type CallMeta = z.infer<typeof CallMetaSchema>;
export type LlmSegment = z.infer<typeof LlmSegmentSchema>;
export type LlmCall = z.infer<typeof LlmCallSchema>;
