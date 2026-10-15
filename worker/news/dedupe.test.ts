import { describe, expect, it } from 'vitest';
import { assignClusters, combined, cosine, LEXICAL_MERGE, relation, similarity, titleKey } from './dedupe';
import { DUP_PAIRS } from './dup-pairs.fixture';

describe('lexical similarity', () => {
  it('reproduces the research measurements on real cross-outlet pairs', () => {
    expect(DUP_PAIRS.length).toBeGreaterThan(10);
    for (const [lexical, a, b] of DUP_PAIRS) expect(Math.abs(similarity(a, b) - lexical), `${a} | ${b}`).toBeLessThan(0.02);
  });
  it('merges the same story told by two outlets and keeps different stories apart', () => {
    const a = 'राहुल-प्रियंका इंडिया गेट पर अंकिता भंडारी के माता-पिता से मिले';
    const b = 'अंकिता के परिवार से इंडिया गेट जाकर मिले राहुल-प्रियंका';
    expect(similarity(a, b)).toBeGreaterThanOrEqual(LEXICAL_MERGE);
    expect(similarity('रेलवे कर्मचारियों को दिवाली बोनस', 'पेंशन नियम में बदलाव की तैयारी')).toBeLessThan(0.35);
  });
  it('builds an order-free title key', () => {
    expect(titleKey('मोदी ने किया उद्घाटन, वडोदरा में')).toBe(titleKey('वडोदरा में उद्घाटन किया मोदी ने'));
  });
});

describe('embedding clusters', () => {
  const v = (...xs: number[]) => xs;
  it('maps cosine to story / topic / none at 0.80 and 0.70 (calibrated on real items)', () => {
    expect(relation(0.87)).toBe('story');
    expect(relation(0.75)).toBe('topic');
    expect(relation(0.43)).toBe('none');
    // lexical support: 0.36 overlap plus cosine 0.72 is the same story; 0.45 overlap always is
    expect(relation(combined(0.73, 0.4))).toBe('story');
    expect(relation(combined(0.5, 0.5))).toBe('story');
    expect(relation(combined(0.73, 0.2))).toBe('topic');
    expect(cosine(v(1, 0), v(1, 0))).toBeCloseTo(1);
  });
  it('joins a same-story item, shares a topic for a related one, and starts fresh otherwise', () => {
    const out = assignClusters([
      { id: 'a', title: 'गुजरात में भारी बारिश का अलर्ट', vector: v(1, 0, 0) },
      { id: 'b', title: 'ગુજરાતમાં ભારે વરસાદની આગાહી', vector: v(0.99, 0.1, 0) }, // cross-lingual same story
      { id: 'c', title: 'बारिश से फसलों को नुकसान', vector: v(0.75, 0, 0.66) }, // same topic (cos ≈ 0.75)
      { id: 'd', title: 'शेयर बाजार में तेजी', vector: v(0, 0, 1) },
    ]);
    expect(out.get('b')).toEqual({ clusterId: 'a', topicId: 'a' });
    expect(out.get('c')).toEqual({ clusterId: 'c', topicId: 'a' });
    expect(out.get('d')).toEqual({ clusterId: 'd', topicId: 'd' });
  });
  it('joins an existing story from an earlier refresh (vector index neighbours)', () => {
    const out = assignClusters([{ id: 'new', title: 'x', vector: v(1, 0) }], new Map([['new', [{ clusterId: 'old', topicId: 'oldTopic', score: 0.91 }]]]));
    expect(out.get('new')).toEqual({ clusterId: 'old', topicId: 'oldTopic' });
    // a weak cosine with a near-identical stored title is still the same story
    const lex = assignClusters(
      [{ id: 'n2', title: 'નવમા નોરતે દક્ષિણ ગુજરાત અને સૌરાષ્ટ્રમાં માવઠાની આગાહી', vector: v(1, 0) }],
      new Map([['n2', [{ clusterId: 'o2', topicId: 'o2', score: 0.6, title: 'નવમા નોરતે દક્ષિણ ગુજરાત અને સૌરાષ્ટ્રમાં હળવા વરસાદની આગાહી' }]]]),
    );
    expect(lex.get('n2')?.clusterId).toBe('o2');
  });
  it('merges lexical duplicates even without embeddings', () => {
    const out = assignClusters([
      { id: 'a', title: 'स्टारलिंक को मंजूरी मिलने में देरी क्यों? निशिकांत दुबे की समिति करेगी मंथन' },
      { id: 'b', title: 'स्टारलिंक पर संसदीय समिति की नजर, मंजूरी मिलने में देरी क्यों?' },
    ]);
    expect(out.get('b')?.clusterId).toBe('a');
  });
});
