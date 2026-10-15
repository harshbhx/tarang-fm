/** The ad break. */
import type { SegmentRequest } from '../../shared/schemas';
import type { Station } from '../../shared/types';
import { adBrief, type AdFormat } from '../story';
import { genderWord, languageName } from './common';

/** The ad_break "plan" fields, filled first (see PLAN_FIELDS in ./index). */
export const AD_PLAN_FIELDS: string[] = ['plan_product', 'plan_brand_pun', 'plan_problem', 'plan_absurd_claim', 'plan_tagline', 'plan_format_beats'];

// ---- §8 adPrompt ----------------------------------------------------------------------------

/** Everything an ad is built from, and the ads it must not repeat. */
export interface AdPlan {
  category: string;
  format: AdFormat;
  aired?: string[];
  airedTitles?: ReadonlySet<string>;
}

export function adPrompt(station: Station, req: SegmentRequest, plan?: AdPlan): string {
  const customer = genderWord(station.cast.ad_customer);
  const announcer = genderWord(station.cast.ad_announcer);
  const { category, format } = plan ?? adBrief();
  const earlier = [
    ...new Set([...(plan?.aired ?? []), ...(req.showLog ?? []).filter((e) => e.type === 'ad_break').map((e) => e.summary)]),
  ].slice(-10);
  return `Write a 20–30 second comedy radio ad for an invented product: 4–7 lines, under 450 characters total.

Category: ${category}
Format: ${format.id}
Cast: customer (${customer}), announcer (${announcer}), happy_customer (${customer})
(Role values: customer and happy_customer are both "ad_customer"; announcer is "ad_announcer".)
${earlier.length ? `Ads already on air (make this one completely different in product, brand, joke and shape): ${earlier.join(' | ')}\n` : ''}
Shape for the "${format.id}" format, played straight-faced and over the top:
${format.shape}

Brand name: invented, a ${languageName(station)} or English-mixed pun on the product. Never a real brand, person or politician.
Comedy: one absurd idea, pushed further each line. Specific beats generic ("it folds into a samosa shape", not "it is very useful"). No medical, legal or money claims.
${station.language === 'hi-IN' ? '' : `Write every line in ${languageName(station)}.\n`}Don't reuse any example wording from these instructions.

plan (English, fill first): plan_product, plan_brand_pun, plan_problem, plan_absurd_claim, plan_tagline, plan_format_beats.
summary_en: product, brand and format in one sentence (so the RJ can joke about it later).
title: the product name in the station language.
Time of day for flavour: ${req.listener.daypart}.`;
}
