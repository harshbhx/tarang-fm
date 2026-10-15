import { describe, expect, it } from 'vitest';
import { applicableDims, judgePrompt, parseVerdict, splitClaims, supportedByContext, VERDICT_FIELDS, VERDICT_SCHEMA } from './rubric';
import { responseContent, runJudge, workersAiBackend, workersAiBody, type JudgeBackend } from './backends';
import { BASELINE, CALIBRATION, GOOD } from './calibration';
import type { JudgeInput } from './types';

const opener = GOOD.find((c) => c.id === 'good-hi-rj-opener')!.input;
const news = BASELINE.find((c) => c.id === 'before-hi-02-news')!.input;

function verdictJson(over: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    a_heard_summary_en: 'Sunny greeted Baroda, gave the time and a clear sky, wished a happy Navratri and handed over to Simran.',
    b_unsupported_en: 'none',
    c_hook_evidence: 'L1 "नमस्ते बड़ौदा! सनी है आपके साथ"',
    d_hook: '4',
    e_coherence_evidence: 'L1-L4 follow each other',
    f_coherence: '5',
    g_point_evidence: 'L2 "आसमान एकदम साफ़, यानी garba के लिए"',
    h_point_landed: '4',
    i_specificity_evidence: 'L2 "garba के लिए मौसम ने भी हाँ"',
    j_specificity: '4',
    k_fidelity_evidence: 'L4 "अब खबरें, सिमरन के साथ।"',
    l_fidelity: '5',
    m_ending_evidence: 'none',
    n_ending: 'na',
    o_worst_line: '3',
    p_fix: 'Line 3: make the festival line more specific.',
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
    expect(p.user).toMatch(/unsupported_en: go line by line/);
    expect(p.system).toMatch(/strict/);
    expect(p.user).not.toMatch(/plan_/);
  });
  it('never shows news the show log, and shows an RJ link its NEXT rule', () => {
    expect(judgePrompt(news).user).not.toMatch(/SHOW LOG/);
    expect(judgePrompt(opener).user).toMatch(/NEXT: news\. What the handover may say: label only/);
  });
  it('has a flat schema of strings whose keys sort in thinking order', () => {
    const props = VERDICT_SCHEMA.properties as Record<string, { type: string }>;
    expect(Object.values(props).every((p) => p.type === 'string')).toBe(true);
    expect([...VERDICT_FIELDS].sort()).toEqual([...VERDICT_FIELDS]);
    expect(VERDICT_FIELDS.indexOf('b_unsupported_en')).toBeLessThan(VERDICT_FIELDS.indexOf('d_hook'));
  });
  it('uses the ending dimension only for stories', () => {
    expect(applicableDims({ type: 'kahani', part: 3 })).toContain('story_resolved');
    expect(applicableDims({ type: 'kahani', part: 1 })).toContain('cliffhanger');
    expect(applicableDims({ type: 'ad_break' })).toEqual(['hook', 'coherence', 'point_landed', 'specificity', 'fidelity']);
  });
});

describe('parseVerdict and the code caps', () => {
  it('reads prefixed or bare fields, inside prose or fences', () => {
    const v = parseVerdict('```json\n' + verdictJson() + '\n```', opener)!;
    expect(v.scores).toMatchObject({ hook: 4, coherence: 5, point_landed: 4, specificity: 4, fidelity: 5, story_resolved: null });
    expect(v.invented).toEqual([]);
    expect(v.worstLine).toBe(3);
    expect(parseVerdict({ hook: '2', coherence: '2', point_landed: '1', specificity: '2', fidelity: '1', heard_summary_en: 'x', unsupported_en: 'L5: flyover' }, opener)?.scores.point_landed).toBe(1);
  });
  it('caps fidelity at 2 when an unsupported claim is listed, whatever the model scored', () => {
    const v = parseVerdict(verdictJson({ b_unsupported_en: 'L5: Alkapuri flyover opening (no item mentions it)', l_fidelity: '5' }), news)!;
    expect(v.invented).toHaveLength(1);
    expect(v.scores.fidelity).toBe(2);
    expect(v.capped.join(' ')).toMatch(/fidelity→2/);
  });
  it('drops a "claim" whose words the context already gives', () => {
    const ctx = 'नवरात्रि (navratri: garba nights in gujarat)';
    expect(supportedByContext('L2: garba', ctx)).toBe(true);
    expect(supportedByContext('L5: Alkapuri flyover opening', ctx)).toBe(false);
    const v = parseVerdict(verdictJson({ b_unsupported_en: 'L2: garba | L3: Laxmi Vilas Palace traffic' }), opener)!;
    expect(v.invented).toEqual(['L3: Laxmi Vilas Palace traffic']);
  });
  it('lowers a 4-5 with no quoted evidence, a final story ending on a question, an ad with no joke quoted', () => {
    const v = parseVerdict(verdictJson({ c_hook_evidence: 'none', d_hook: '5' }), opener)!;
    expect(v.scores.hook).toBe(3);
    const story = BASELINE.find((c) => c.id === 'before-hi-04-kahani')!.input;
    expect(parseVerdict(verdictJson({ n_ending: '4', m_ending_evidence: 'L14 "पापा, वो थुषिला कौन है"' }), story)!.scores.story_resolved).toBe(1);
    const ad = BASELINE.find((c) => c.id === 'before-hi-06-ad_break')!.input;
    expect(parseVerdict(verdictJson({ g_point_evidence: 'none', h_point_landed: '5' }), ad)!.scores.point_landed).toBe(2);
  });
  it('splits claim lists and ignores "none"', () => {
    expect(splitClaims('none')).toEqual([]);
    expect(splitClaims('L5: flyover | L6: toll')).toEqual(['L5: flyover', 'L6: toll']);
  });
  it('returns null for output it cannot use', () => {
    expect(parseVerdict('not json', opener)).toBeNull();
    expect(parseVerdict('{"a_heard_summary_en":"x"}', opener)).toBeNull();
  });
});

describe('backends', () => {
  it('reads both Workers AI response shapes', () => {
    expect(responseContent({ response: '{"a":1}' })).toBe('{"a":1}');
    expect(responseContent({ choices: [{ message: { content: '{"b":2}' } }] })).toBe('{"b":2}');
    expect(responseContent({ result: { choices: [{ message: { content: 'x' } }] } })).toBe('x');
  });
  it('sends the schema, low temperature, and reasoning effort for gpt-oss', () => {
    const p = judgePrompt(opener);
    const b = workersAiBody('@cf/meta/llama-3.3-70b-instruct-fp8-fast', p, { temperature: 0.1, maxTokens: 900 });
    expect(b.temperature).toBe(0.1);
    expect(b.response_format).toBeTruthy();
    expect(workersAiBody('@cf/openai/gpt-oss-120b', p, { temperature: 0.1, maxTokens: 900 }).reasoning).toEqual({ effort: 'low' });
    expect(workersAiBody('@cf/meta/llama-3.3-70b-instruct-fp8-fast', p, { temperature: 0.1, maxTokens: 900, schema: false }).response_format).toBeUndefined();
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
});

describe('the calibration set', () => {
  it('has the 9 "before" scripts, 6+ good ones and subtly broken variants, each with a usable prompt', () => {
    expect(CALIBRATION.filter((c) => c.set === 'baseline')).toHaveLength(9);
    expect(CALIBRATION.filter((c) => c.set === 'good').length).toBeGreaterThanOrEqual(6);
    expect(CALIBRATION.filter((c) => c.set === 'broken').length).toBeGreaterThanOrEqual(3);
    for (const c of CALIBRATION) {
      const input: JudgeInput = c.input;
      expect(input.lines.length, c.id).toBeGreaterThan(1);
      expect(judgePrompt(input).user.length, c.id).toBeLessThan(12_000);
    }
  });
});
