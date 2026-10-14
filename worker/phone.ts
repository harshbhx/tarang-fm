/** The studio phone line: Sarvam Voice Agents answers calls, and the web show reads them on air. */
import { z } from 'zod';
import { STUDIO_NUMBER } from '../shared/constants';
import type { PhoneCall, PhoneRecentResponse, PhoneRequestType, Station } from '../shared/types';
import { getHeadlines, isGrim } from './context';

const RECENT_KEY = 'phone:recent';
const RECENT_MAX = 20;
/** Calls older than this are not read on air any more. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const REQUEST_TYPES = ['dedication', 'story_request', 'news_request', 'chat', 'other'] as const;

/** The parts of Sarvam's call-end webhook we use (docs: voice-agents/api/deployments/webhooks/webhook-payload). */
const CallEndSchema = z.object({
  interaction_id: z.string().min(1).max(200),
  user_phone_number: z.string().max(32).optional(),
  end_datetime: z.string().max(40).nullish(),
  final_agent_variables: z.record(z.string(), z.unknown()).nullish(),
  output_agent_variables: z.record(z.string(), z.unknown()).nullish(),
});

/** '+917965854148' → '+91 ••••• 4148'. The full number never leaves the Worker. */
export function maskNumber(number: string | undefined): string {
  const digits = (number ?? '').replace(/\D/g, '');
  if (digits.length < 4) return 'Caller';
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  return `${country}••••• ${digits.slice(-4)}`;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : undefined;
}

function isNo(value: unknown): boolean {
  if (typeof value === 'boolean') return !value;
  return typeof value === 'string' && /^(false|no|n|0)$/i.test(value.trim());
}

/** Turns a call-end webhook into an on-air call, or null when there is nothing the caller wants read out. */
export function toPhoneCall(payload: unknown): PhoneCall | null {
  const parsed = CallEndSchema.safeParse(payload);
  if (!parsed.success) return null;
  const vars = { ...(parsed.data.output_agent_variables ?? {}), ...(parsed.data.final_agent_variables ?? {}) };
  const message = text(vars.on_air_message, 220);
  if (!message || isNo(vars.on_air_ok) || isGrim(message)) return null;
  const rawType = text(vars.request_type, 20)?.toLowerCase();
  const type: PhoneRequestType = REQUEST_TYPES.includes(rawType as PhoneRequestType) ? (rawType as PhoneRequestType) : 'chat';
  return {
    id: parsed.data.interaction_id,
    at: parsed.data.end_datetime || new Date().toISOString(),
    name: text(vars.caller_name, 40),
    city: text(vars.caller_city, 60),
    maskedNumber: maskNumber(parsed.data.user_phone_number),
    type,
    message,
    theme: type === 'story_request' ? text(vars.story_theme, 120) : undefined,
  };
}

async function readRecent(kv: KVNamespace): Promise<PhoneCall[]> {
  const calls = await kv.get<PhoneCall[]>(RECENT_KEY, 'json').catch(() => null);
  return Array.isArray(calls) ? calls : [];
}

/** Stores a call at the front of the recent list (duplicates from webhook retries are replaced). */
export async function saveCall(kv: KVNamespace, call: PhoneCall): Promise<void> {
  const calls = (await readRecent(kv)).filter((c) => c.id !== call.id);
  await kv.put(RECENT_KEY, JSON.stringify([call, ...calls].slice(0, RECENT_MAX)));
}

export async function recentCalls(kv: KVNamespace, now = Date.now()): Promise<PhoneRecentResponse> {
  const calls = (await readRecent(kv)).filter((c) => now - Date.parse(c.at) < RECENT_WINDOW_MS).slice(0, 6);
  return { number: STUDIO_NUMBER, calls };
}

/** Constant-time comparison for the webhook token. */
export function tokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Headlines for the phone RJ, as one short spoken-style block (the agent paraphrases them in the caller's language). */
export async function phoneHeadlines(
  station: Station,
  origin: string,
  city: string | undefined,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<{ count: number; spoken: string }> {
  const headlines = (await getHeadlines(station, origin, waitUntil, city)).slice(0, 3);
  if (!headlines.length) return { count: 0, spoken: 'No headlines are available right now.' };
  const spoken = headlines.map((h, i) => `${i + 1}. ${h.local ? `From ${city ?? 'the caller\'s city'}: ` : ''}${h.title}`).join(' ');
  return { count: headlines.length, spoken };
}
