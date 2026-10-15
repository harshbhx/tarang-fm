import { afterEach, describe, expect, it, vi } from 'vitest';
import { betterReview, DEFAULT_THRESHOLDS, JUDGE_TIME_BOX_MS, producerBackend, reviewScript, rewriteNote, scoreFailures, type Review, type ReviewRequest } from './producer';
import type { JudgeBackend } from './judge/backends';
import type { JudgePrompt } from './judge/rubric';
import { BASELINE, BROKEN, GOOD } from './judge/calibration';
import type { ReviewLine } from './judge/types';

function verdict(over: Record<string, string> = {}): string {
  return JSON.stringify({
    a_heard_en: 'Sunny welcomed Harsh in Baroda on a clear Navratri night and handed over to the news.',
    b_unsupported_en: 'none',
    c_faults_en: 'none',
    d_hook: 'L1 "नमस्ते बड़ौदा! सनी है आपके साथ" => 4',
    e_coherence: 'L2 "रात के सवा आठ, आसमान एकदम साफ़" => 5',
    f_point: 'L2 "garba के लिए मौसम ने भी" => 4',
    g_specificity: 'L3 "थकान कल की, मज़ा आज का" => 4',
    h_fidelity: 'L4 "अब खबरें, सिमरन के साथ।" => 5',
    i_ending: 'na',
    j_worst_line: '3',
    k_fix: 'Line 3: give the festival line one concrete image.',
    ...over,
  });
}

/** A judge that answers `raw` and records what it heard. */
function fakeJudge(raw: string | (() => Promise<string>)): JudgeBackend & { calls: JudgePrompt[] } {
  const calls: JudgePrompt[] = [];
  return {
    id: 'fake',
    calls,
    async complete(prompt) {
      calls.push(prompt);
      return typeof raw === 'string' ? raw : raw();
    },
  };
}

const asRequest = (c: (typeof GOOD)[number]): ReviewRequest => ({ ...c.input, station: c.input.station, plan: c.plan });
const opener = asRequest(GOOD.find((c) => c.id === 'good-hi-rj-opener')!);
const newsGood = asRequest(GOOD.find((c) => c.id === 'good-hi-news-full')!);

afterEach(() => {
  vi.useRealTimers();
});

describe('reviewScript', () => {
  it('fails a hard free-check problem without calling the judge', async () => {
    const judge = fakeJudge(verdict());
    const leak = BASELINE.find((c) => c.id === 'before-hi-03-ad_break')!;
    const r = await reviewScript({ ...leak.input, plan: leak.plan }, { backend: judge });
    expect(r.pass).toBe(false);
    expect(judge.calls).toHaveLength(0);
    expect(r.judged).toBe(false);
    expect(r.hardFailures.join(' ')).toMatch(/stage direction/);
    expect(r.fixNote).toBe(r.hardFailures[0]);
    expect(r.worstLine).toBeGreaterThan(0);
  });

  it('passes a clean script the judge scores well, and takes what aired from the judge', async () => {
    const judge = fakeJudge(verdict());
    const r = await reviewScript(opener, { backend: judge });
    expect(judge.calls).toHaveLength(1);
    expect(judge.calls[0].user).not.toMatch(/plan_|summary_en/);
    expect(r).toMatchObject({ pass: true, judged: true, backend: 'fake', worstLine: 3, hardFailures: [], scoreFailures: [] });
    expect(r.scores).toMatchObject({ hook: 4, coherence: 5, point_landed: 4, specificity: 4, fidelity: 5 });
    expect(r.mean).toBeCloseTo(4.4);
    expect(r.heardSummaryEn).toMatch(/Sunny welcomed Harsh/);
  });

  it('fails on the scores, with the judge\'s invented claims, faults and fix', async () => {
    const judge = fakeJudge(verdict({
      b_unsupported_en: 'L3: a new toll on the Vishwamitri bridge',
      c_faults_en: 'L1: filler opener',
      d_hook: 'L1 "नमस्ते" => 2',
      k_fix: 'Line 3: cut the toll; it is not in the context.',
    }));
    const r = await reviewScript(opener, { backend: judge });
    expect(r.pass).toBe(false);
    expect(r.scores.fidelity).toBe(2);
    expect(r.invented).toEqual(['L3: a new toll on the Vishwamitri bridge']);
    expect(r.faults).toEqual(['L1: filler opener']);
    expect(r.scoreFailures.join(' ')).toMatch(/hook 2 < 3/);
    expect(r.scoreFailures.join(' ')).toMatch(/fidelity 2 < 5/);
    expect(r.fixNote).toMatch(/^Line 3: cut the toll/);
  });

  it('passes on the free checks alone when the judge errors or answers nonsense', async () => {
    const failing: JudgeBackend = { id: 'down', complete: async () => { throw new Error('HTTP 503'); } };
    const r = await reviewScript(opener, { backend: failing });
    expect(r).toMatchObject({ pass: true, judged: false, backend: 'down' });
    expect(r.judgeError).toMatch(/HTTP 503/);
    expect(r.heardSummaryEn).toBeTruthy();
    const junk = await reviewScript(opener, { backend: fakeJudge('I think it is fine.') });
    expect(junk).toMatchObject({ pass: true, judged: false, judgeError: 'unparseable verdict' });
  });

  it('time-boxes the judge at 3 s by default and passes on the free checks', async () => {
    vi.useFakeTimers();
    const never = fakeJudge(() => new Promise<string>(() => {}));
    const pending = reviewScript(opener, { backend: never });
    await vi.advanceTimersByTimeAsync(JUDGE_TIME_BOX_MS + 10);
    const r = await pending;
    expect(JUDGE_TIME_BOX_MS).toBeLessThanOrEqual(3000);
    expect(r).toMatchObject({ pass: true, judged: false, judgeError: 'timeout' });
  });

  it('runs the free checks only when no backend is configured', async () => {
    const r = await reviewScript(opener, { backend: null });
    expect(r).toMatchObject({ pass: true, judged: false });
    expect(r.judgeError).toBeUndefined();
  });

  it('cuts the lines the free checks drop before the judge hears them, and maps line numbers back', async () => {
    const lines: ReviewLine[] = [...newsGood.lines];
    lines.splice(5, 0, { role: 'news', delivery: 'normal', text: 'और Alkapuri में नए flyover की opening की खबर भी आ रही है।' });
    const judge = fakeJudge(verdict({ j_worst_line: '6', b_unsupported_en: 'L6: rain alert for two days', k_fix: 'Line 6: say who issued it.' }));
    const r = await reviewScript({ ...newsGood, lines }, { backend: judge });
    expect(r.dropLines).toEqual([5]);
    expect(r.softNotes.join(' ')).toMatch(/Alkapuri/);
    // The judge heard 13 lines, not 14, and never the invented one
    expect(judge.calls[0].user).not.toMatch(/Alkapuri में नए flyover/);
    expect(judge.calls[0].user).toMatch(/^13\. /m);
    expect(judge.calls[0].user).not.toMatch(/^14\. /m);
    // Its line 6 is the original line 7
    expect(r.worstLine).toBe(7);
    expect(r.invented).toContain('L7: rain alert for two days');
    expect(r.fixNote).toBe('Line 7: say who issued it.');
  });

  it('lets the subtle faults past the free checks to the judge', async () => {
    for (const c of BROKEN) {
      const judge = fakeJudge(verdict());
      await reviewScript({ ...c.input, plan: c.plan }, { backend: judge });
      expect(judge.calls, c.id).toHaveLength(1);
    }
  });
});

describe('the thresholds (bible §5.3)', () => {
  const s = (o: Partial<Record<string, number>>) => ({ hook: 4, coherence: 4, point_landed: 4, specificity: 4, fidelity: 5, story_resolved: null, cliffhanger: null, ...o });
  it('needs fidelity 5 for news and for links that hand over, 4 for fiction', () => {
    expect(scoreFailures({ type: 'news', mode: 'full' }, { scores: s({ fidelity: 4 }), invented: [] })).toEqual(['fidelity 4 < 5']);
    expect(scoreFailures({ type: 'rj_link', mode: 'kahani_in' }, { scores: s({ fidelity: 4 }), invented: [] })).toEqual([]);
    expect(scoreFailures({ type: 'ad_break' }, { scores: s({ fidelity: 4 }), invented: [] })).toEqual([]);
  });
  it('fails any score under 3, a mean under 3.6, a point under 4, a weak ending, an invented news claim', () => {
    expect(scoreFailures({ type: 'ad_break' }, { scores: s({ hook: 2 }), invented: [] })).toContain('hook 2 < 3');
    expect(scoreFailures({ type: 'ad_break' }, { scores: s({ hook: 3, coherence: 3, specificity: 3, fidelity: 4 }), invented: [] }).join(' ')).toMatch(/mean 3\.40 < 3\.6/);
    expect(scoreFailures({ type: 'ad_break' }, { scores: s({ point_landed: 3 }), invented: [] })).toContain('point_landed 3 < 4');
    expect(scoreFailures({ type: 'kahani', part: 3 }, { scores: s({ story_resolved: 3 }), invented: [] })).toContain('story_resolved 3 < 4');
    expect(scoreFailures({ type: 'news' }, { scores: s({}), invented: ['L4: x'] })).toContain('invented: 1');
    expect(DEFAULT_THRESHOLDS).toMatchObject({ minEach: 3, minMean: 3.6, minPoint: 4, fidelityFactual: 5, fidelityOther: 4, minEnding: 4 });
  });
});

describe('rewriteNote and betterReview', () => {
  const review = (o: Partial<Review>): Review => ({
    pass: false, scores: { hook: null, coherence: null, point_landed: null, specificity: null, fidelity: null, story_resolved: null, cliffhanger: null }, mean: null,
    heardSummaryEn: '', invented: [], faults: [], worstLine: null, fixNote: '', hardFailures: [], softNotes: [], scoreFailures: [], dropLines: [], judged: false, ms: 0, ...o,
  });
  it('quotes the worst line and lists the fix, the faults, the invented claims and the soft notes once each', () => {
    const note = rewriteNote(
      review({ worstLine: 2, fixNote: 'Line 2: cut the toll.', faults: ['L1: filler opener'], invented: ['L2: a new toll'], softNotes: ['Lines are all 40-45 characters.'] }),
      opener.lines,
    );
    expect(note.split('\n')[0]).toMatch(/^PRODUCER NOTE/);
    expect(note).toContain(`- Line 2: "${opener.lines[1].text}"`);
    expect(note).toContain('- Line 2: cut the toll.');
    expect(note).toContain('- Line 1: filler opener');
    expect(note).toContain('- Invented: Line 2: a new toll. It is not in the context; cut it.');
    expect(note).toContain('- Lines are all 40-45 characters.');
  });
  it('keeps the passing attempt, then the one with fewer hard failures, then fidelity, then the mean', () => {
    expect(betterReview(review({ pass: true }), review({}))).toBe('a');
    expect(betterReview(review({ hardFailures: ['x', 'y'] }), review({ hardFailures: ['x'] }))).toBe('b');
    const f = (fidelity: number, mean: number) => review({ scores: { hook: 4, coherence: 4, point_landed: 4, specificity: 4, fidelity, story_resolved: null, cliffhanger: null }, mean });
    expect(betterReview(f(3, 4.5), f(5, 3.9))).toBe('b');
    expect(betterReview(f(5, 4.1), f(5, 3.9))).toBe('a');
  });
});

describe('producerBackend', () => {
  const ai = { run: async () => ({ response: '{}' }) };
  it('uses Workers AI Gemma 4 by default, Sarvam when asked or without the binding, and nothing when off', () => {
    expect(producerBackend({ SARVAM_API_KEY: 'k', AI: ai })?.id).toBe('workers-ai:@cf/google/gemma-4-26b-a4b-it:free-json');
    expect(producerBackend({ SARVAM_API_KEY: 'k', AI: ai, PRODUCER_JUDGE: 'sarvam' })?.id).toBe('sarvam:sarvam-105b');
    expect(producerBackend({ AI: ai, PRODUCER_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8' })?.id).toMatch(/qwen3-30b/);
    expect(producerBackend({ SARVAM_API_KEY: 'k' })?.id).toBe('sarvam:sarvam-105b');
    expect(producerBackend({ SARVAM_API_KEY: 'k', AI: ai, PRODUCER_JUDGE: 'off' })).toBeNull();
    expect(producerBackend({})).toBeNull();
  });
});
