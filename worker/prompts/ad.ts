/**
 * The ad break (bible §4.3, prompt pack §5): one parody of a format every Indian listener knows, for an
 * invented product that solves a real everyday problem, built backwards from its punchline. The ad gets
 * no show log, city, weather or listener; only the time of year, and a festival when code allows one.
 */
import { DELIVERIES } from '../../shared/constants';
import type { SegmentRequest } from '../../shared/schemas';
import type { Station } from '../../shared/types';
import { festivalLine, pickAd, seasonLine, type AdPick } from '../pools/ads';
import { fictionLocale } from '../story';
import { EN_FIELD, genderWord, languageName, personNoun } from './common';

/** Filled before the lines, punchline first (see PLAN_FIELDS in ./index). */
export const AD_PLAN_FIELDS: string[] = ['plan_punchline', 'plan_product', 'plan_brand_pun', 'plan_signature'];

/** Everything an ad is built from, and the ads it must not repeat. */
export interface AdPlan extends AdPick {
  aired?: string[];
  airedTitles?: ReadonlySet<string>;
}

export function adJsonSchema(subtitles: boolean): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...AD_PLAN_FIELDS, 'title', 'lines', 'summary_en'],
    properties: {
      ...Object.fromEntries(AD_PLAN_FIELDS.map((k) => [k, { type: 'string' }])),
      title: { type: 'string' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['role', 'text', ...(subtitles ? ['en'] : []), 'delivery'],
          properties: {
            role: { type: 'string', enum: ['ad_announcer', 'ad_customer'] },
            text: { type: 'string' },
            ...(subtitles ? EN_FIELD : {}),
            delivery: { type: 'string', enum: [...DELIVERIES] },
          },
        },
      },
      summary_en: { type: 'string' },
    },
  };
}

function tncRule(station: Station, plan: AdPick): string {
  const tnc = fictionLocale(station.id).tnc;
  if (plan.card.tnc === 'required') return `required: a fast fine-print line near the end (delivery "fast"), starting "${tnc}" or reading like small print; the punchline lives in it.`;
  if (plan.card.tnc === 'optional') return `optional: only if it carries the joke (delivery "fast", "${tnc}").`;
  return 'none.';
}

function examples(station: Station, plan: AdPick): string {
  const sets = fictionLocale(station.id).adExamples.filter((e) => e.format !== plan.card.id);
  const set = sets[Math.floor(Math.random() * sets.length)];
  const good = set ? `GOOD (${set.format.replace('_', ' ')}): ${set.lines.map((l) => `${l.role} · ${l.delivery} · "${l.text}"`).join(' then ')}\n` : '';
  return `Examples (style only. Never copy the wording, brand or joke):
${good}BAD: "This product will change your life, buy it today!" (no format, no joke)
BAD: "In a low voice: this is my secret, delivery hushed." (a stage direction read aloud)`;
}

export function adPrompt(station: Station, req: SegmentRequest, plan?: AdPlan): string {
  const pick: AdPlan = plan ?? pickAd(station.id, { localDate: req.listener.localDate, region: req.listener.region });
  const lang = languageName(station);
  const [min, max] = pick.card.lines;
  const aired = [
    ...new Set([...(pick.aired ?? []), ...(req.showLog ?? []).filter((e) => e.type === 'ad_break').map((e) => e.summary)]),
  ].slice(-8);
  const festive = pick.festival
    ? `FESTIVAL: it may touch ${festivalLine(pick.festival, station.id)}. One light mention, no religious content.`
    : 'No festival, no city, no weather, no listener.';
  return `Write one 15-20 second spoof ad in ${lang}: ${min}-${max} lines, under 400 characters in all.

FORMAT: ${pick.card.name}. Listeners must recognise it from line 1: ${pick.card.signature}
BEATS (role · delivery · what happens):
${pick.card.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}
THE PUNCHLINE goes in: ${pick.card.punchline}
HOW THE JOKE WORKS: ${pick.card.pattern}${pick.problem.id !== pick.card.exampleProblem ? `\nTHE PATTERN ON ANOTHER PROBLEM (for the logic only; never reuse it): ${pick.card.example}` : ''}
FINE PRINT: ${tncRule(station, pick)}
EVERYDAY PROBLEM it solves: ${pick.problem.en}
TIME OF YEAR: ${seasonLine(station.id, pick.month)}. Everything in the ad must fit it.
${festive}
ALREADY AIRED (make this one different in product, brand and joke): ${aired.length ? aired.join(' | ') : 'none'}

Rules:
- Write the punchline first (plan_punchline), then lines that set it up. The product really solves the PROBLEM; the joke is the format's one twist. One joke, landed once, in the last or second-to-last line. After it, nothing but the brand or a tagline.
- It must make sense to a listener: a real situation, a product that logically fits the problem, a punchline that follows from the setup. No random objects, no magic powers.
- Brand: invented, a ${lang} pun on the problem or on what the product does, said once or twice. Never a real brand, person or slogan.
- "text" holds only the spoken words. The delivery cues in BEATS go in "delivery", never in "text": no brackets, no labels, no "delivery:".
- ${lang} sentences. English only for single everyday words, the fine print or a 2-4 word tagline. No real medical, legal or money promises; no jokes about bodies, skin colour, caste or region.
Role values: ad_announcer = the announcer (${genderWord(station.cast.ad_announcer)}); ad_customer = the customer, and any second voice (${personNoun('ad_customer', station.cast.ad_customer)}).

plan_punchline: the joke, in ${lang} (at most 12 words): HOW THE JOKE WORKS applied to this PROBLEM, exactly what the last or second-to-last line will say. A listener must get it at once, with no explanation.
plan_product: the invented product and how it solves the PROBLEM, in one English line.
plan_brand_pun: the brand, and what the pun is on.
plan_signature: how line 1 makes the format obvious.
title: the brand name, a ${lang} word in ${lang} script (an English word may follow it, in Latin).
summary_en: the format, product, brand and punchline in one sentence, only as the lines say it.

${examples(station, pick)}`;
}
