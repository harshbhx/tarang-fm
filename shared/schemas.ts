/** zod schemas for API request bodies and LLM output. See docs/TECH-SPEC.md §5 and §8. */
import { z } from 'zod';
import { DELIVERIES, LISTENER_NAME_MAX, TTS_MAX_CHARS } from './constants';

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
export const DeliverySchema = z.enum(DELIVERIES);
export const MoodSchema = z.enum(['light', 'heavy']);

export const SourceSchema = z.object({
  title: z.string().min(1).max(300),
  url: z.string().url().max(2000),
  source: z.string().max(120).optional(),
  local: z.boolean().optional(),
});

export const WeatherSchema = z.object({
  tempC: z.number().min(-60).max(70),
  description: z.string().trim().min(1).max(60),
});

export const ListenerContextSchema = z.object({
  name: z.string().trim().max(LISTENER_NAME_MAX).optional(),
  city: z.string().trim().max(80).optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  daypart: DaypartSchema,
  /** Browser-local date 'YYYY-MM-DD' (occasions) and weekday 0 = Sunday */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  /** State or region, e.g. 'Gujarat' (from the edge) */
  region: z.string().trim().max(60).optional(),
  /** Session nickname the RJ gave this listener on a call */
  nickname: z.string().trim().max(40).optional(),
});

/** A studio phone-line call the RJ link must read on air. */
export const DedicationSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().max(40).optional(),
  city: z.string().trim().max(60).optional(),
  type: z.enum(['dedication', 'story_request', 'news_request', 'chat', 'other']),
  message: z.string().trim().min(1).max(220),
  theme: z.string().trim().max(120).optional(),
});

/** A listening session's random id (the studio line's claims are held in its name). */
const HolderSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const SegmentRequestSchema = z.object({
  station: StationIdSchema,
  type: SegmentTypeSchema,
  listener: ListenerContextSchema,
  headlines: z.array(SourceSchema).max(8).optional(),
  theme: z.string().trim().max(120).optional(),
  recentCalls: z.array(z.string().max(300)).max(5).optional(),
  /** Segment type that follows (rj_link teases it) */
  upNext: SegmentTypeSchema.optional(),
  /** Current weather in the listener's city (rj_link mentions it) */
  weather: WeatherSchema.optional(),
  /** What aired so far this session, oldest first (max 4) */
  showLog: z.array(z.object({ type: SegmentTypeSchema, summary: z.string().trim().max(200) })).max(4).optional(),
  /** The segment this RJ link introduces (generated first, so the tease is true) */
  next: z.object({ type: SegmentTypeSchema, summary: z.string().trim().max(200) }).optional(),
  /** Producer settings for rj_link, decided in code */
  producer: z
    .object({
      firstLink: z.boolean(),
      greetListener: z.boolean(),
      useCatchphrase: z.boolean(),
      bit: z.string().trim().max(24),
    })
    .optional(),
  /** Mood of the segment that just aired */
  moodAfterPrevious: MoodSchema.optional(),
  /** One line about the last caller, e.g. '"चाय-chief" (Harsh, Vadodara) asked for a haunted haveli story.' */
  lastCaller: z.string().trim().max(240).optional(),
  /** kahani only: one-line summaries of the stories already aired this session, so the next one differs */
  recentStories: z.array(z.string().trim().max(200)).max(8).optional(),
  /** rj_link only: studio phone calls to read on air, oldest first (max 2) */
  dedications: z.array(DedicationSchema).max(2).optional(),
  /** rj_link only: this listening session's random id, which the studio calls are claimed in */
  holder: HolderSchema.optional(),
  /** Write an English subtitle for every line (the script writer adds it; off unless the listener turned subtitles on) */
  subtitles: z.boolean().optional(),
});

/** POST /api/phone/aired: the studio calls an RJ link has started reading on air. */
export const PhoneAiredSchema = z.object({
  station: StationIdSchema,
  holder: HolderSchema,
  ids: z.array(z.string().trim().min(1).max(100)).min(1).max(2),
});

export const TtsRequestSchema = z.object({
  station: StationIdSchema,
  speaker: z.string().min(3).max(64),
  text: z.string().trim().min(1).max(TTS_MAX_CHARS),
  pace: z.number().min(0.5).max(2),
  temperature: z.number().min(0.01).max(1),
  loudness: z.number().min(0.1).max(2.5).optional(),
  pitch: z.number().min(-0.5).max(0.5).optional(),
});

/** Non-file fields of the multipart /api/call body (listener arrives as a JSON string). */
export const CallMetaSchema = z.object({
  station: StationIdSchema,
  listener: ListenerContextSchema,
  nowPlaying: z.string().max(120).optional(),
  showLog: z.array(z.object({ type: SegmentTypeSchema, summary: z.string().trim().max(200) })).max(4).optional(),
  /** Write English subtitles for the caller and the reply (off unless the listener turned subtitles on) */
  subtitles: z.boolean().optional(),
});

/** Raw LLM output for a segment, before role → voice mapping and cleaning. */
export const LlmSegmentSchema = z.object({
  title: z.string().min(1).max(120),
  lines: z
    .array(
      z.object({
        role: RoleSchema,
        text: z.string().min(1).max(600),
        delivery: z.string().max(20).optional(),
        /** English subtitle, written with the line (only when subtitles were requested) */
        en: z.string().max(600).optional(),
      }),
    )
    .max(16),
  summary_en: z.string().max(400).optional(),
  mood: z.string().max(10).optional(),
});

export const CallIntentSchema = z.enum(['chat', 'dedication', 'story_request', 'news_request', 'retry', 'deflect', 'care', 'other']);

/** Raw LLM output for a call-in reply. */
export const LlmCallSchema = z.object({
  intent: CallIntentSchema,
  lines: z
    .array(z.object({ text: z.string().min(1).max(600), delivery: z.string().max(20).optional(), en: z.string().max(600).optional() }))
    .min(1)
    .max(4),
  nickname: z.string().max(60).nullable().optional(),
  story_theme: z.string().max(120).nullable().optional(),
  /** English subtitle of what the caller said (only when subtitles were requested) */
  caller_en: z.string().max(600).nullable().optional(),
});

export type SegmentRequest = z.infer<typeof SegmentRequestSchema>;
export type Dedication = z.infer<typeof DedicationSchema>;
export type PhoneAired = z.infer<typeof PhoneAiredSchema>;
export type TtsRequest = z.infer<typeof TtsRequestSchema>;
export type CallMeta = z.infer<typeof CallMetaSchema>;
export type LlmSegment = z.infer<typeof LlmSegmentSchema>;
export type LlmCall = z.infer<typeof LlmCallSchema>;
