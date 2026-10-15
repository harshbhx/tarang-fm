import { describe, expect, it } from 'vitest';
import { newsFidelity } from './news';

const slate = [
  '12 मिनट, 5.5 किलो सोना… वडोदरा में मुंबई के कारोबारी को 8 करोड़ की चपत',
  'स्थानीय मीडिया',
  'ISRO ने PSLV से नया उपग्रह छोड़ा',
  'ગુજરાતમાં નવી સૌર નીતિ લાગુ, દિવ્ય ભાસ્કર',
].join(' ');
const frame = 'रात के सवा आठ 20:15 8 15 तरंग FM 91.1 सिमरन वडोदरा गुजरात';

const lines = (...texts: string[]) => texts.map((text) => ({ text, role: 'news' }));

describe('newsFidelity', () => {
  it('keeps lines whose numbers, Latin words and places come from the slate or frame', () => {
    const { lines: kept, dropped } = newsFidelity(
      lines(
        'रात के सवा आठ की खबरें, तरंग FM पर। मैं हूँ सिमरन।',
        'वडोदरा से: मुंबई के एक कारोबारी से 12 मिनट में 5.5 किलो सोना ठगा गया, स्थानीय मीडिया के मुताबिक।',
        'देश में: ISRO ने PSLV से नया उपग्रह छोड़ा।',
        // a Gujarati item read in Hindi: गुजरात is the same place as ગુજરાત
        'गुजरात से खबर: राज्य में नई सौर नीति लागू हुई, दिव्य भास्कर के मुताबिक।',
      ),
      slate,
      frame,
    );
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(4);
  });

  it('drops invented numbers, Latin names and places (the Alkapuri flyover problem)', () => {
    const { lines: kept, dropped } = newsFidelity(
      lines(
        'वडोदरा से: कारोबारी को 9 करोड़ की चपत लगी।',
        'Alkapuri flyover की opening की खबर भी आ रही है।',
        'अहमदाबाद में भी ऐसी ही घटना हुई।',
        'ये थीं रात के सवा आठ की खबरें।',
      ),
      slate,
      frame,
    );
    expect(kept.map((l) => l.text)).toEqual(['ये थीं रात के सवा आठ की खबरें।']);
    expect(dropped.map((d) => d.reason)).toEqual(['number 9', 'word "alkapuri"', 'place अहमदाबाद']);
  });

  it('treats Indic digits like ASCII digits', () => {
    expect(newsFidelity(lines('१२ मिनट में ठगी।'), slate, frame).dropped).toEqual([]);
  });
});
