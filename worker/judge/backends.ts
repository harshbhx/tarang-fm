/**
 * Judge backends: Workers AI (the `AI` binding; the default) or Sarvam chat. Each returns the model's raw text
 * (or an already-parsed object); `runJudge` builds the prompt, enforces the time box and parses the verdict.
 */
import { judgePrompt, parseVerdict, VERDICT_SCHEMA, type JudgePrompt } from './rubric';
import type { JudgeInput, JudgeVerdict } from './types';

export interface CompleteOptions {
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}

export interface JudgeBackend {
  /** e.g. "workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast" */
  id: string;
  complete(prompt: JudgePrompt, opts: CompleteOptions): Promise<unknown>;
}

/** Calibrated on the 2026-10-15 set (see scripts/calibrate-judge.mjs): the default scorer. */
export const DEFAULT_JUDGE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
/** Whether the default judge uses constrained JSON decoding */
export const DEFAULT_JUDGE_SCHEMA = true;
export const JUDGE_TEMPERATURE = 0.1;
export const JUDGE_MAX_TOKENS = 900;

/** The part of the Workers AI binding the judge needs. */
export interface AiRunner {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

/** The model's content from either Workers AI response shape (native `response` or OpenAI-style `choices`). */
export function responseContent(res: unknown): unknown {
  const r = res as { response?: unknown; result?: unknown; choices?: { message?: { content?: unknown } }[] };
  if (r && typeof r === 'object' && 'result' in r && r.result && typeof r.result === 'object') return responseContent(r.result);
  if (r?.response !== undefined && r.response !== null) return r.response;
  const content = r?.choices?.[0]?.message?.content;
  return content ?? undefined;
}

/** Request body for a Workers AI chat model (binding or REST). */
export function workersAiBody(model: string, prompt: JudgePrompt, opts: Omit<CompleteOptions, 'signal'> & { schema?: boolean }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  // Constrained decoding is slower on some models; without it the prompt's field list and a lenient parser do the job
  if (opts.schema !== false) body.response_format = { type: 'json_schema', json_schema: VERDICT_SCHEMA };
  if (model.includes('gpt-oss')) {
    body.reasoning = { effort: 'low' };
    body.max_tokens = opts.maxTokens + 2000;
  }
  if (model.includes('gemma-4') || model.includes('qwen3')) body.chat_template_kwargs = { enable_thinking: false };
  return body;
}

export function workersAiBackend(ai: AiRunner, model: string = DEFAULT_JUDGE_MODEL, opts: { schema?: boolean } = {}): JudgeBackend {
  const schema = opts.schema ?? DEFAULT_JUDGE_SCHEMA;
  return {
    id: `workers-ai:${model}${schema ? '' : ':free-json'}`,
    async complete(prompt, opts) {
      const run = ai.run(model, workersAiBody(model, prompt, { ...opts, schema }));
      // The binding takes no AbortSignal: race it against the time box instead
      const aborted = new Promise<never>((_, reject) => {
        if (opts.signal.aborted) reject(new Error('judge timed out'));
        opts.signal.addEventListener('abort', () => reject(new Error('judge timed out')), { once: true });
      });
      return responseContent(await Promise.race([run, aborted]));
    },
  };
}

export interface SarvamJudgeOptions {
  model?: string;
  reasoningEffort?: 'low' | 'medium' | null;
  fetcher?: typeof fetch;
}

export function sarvamBackend(apiKey: string, opts: SarvamJudgeOptions = {}): JudgeBackend {
  const model = opts.model ?? 'sarvam-105b';
  const reasoning = opts.reasoningEffort ?? null;
  const doFetch = opts.fetcher ?? fetch;
  return {
    id: `sarvam:${model}${reasoning ? `:${reasoning}` : ''}`,
    async complete(prompt, o) {
      const res = await doFetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: o.temperature,
          max_tokens: Math.min(4096, o.maxTokens + (reasoning ? 1500 : 0)),
          reasoning_effort: reasoning,
          response_format: { type: 'json_schema', json_schema: { name: 'producer_check', schema: VERDICT_SCHEMA, strict: true } },
        }),
        signal: o.signal,
      });
      if (!res.ok) throw new Error(`sarvam judge HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data?.choices?.[0]?.message?.content ?? '';
    },
  };
}

export interface RunJudgeOptions {
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface RunJudgeResult {
  verdict: JudgeVerdict | null;
  ms: number;
  error?: string;
  raw?: unknown;
}

/** One scoring call, time-boxed. Never throws: an error or an unusable answer comes back as `verdict: null`. */
export async function runJudge(backend: JudgeBackend, input: JudgeInput, opts: RunJudgeOptions = {}): Promise<RunJudgeResult> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3000);
  try {
    const raw = await backend.complete(judgePrompt(input), {
      temperature: opts.temperature ?? JUDGE_TEMPERATURE,
      maxTokens: opts.maxTokens ?? JUDGE_MAX_TOKENS,
      signal: ctrl.signal,
    });
    const verdict = parseVerdict(raw, input);
    return { verdict, ms: Date.now() - t0, raw, ...(verdict ? {} : { error: 'unparseable verdict' }) };
  } catch (err) {
    return { verdict: null, ms: Date.now() - t0, error: ctrl.signal.aborted ? 'timeout' : String((err as Error)?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}
