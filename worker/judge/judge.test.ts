import { describe, expect, it } from 'vitest';
import { applicableDims, judgePrompt, parseJsonLoose, parseVerdict, splitClaims, splitScored, supportedByContext, VERDICT_FIELDS, VERDICT_SCHEMA } from './rubric';
import { responseContent, runJudge, sarvamBackend, workersAiBackend, workersAiBody, type JudgeBackend } from './backends';
import { BASELINE, CALIBRATION, GOOD } from './calibration';
import type { JudgeInput } from './types';

const opener = GOOD.find((c) => c.id === 'good-hi-rj-opener')!.input;
const news = BASELINE.find((c) => c.id === 'before-hi-02-news')!.input;

function verdictJson(over: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    a_heard_en: 'Sunny greeted Baroda, gave the time and a clear sky, wished a happy Navratri and handed over to Simran.',
    b_unsupported_en: 'none',
    c_faults_en: 'none',
    d_hook: 'L1 "नमस्ते बड़ौदा! सनी है आपके साथ" => 4',
    e_coherence: 'L1-L4 "अब खबरें, सिमरन के साथ" => 5',
    f_point: 'L2 "आसमान एकदम साफ़, यानी garba" => 4',
    g_specificity: 'L2 "garba के लिए मौसम ने" => 4',
    h_fidelity: 'L4 "अब खबरें, सिमरन के साथ।" => 5',
    i_ending: 'na',
    j_worst_line: '3',
    k_fix: 'Line 3: make the festival line more specific.',
  };
  return JSON.stringify({ ...base, ...over });
}

describe('the rubric prompt', () => {
  it('puts the context, the numbered script, anchors with real examples and the field order in', () => {
    const p = judgePrompt(news);
    expect(p.user).toMatch(/ITEMS:/);
    expect(p.user).toMatch(/\[N1\]/);
    expect(p.user).toMatch(/^6\. news · normal · Alkapuri/m);
    expect(p.user).toMatch(/fidelity 1: "Alkapuri flyover की opening/);
    expect(p.user).toMatch(/b_unsupported_en: go line by line/);
    expect(p.user).toMatch(/c_faults_en/);
    expect(p.user).toMatch(/=> <1-5>/);
    expect(p.system).toMatch(/strict/);
    expect(p.user).not.toMatch(/plan_/);
  });
  it('never shows news the show log, and shows an RJ link its NEXT rule', () => {
    expect(judgePrompt(news).user).not.toMatch(/SHOW LOG/);
    expect(judgePrompt(opener).user).toMatch(/NEXT: news\. What the handover may say: label only/);
  });
  it('asks fiction only for real-world names, never for its own invented events', () => {
    const story = GOOD.find((c) => c.id === 'good-hi-kahani-oneshot')!.input;
    expect(judgePrompt(story).user).toMatch(/real brands, real famous people, real landmarks/);
    expect(judgePrompt(story).user).toMatch(/CAST \(role: name\): char_a: सुधा/);
    expect(judgePrompt(opener).user).not.toMatch(/real famous people/);
  });
  it('has a flat schema of strings whose keys sort in thinking order', () => {
    const props = VERDICT_SCHEMA.properties as Record<string, { type: string }>;
    expect(Object.values(props).every((p) => p.type === 'string')).toBe(true);
    expect([...VERDICT_FIELDS].sort()).toEqual([...VERDICT_FIELDS]);
    expect(VERDICT_FIELDS.indexOf('b_unsupported_en')).toBeLessThan(VERDICT_FIELDS.indexOf('d_hook'));
    expect(VERDICT_FIELDS.indexOf('c_faults_en')).toBeLessThan(VERDICT_FIELDS.indexOf('d_hook'));
  });
  it('uses the ending dimension only for stories', () => {
    expect(applicableDims({ type: 'kahani', part: 3 })).toContain('story_resolved');
    expect(applicableDims({ type: 'kahani', part: 1 })).toContain('cliffhanger');
    expect(applicableDims({ type: 'ad_break' })).toEqual(['hook', 'coherence', 'point_landed', 'specificity', 'fidelity']);
  });
});

describe('parseVerdict and the code caps', () => {
  it('reads "evidence => score", prefixed or bare fields, inside prose or fences', () => {
    const v = parseVerdict('```json\n' + verdictJson() + '\n```', opener)!;
    expect(v.scores).toMatchObject({ hook: 4, coherence: 5, point_landed: 4, specificity: 4, fidelity: 5, story_resolved: null });
    expect(v.evidence.hook).toBe('L1 "नमस्ते बड़ौदा! सनी है आपके साथ"');
    expect(v.invented).toEqual([]);
    expect(v.faults).toEqual([]);
    expect(v.worstLine).toBe(3);
    // The older shape: bare scores with their evidence in separate fields
    const old = parseVerdict({ hook: '2', coherence: '2', point_landed: '1', specificity: '2', fidelity: '1', heard_summary_en: 'x', unsupported_en: 'L5: flyover' }, opener)!;
    expect(old.scores.point_landed).toBe(1);
    expect(old.heardSummaryEn).toBe('x');
  });
  it('splits evidence from its score in the shapes models write', () => {
    expect(splitScored('L1 "इशान, तूने फिर" => 5')).toEqual({ score: 5, na: false, evidence: 'L1 "इशान, तूने फिर"' });
    expect(splitScored('L4 "बड़ौदा से: 20 अक्टूबर तक" => 4/5').score).toBe(4);
    expect(splitScored('4').score).toBe(4);
    expect(splitScored('na').na).toBe(true);
    expect(splitScored('L3 "x" → 2').score).toBe(2);
    expect(splitScored('no score here').score).toBeNull();
  });
  it('reads "field: value" lines when a model skips the JSON', () => {
    const text = Object.entries(JSON.parse(verdictJson()) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n');
    expect(parseJsonLoose(text)).toMatchObject({ d_hook: 'L1 "नमस्ते बड़ौदा! सनी है आपके साथ" => 4' });
    expect(parseVerdict(text, opener)?.scores.coherence).toBe(5);
  });
  it('caps fidelity at 2 when an unsupported claim is listed, whatever the model scored', () => {
    const v = parseVerdict(verdictJson({ b_unsupported_en: 'L5: Alkapuri flyover opening (no item mentions it)', h_fidelity: 'L5 "Alkapuri" => 5' }), news)!;
    expect(v.invented).toHaveLength(1);
    expect(v.scores.fidelity).toBe(2);
    expect(v.capped.join(' ')).toMatch(/fidelity→2/);
  });
  it('caps a real-world name in fiction at 3, below the bar of 4', () => {
    const ad = BASELINE.find((c) => c.id === 'before-hi-03-ad_break')!.input;
    expect(parseVerdict(verdictJson({ b_unsupported_en: 'L1: Laxmi Vilas Palace' }), ad)!.scores.fidelity).toBe(3);
  });
  it('drops a "claim" whose words the context already gives', () => {
    const ctx = 'नवरात्रि (navratri: garba nights in gujarat)';
    expect(supportedByContext('L2: garba', ctx)).toBe(true);
    expect(supportedByContext('L5: Alkapuri flyover opening', ctx)).toBe(false);
    const v = parseVerdict(verdictJson({ b_unsupported_en: 'L2: garba | L3: Laxmi Vilas Palace traffic' }), opener)!;
    expect(v.invented).toEqual(['L3: Laxmi Vilas Palace traffic']);
  });
  it('lowers a 4-5 with no quoted evidence, but lets fidelity rest on an empty unsupported list', () => {
    const v = parseVerdict(verdictJson({ d_hook: 'great opener => 5', h_fidelity: 'none => 5' }), opener)!;
    expect(v.scores.hook).toBe(3);
    expect(v.scores.fidelity).toBe(5);
  });
  it('caps by the faults the model named itself', () => {
    const story = BASELINE.find((c) => c.id === 'before-hi-04-kahani')!.input;
    expect(parseVerdict(verdictJson({ i_ending: 'L14 "पापा, वो थुषिला कौन है" => 4' }), story)!.scores.story_resolved).toBe(1);
    const oneShot = GOOD.find((c) => c.id === 'good-hi-kahani-oneshot')!.input;
    const unresolved = parseVerdict(verdictJson({ c_faults_en: 'L12: stops before the culprit is revealed, no payoff', i_ending: 'L12 "बाहर अँधेरे में" => 4' }), oneShot)!;
    expect(unresolved.scores.story_resolved).toBe(2);
    const ad = BASELINE.find((c) => c.id === 'before-hi-06-ad_break')!.input;
    expect(parseVerdict(verdictJson({ f_point: 'none => 5' }), ad)!.scores.point_landed).toBe(2);
    expect(parseVerdict(verdictJson({ c_faults_en: 'L5: no punchline, the brand chanted', f_point: 'L5 "Papad-Chhata!" => 4' }), ad)!.scores.point_landed).toBe(2);
    // A stage direction caps coherence only when a line really reads one (the free checks catch those first)
    const leak = BASELINE.find((c) => c.id === 'before-hi-03-ad_break')!.input;
    expect(parseVerdict(verdictJson({ c_faults_en: 'L3: reads a stage direction aloud' }), leak)!.scores.coherence).toBe(2);
    expect(parseVerdict(verdictJson({ c_faults_en: 'L3: reads a stage direction aloud' }), ad)!.scores.coherence).toBe(5);
    expect(parseVerdict(verdictJson({ c_faults_en: 'L1: reacts to a twist that never aired' }), opener)!.scores.fidelity).toBe(2);
  });
  it('splits claim lists and ignores "none"', () => {
    expect(splitClaims('none')).toEqual([]);
    expect(splitClaims('L5: flyover | L6: toll')).toEqual(['L5: flyover', 'L6: toll']);
    expect(splitClaims('L2: none')).toEqual([]);
  });
  it('returns null for output it cannot use', () => {
    expect(parseVerdict('not json', opener)).toBeNull();
    expect(parseVerdict('{"a_heard_en":"x"}', opener)).toBeNull();
  });
});

describe('backends', () => {
  it('reads both Workers AI response shapes', () => {
    expect(responseContent({ response: '{"a":1}' })).toBe('{"a":1}');
    expect(responseContent({ choices: [{ message: { content: '{"b":2}' } }] })).toBe('{"b":2}');
    expect(responseContent({ result: { choices: [{ message: { content: 'x' } }] } })).toBe('x');
    // Qwen3 on Workers AI puts the answer in reasoning_content when thinking is off
    expect(responseContent({ choices: [{ message: { content: null, reasoning_content: '{"a":1}' } }] })).toBe('{"a":1}');
    expect(responseContent({ choices: [{ message: { content: null, reasoning_content: 'Let me think' } }] })).toBeUndefined();
  });
  it('sends the schema, low temperature, reasoning effort for gpt-oss and thinking off for thinkers', () => {
    const p = judgePrompt(opener);
    const b = workersAiBody('@cf/meta/llama-3.3-70b-instruct-fp8-fast', p, { temperature: 0.1, maxTokens: 900 });
    expect(b.temperature).toBe(0.1);
    expect(b.response_format).toBeTruthy();
    expect(workersAiBody('@cf/openai/gpt-oss-120b', p, { temperature: 0.1, maxTokens: 900 }).reasoning).toEqual({ effort: 'low' });
    expect(workersAiBody('@cf/meta/llama-3.3-70b-instruct-fp8-fast', p, { temperature: 0.1, maxTokens: 900, schema: false }).response_format).toBeUndefined();
    expect(workersAiBody('@cf/google/gemma-4-26b-a4b-it', p, { temperature: 0.1, maxTokens: 600 }).chat_template_kwargs).toMatchObject({ enable_thinking: false });
  });
  it('time-boxes a slow backend and never throws', async () => {
    const slow: JudgeBackend = { id: 'slow', complete: () => new Promise((r) => setTimeout(() => r(verdictJson()), 500)) };
    const r = await runJudge(slow, opener, { timeoutMs: 30 });
    expect(r.verdict).toBeNull();
    // The binding has no AbortSignal: the race still ends at the time box
    const ai = { run: () => new Promise((r) => setTimeout(() => r({ response: verdictJson() }), 500)) };
    const r2 = await runJudge(workersAiBackend(ai), opener, { timeoutMs: 30 });
    expect(r2.error).toBe('timeout');
  });
  it('turns a failing backend into an error result', async () => {
    const broken: JudgeBackend = { id: 'x', complete: async () => { throw new Error('HTTP 500'); } };
    expect((await runJudge(broken, opener)).error).toMatch(/HTTP 500/);
  });
  it('parses a binding answer that is already an object', async () => {
    const ai = { run: async () => ({ response: JSON.parse(verdictJson()) }) };
    const r = await runJudge(workersAiBackend(ai), opener, { timeoutMs: 1000 });
    expect(r.verdict?.scores.hook).toBe(4);
  });
  it('sends Sarvam the schema with reasoning off and low temperature', async () => {
    let body: Record<string, unknown> = {};
    const fetcher = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: verdictJson() } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runJudge(sarvamBackend('k', { fetcher }), opener, { timeoutMs: 1000 });
    expect(r.verdict?.scores.fidelity).toBe(5);
    expect(body).toMatchObject({ model: 'sarvam-105b', reasoning_effort: null, temperature: 0.1 });
    expect((body.response_format as { type: string }).type).toBe('json_schema');
  });
});

describe('the calibration set', () => {
  it('has the 9 "before" scripts, 6+ good ones and subtly broken variants, each with a usable prompt', () => {
    expect(CALIBRATION.filter((c) => c.set === 'baseline')).toHaveLength(9);
    expect(CALIBRATION.filter((c) => c.set === 'good').length).toBeGreaterThanOrEqual(6);
    expect(CALIBRATION.filter((c) => c.set === 'broken').length).toBeGreaterThanOrEqual(5);
    for (const c of CALIBRATION) {
      const input: JudgeInput = c.input;
      expect(input.lines.length, c.id).toBeGreaterThan(1);
      expect(judgePrompt(input).user.length, c.id).toBeLessThan(12_000);
    }
  });
});
