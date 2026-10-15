/**
 * The RJ fact packet: live sources (Open-Meteo forecast and air quality, NDMA SACHET) fetched in parallel with
 * timeouts and caches, plus the static pools. A source that fails only means fewer facts, never an error.
 * Ranking prefers what is timely and useful to a listener right now:
 * alert > rain > bad air > other notable weather > festival today/tomorrow > cricket today > festival this week
 * > cricket tomorrow > countdown > cricket this week > on this day > city fact.
 */
import type { StationId, Weather } from '../../shared/types';
import { airFact, clearAirCache, getAirReading, isBadAir } from './air';
import { alertFact, alertsFor, clearAlertCache, getAlerts, normalizeState } from './alerts';
import { festivalFacts } from './calendar';
import { cityFacts, cityInfo } from './cityFacts';
import { cricketFacts } from './cricket';
import { onThisDayFacts } from './onThisDay';
import type { Fact, FactLang, FactPacket, FactPacketInput, FactType } from './types';
import { factLang, gridKey, istParts } from './util';
import { clearWeatherCache, getWeatherReading, toWeather, weatherNotableFact, weatherNowFact } from './weather';

function coord(value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Coordinates from the edge, else the curated city's centre. */
function resolvePlace(city?: string, lat?: number | string, lon?: number | string) {
  const info = cityInfo(city);
  const la = coord(lat);
  const lo = coord(lon);
  const has = la !== undefined && lo !== undefined && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
  return { info, lat: has ? la : info?.lat, lon: has ? lo : info?.lon };
}

const safe = <T>(p: Promise<T | undefined> | undefined): Promise<T | undefined> => (p ? p.catch(() => undefined) : Promise.resolve(undefined));

export async function buildFactPacket(input: FactPacketInput): Promise<FactPacket> {
  const { now } = input;
  const station: StationId = input.station.id;
  const lang = factLang(station);
  const today = istParts(now);
  const { info, lat, lon } = resolvePlace(input.city, input.lat, input.lon);
  const state = normalizeState(input.region) ?? info?.state;
  const grid = lat !== undefined && lon !== undefined ? gridKey(lat, lon) : undefined;
  const alertNames = info?.alertNames ?? (input.city?.trim() ? [input.city.trim()] : []);

  const [wx, air, alerts] = await Promise.all([
    safe(grid ? getWeatherReading(lat!, lon!, now) : undefined),
    safe(grid ? getAirReading(lat!, lon!, now) : undefined),
    safe(alertNames.length ? getAlerts(state, now) : undefined),
  ]);

  const candidates: Fact[] = [];
  const push = (f: Fact | undefined) => f && candidates.push(f);
  for (const a of alertsFor(alerts ?? [], { names: alertNames, state }, now)) push(alertFact(a, info?.names));
  if (wx && grid) push(weatherNotableFact(wx, now, grid));
  if (grid) push(airFact(air, now, grid));
  if (lang) candidates.push(...festivalFacts(today.date, lang, state, now));
  candidates.push(...cricketFacts(now), ...onThisDayFacts(now), ...cityFacts(info, now));

  const used = new Set(input.usedFactIds ?? []);
  const seen = new Set<string>();
  const facts = candidates
    .filter((f) => f.expiresAt > now && !used.has(f.id) && !seen.has(f.id) && seen.add(f.id))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.priority - a.f.priority || a.i - b.i)
    .map(({ f }) => f);

  const weather = toWeather(wx, now, air?.pm25, isBadAir(air));
  const opener = { weather, facts: wx && grid && weather ? [weatherNowFact(wx, now, grid)] : [] };
  const { chosen, backup } = pickFacts(facts);

  return {
    v: 1,
    builtAt: now,
    station,
    today: { date: today.date, time: today.time, weekday: today.weekday, hour: today.hour },
    place: {
      ...(info ? { cityKey: info.key } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(info && lang ? { cityNative: info.names[lang] } : {}),
      ...(state ? { region: state } : {}),
      ...(lat !== undefined ? { lat, lon } : {}),
    },
    opener,
    facts,
    ...(chosen ? { chosen } : {}),
    ...(backup ? { backup } : {}),
    sources: { weather: !!wx, air: !!air, alerts: !!alerts },
  };
}

/**
 * The fact a link should carry and a backup of a different type. `types` limits the pick (e.g. after heavy news:
 * on_this_day, city_fact or weather); `avoidTypes` skips types aired in the last links.
 */
export function pickFacts(facts: Fact[], opts: { types?: FactType[]; avoidTypes?: string[] } = {}): { chosen?: Fact; backup?: Fact } {
  const pool = facts.filter((f) => (!opts.types || opts.types.includes(f.type)) && !opts.avoidTypes?.includes(f.type));
  const chosen = pool[0];
  const backup = pool.find((f) => f !== chosen && f.type !== chosen?.type) ?? pool[1];
  return { chosen, backup };
}

/** Everything a script in this language must keep verbatim for the fact. */
export function keptFor(fact: Fact, station: StationId): string[] {
  const lang: FactLang | undefined = factLang(station);
  return [...fact.keptTokens, ...((lang && fact.keptNative?.[lang]) || [])];
}

/** The extended Weather shape (notable, rainChance3h, pm25) for the opener. Never throws. */
export async function weatherForRequest(input: { lat?: number | string; lon?: number | string; city?: string; now?: number }): Promise<Weather | undefined> {
  const now = input.now ?? Date.now();
  const { lat, lon } = resolvePlace(input.city, input.lat, input.lon);
  if (lat === undefined || lon === undefined) return undefined;
  const [wx, air] = await Promise.all([safe(getWeatherReading(lat, lon, now)), safe(getAirReading(lat, lon, now))]);
  return toWeather(wx, now, air?.pm25, isBadAir(air));
}

/** Drops every cached source (tests). */
export function clearFactCaches(): void {
  clearWeatherCache();
  clearAirCache();
  clearAlertCache();
}
