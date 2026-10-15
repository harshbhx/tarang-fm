/** The Kahani radio play. */
import type { SegmentRequest } from '../../shared/schemas';
import type { Station } from '../../shared/types';
import { STORY_CLICHES, storyBrief, castStory, type StoryAvoid, type StoryBrief, type StoryCast } from '../story';
import { genderWord, languageName, personNoun } from './common';

/** The kahani "plan" fields, filled first (see PLAN_FIELDS in ./index). */
export const KAHANI_PLAN_FIELDS: string[] = ['plan_title', 'plan_brief_use', 'plan_cast', 'plan_want', 'plan_clue', 'plan_turns', 'plan_twist', 'plan_last_image'];

// ---- §9 kahaniPrompt ------------------------------------------------------------------------

/** Everything a Kahani is built from: its premise, its cast and the stories it must not repeat. */
export interface StoryPlan {
  brief: StoryBrief;
  cast: StoryCast;
  /** Stories aired recently on this station by anyone (from the show memory) */
  aired?: string[];
  /** Normalized titles already aired; a repeat is rewritten */
  airedTitles?: ReadonlySet<string>;
}

export function storyPlan(station: Station, daypart: SegmentRequest['listener']['daypart'], avoid?: StoryAvoid): StoryPlan {
  const brief = storyBrief(station.id, daypart, Math.random, avoid);
  return { brief, cast: castStory(station, brief) };
}

export function kahaniPrompt(station: Station, req: SegmentRequest, plan: StoryPlan): string {
  const { brief, cast: storyCast } = plan;
  const cast = `narrator (${genderWord(storyCast.narrator)}), char_a (${personNoun('char_a', storyCast.char_a)}), char_b (${personNoun('char_b', storyCast.char_b)}), char_kid (${personNoun('char_kid', storyCast.char_kid)})`;
  const cliches = [...STORY_CLICHES.any, ...(STORY_CLICHES[station.id] ?? [])].join('; ');
  const earlierList = [...new Set([...(plan.aired ?? []), ...(req.recentStories ?? [])])].slice(-12);
  const earlier = earlierList.length ? earlierList.map((t) => `- ${t}`).join('\n') : '- none yet';
  const theme = req.theme
    ? `- A listener asked for: "${req.theme}". This is the heart of the story; bend the brief to serve it and keep any brief element that fits.\n`
    : '';
  return `Write a complete 10–14 line radio play in ${languageName(station)} that nobody has heard before. It airs straight after the RJ hands over, so it needs no introduction: drop the listener into it.

STORY BRIEF (build the story from this; every element must be audible in the script):
${theme}- Genre: ${brief.genre}
- Where: ${brief.setting}. Add one detail only someone from there would know.
- At the centre: ${brief.hook}
- How it's told: ${brief.telling}
- Twist type: ${brief.twist}
- The ending should feel: ${brief.ending}
- Character names (pick 2–3 that match each role's gender): masculine ${brief.names.masculine.join(', ')}; feminine ${brief.names.feminine.join(', ')}. Names may be adapted to the station script.

STORIES ALREADY ON AIR (this one must differ in premise, place, names, title and twist):
${earlier}

Cast for this story (use 3–4, by role id, with these genders): ${cast}

How it opens (${brief.opening.id}): ${brief.opening.how}
The title is 2–5 intriguing words and is spoken once, woven into a sentence. Never announce it ("today's story is…", "Kahani Corner presents…", the station's name). Generic titles like "the mystery" or "the ghost" are not allowed.

Then (the listener can only hear, never see):
- Early on, someone wants something specific, right now, and something stands in the way. We learn who people are from how they talk and what they want.
- The middle: each line changes the situation (a discovery, a lie, a mistake, a deadline). Plant the clue casually, so it is easy to miss.
- The turn: the twist, paid off by the clue. Fair, surprising, and it changes the meaning of what we heard.
- How it ends (${brief.closing.id}): ${brief.closing.how}

Writing rules:
- Dialogue carries the story; the narrator has at most 4 lines, and characters speak at least 6 lines.
- Every character sounds different: a verbal habit, a pet word or a rhythm of their own.
- Specific beats generic: "a steel tiffin with a dent shaped like Sri Lanka", never "an old box".
- No sound effects: sounds are spoken by the characters ("did you hear the shutter rattle?").
- Humour and fear come from character and situation, not from announcing them.
- Never use: ${cliches}.
- Never mention the listener, the RJ, the station or a dedication inside the story.
- Family-safe: spooky is fine, gore is not; nobody dies on air; the kid is safe at the end.

Delivery: narrator "dramatic" or "warm"; secrets "hushed"; scares "shout" (at most 2); panic "fast"; tender moments "sad" or "warm".

plan (English, fill first): plan_title, plan_brief_use (one phrase per brief element), plan_cast (name, role, verbal habit), plan_want, plan_clue, plan_turns (what changes in the middle), plan_twist, plan_last_image.
summary_en: title, place, hook and twist in one sentence (used to keep later stories different).
title: the story title in the station language.`;
}
