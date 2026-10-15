/** RJ facts: one true, scoped, timely point per link. See packet.ts for the ranking. */
export { buildFactPacket, clearFactCaches, keptFor, pickFacts, weatherForRequest } from './packet';
export type { Fact, FactLang, FactPacket, FactPacketInput, FactType } from './types';
export { describeCode, notableOf, parseForecast, toWeather } from './weather';
export { isBadAir, naqiOf, parseAir } from './air';
export { alertMatches, alertsFor, normalizeState, parseSachet } from './alerts';
export { festivalFacts } from './calendar';
export { cricketFacts, fixtureFor } from './cricket';
export { onThisDayFacts } from './onThisDay';
export { cityFacts, cityInfo } from './cityFacts';
