/** Verified news feeds per station, state and city (generated from the newsroom research catalog, 2026-10-15). */
import type { Bucket, FeedSource, NewsLang } from './types';

/** Core feeds per station: tier 1 = every refresh, 2 = full refresh, 3 = top-up/fallback only. */
export const STATION_FEEDS: Record<Exclude<NewsLang, 'en'>, FeedSource[]> = {
  hi: [
    { id: "bbc-hi", lang: "hi", bucket: "national", publisher: "bbc", url: "https://feeds.bbci.co.uk/hindi/rss.xml", tier: 1, mixed: true },
    { id: "bhaskar-national", lang: "hi", bucket: "national", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1061.xml", tier: 1 },
    { id: "amarujala-india", lang: "hi", bucket: "national", publisher: "amarujala", url: "https://www.amarujala.com/rss/india-news.xml", tier: 1, clampFutureDates: true },
    { id: "news18-hi-nation", lang: "hi", bucket: "national", publisher: "news18", url: "https://hindi.news18.com/rss/khabar/nation/nation.xml", tier: 2 },
    { id: "tv9-hi-india", lang: "hi", bucket: "national", publisher: "tv9", url: "https://www.tv9hindi.com/india/feed", tier: 2 },
    { id: "abp-hi-india", lang: "hi", bucket: "national", publisher: "abp", url: "https://www.abplive.com/news/india/feed", tier: 2 },
    { id: "aajtak-home", lang: "hi", bucket: "national", publisher: "aajtak", url: "https://www.aajtak.in/rssfeeds/?id=home", tier: 3, mixed: true },
    { id: "livehindustan-national", lang: "hi", bucket: "national", publisher: "livehindustan", url: "https://api.livehindustan.com/feeds/rss/national/rssfeed.xml", tier: 3 },
    { id: "bhaskar-world", lang: "hi", bucket: "world", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1125.xml", tier: 1 },
    { id: "amarujala-world", lang: "hi", bucket: "world", publisher: "amarujala", url: "https://www.amarujala.com/rss/world.xml", tier: 1, clampFutureDates: true },
    { id: "news18-hi-world", lang: "hi", bucket: "world", publisher: "news18", url: "https://hindi.news18.com/rss/khabar/world/world.xml", tier: 2 },
    { id: "tv9-hi-world", lang: "hi", bucket: "world", publisher: "tv9", url: "https://www.tv9hindi.com/world/feed", tier: 2 },
    { id: "un-hi", lang: "hi", bucket: "world", publisher: "unnews", url: "https://news.un.org/feed/subscribe/hi/news/all/rss.xml", tier: 3 },
    { id: "bhaskar-cricket", lang: "hi", bucket: "sports", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-5176.xml", tier: 1 },
    { id: "news18-hi-cricket", lang: "hi", bucket: "sports", publisher: "news18", url: "https://hindi.news18.com/commonfeeds/v1/hin/rss/cricket.xml", tier: 1 },
    { id: "tv9-hi-sports", lang: "hi", bucket: "sports", publisher: "tv9", url: "https://www.tv9hindi.com/sports/feed", tier: 2 },
    { id: "amarujala-cricket", lang: "hi", bucket: "sports", publisher: "amarujala", url: "https://www.amarujala.com/rss/cricket.xml", tier: 2, clampFutureDates: true },
    { id: "bhaskar-business", lang: "hi", bucket: "business", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1051.xml", tier: 1 },
    { id: "news18-hi-business", lang: "hi", bucket: "business", publisher: "news18", url: "https://hindi.news18.com/commonfeeds/v1/hin/rss/business.xml", tier: 1 },
    { id: "tv9-hi-business", lang: "hi", bucket: "business", publisher: "tv9", url: "https://www.tv9hindi.com/business/feed", tier: 2 },
    { id: "bhaskar-bollywood", lang: "hi", bucket: "entertainment", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-11215.xml", tier: 1 },
    { id: "news18-hi-entertainment", lang: "hi", bucket: "entertainment", publisher: "news18", url: "https://hindi.news18.com/commonfeeds/v1/hin/rss/entertainment.xml", tier: 1 },
    { id: "amarujala-entertainment", lang: "hi", bucket: "entertainment", publisher: "amarujala", url: "https://www.amarujala.com/rss/entertainment.xml", tier: 2, clampFutureDates: true },
    { id: "amarujala-technology", lang: "hi", bucket: "science", publisher: "amarujala", url: "https://www.amarujala.com/rss/technology.xml", tier: 2, clampFutureDates: true },
    { id: "bhaskar-tech", lang: "hi", bucket: "science", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-5707.xml", tier: 3 },
  ],
  mr: [
    { id: "bbc-mr", lang: "mr", bucket: "national", publisher: "bbc", url: "https://feeds.bbci.co.uk/marathi/rss.xml", tier: 1, mixed: true },
    { id: "news18-mr-national", lang: "mr", bucket: "national", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/national.xml", tier: 1 },
    { id: "tv9-mr-national", lang: "mr", bucket: "national", publisher: "tv9", url: "https://www.tv9marathi.com/national/feed", tier: 1 },
    { id: "mt-desh", lang: "mr", bucket: "national", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/2429064.xml", tier: 2 },
    { id: "abp-mr-india", lang: "mr", bucket: "national", publisher: "abp", url: "https://marathi.abplive.com/news/india/feed", tier: 2 },
    { id: "news18-mr-maharashtra", lang: "mr", bucket: "state", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/maharashtra.xml", tier: 1, state: "MH" },
    { id: "tv9-mr-maharashtra", lang: "mr", bucket: "state", publisher: "tv9", url: "https://www.tv9marathi.com/maharashtra/feed", tier: 1, state: "MH" },
    { id: "abp-mr-maharashtra", lang: "mr", bucket: "state", publisher: "abp", url: "https://marathi.abplive.com/news/maharashtra/feed", tier: 1, state: "MH" },
    { id: "tv9-mr-international", lang: "mr", bucket: "world", publisher: "tv9", url: "https://www.tv9marathi.com/international/feed", tier: 1 },
    { id: "mt-international", lang: "mr", bucket: "world", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/47416501.xml", tier: 1 },
    { id: "abp-mr-world", lang: "mr", bucket: "world", publisher: "abp", url: "https://marathi.abplive.com/news/world/feed", tier: 2 },
    { id: "tv9-mr-sports", lang: "mr", bucket: "sports", publisher: "tv9", url: "https://www.tv9marathi.com/sports/feed", tier: 1 },
    { id: "news18-mr-sport", lang: "mr", bucket: "sports", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/sport.xml", tier: 1 },
    { id: "abp-mr-sports", lang: "mr", bucket: "sports", publisher: "abp", url: "https://marathi.abplive.com/sports/feed", tier: 2 },
    { id: "mt-business", lang: "mr", bucket: "business", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/2429061.xml", tier: 1 },
    { id: "news18-mr-money", lang: "mr", bucket: "business", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/money.xml", tier: 1 },
    { id: "tv9-mr-business", lang: "mr", bucket: "business", publisher: "tv9", url: "https://www.tv9marathi.com/business/feed", tier: 2 },
    { id: "tv9-mr-entertainment", lang: "mr", bucket: "entertainment", publisher: "tv9", url: "https://www.tv9marathi.com/entertainment/feed", tier: 1 },
    { id: "news18-mr-entertainment", lang: "mr", bucket: "entertainment", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/entertainment.xml", tier: 1 },
    { id: "abp-mr-entertainment", lang: "mr", bucket: "entertainment", publisher: "abp", url: "https://marathi.abplive.com/entertainment/feed", tier: 2 },
    { id: "mt-science-tech", lang: "mr", bucket: "science", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/2499476.xml", tier: 1 },
    { id: "news18-mr-agriculture", lang: "mr", bucket: "kicker", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/agriculture.xml", tier: 3 },
    { id: "bbc-world-en", lang: "en", bucket: "world", publisher: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml", tier: 3 },
  ],
  ta: [
    { id: "bbc-ta", lang: "ta", bucket: "national", publisher: "bbc", url: "https://feeds.bbci.co.uk/tamil/rss.xml", tier: 1, mixed: true },
    { id: "news18-ta-national", lang: "ta", bucket: "national", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/national.xml", tier: 1 },
    { id: "dinamani", lang: "ta", bucket: "national", publisher: "dinamani", url: "https://www.dinamani.com/stories.rss", tier: 2, mixed: true },
    { id: "tv9-ta-latest", lang: "ta", bucket: "national", publisher: "tv9", url: "https://www.tv9tamilnews.com/feedapi/latest-news/", tier: 2, mixed: true },
    { id: "abp-ta-india", lang: "ta", bucket: "national", publisher: "abp", url: "https://tamil.abplive.com/news/india/feed", tier: 2 },
    { id: "oneindia-ta", lang: "ta", bucket: "national", publisher: "oneindia", url: "https://tamil.oneindia.com/rss/tamil-news-fb.xml", tier: 3, mixed: true },
    { id: "news18-ta-tamilnadu", lang: "ta", bucket: "state", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/tamil-nadu.xml", tier: 1, state: "TN" },
    { id: "samayam-ta-tamilnadu", lang: "ta", bucket: "state", publisher: "samayam", url: "https://tamil.samayam.com/tamil-nadu/news/rssfeed/48069549.xml", tier: 1, state: "TN" },
    { id: "abp-ta-tamilnadu", lang: "ta", bucket: "state", publisher: "abp", url: "https://tamil.abplive.com/news/tamil-nadu/feed", tier: 1, state: "TN" },
    { id: "news18-ta-international", lang: "ta", bucket: "world", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/international.xml", tier: 1 },
    { id: "samayam-ta-world", lang: "ta", bucket: "world", publisher: "samayam", url: "https://tamil.samayam.com/international-news/rssfeed/48069531.xml", tier: 2 },
    { id: "news18-ta-sports", lang: "ta", bucket: "sports", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/sports.xml", tier: 1 },
    { id: "samayam-ta-cricket", lang: "ta", bucket: "sports", publisher: "samayam", url: "https://tamil.samayam.com/sports/cricket/news/rssfeed/51196046.xml", tier: 1 },
    { id: "abp-ta-sports", lang: "ta", bucket: "sports", publisher: "abp", url: "https://tamil.abplive.com/sports/feed", tier: 2 },
    { id: "news18-ta-business", lang: "ta", bucket: "business", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/business.xml", tier: 1 },
    { id: "abp-ta-business", lang: "ta", bucket: "business", publisher: "abp", url: "https://tamil.abplive.com/business/feed", tier: 2 },
    { id: "news18-ta-cinema", lang: "ta", bucket: "entertainment", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/entertainment/cinema.xml", tier: 1 },
    { id: "samayam-ta-cinema", lang: "ta", bucket: "entertainment", publisher: "samayam", url: "https://tamil.samayam.com/tamil-cinema/movie-news/rssfeed/45939402.xml", tier: 1 },
    { id: "abp-ta-entertainment", lang: "ta", bucket: "entertainment", publisher: "abp", url: "https://tamil.abplive.com/entertainment/feed", tier: 2 },
    { id: "news18-ta-technology", lang: "ta", bucket: "science", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/technology.xml", tier: 2 },
    { id: "bbc-world-en", lang: "en", bucket: "world", publisher: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml", tier: 3 },
  ],
  bn: [
    { id: "news18-bn-national", lang: "bn", bucket: "national", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/national.xml", tier: 1 },
    { id: "abp-bn-india", lang: "bn", bucket: "national", publisher: "abp", url: "https://bengali.abplive.com/news/india/feed", tier: 1 },
    { id: "tv9-bn-home", lang: "bn", bucket: "national", publisher: "tv9", url: "https://tv9bangla.com/feed", tier: 3, mixed: true },
    { id: "news18-bn-westbengal", lang: "bn", bucket: "state", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/west-bengal.xml", tier: 1, state: "WB" },
    { id: "abp-bn-westbengal", lang: "bn", bucket: "state", publisher: "abp", url: "https://bengali.abplive.com/news/west-bengal/feed", tier: 1, state: "WB" },
    { id: "abp-bn-district", lang: "bn", bucket: "state", publisher: "abp", url: "https://bengali.abplive.com/district/feed", tier: 1, state: "WB" },
    { id: "pratidin", lang: "bn", bucket: "state", publisher: "pratidin", url: "https://www.sangbadpratidin.in/feed/", tier: 2, state: "WB" },
    { id: "news18-bn-international", lang: "bn", bucket: "world", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/international.xml", tier: 1 },
    { id: "bbc-bn", lang: "bn", bucket: "world", publisher: "bbc", url: "https://feeds.bbci.co.uk/bengali/rss.xml", tier: 1 },
    { id: "dw-bn", lang: "bn", bucket: "world", publisher: "dw", url: "https://rss.dw.com/rdf/rss-ben-all", tier: 2 },
    { id: "abp-bn-sports", lang: "bn", bucket: "sports", publisher: "abp", url: "https://bengali.abplive.com/sports/feed", tier: 1 },
    { id: "news18-bn-sports", lang: "bn", bucket: "sports", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/sports.xml", tier: 1 },
    { id: "abp-bn-business", lang: "bn", bucket: "business", publisher: "abp", url: "https://bengali.abplive.com/business/feed", tier: 1 },
    { id: "news18-bn-business", lang: "bn", bucket: "business", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/business.xml", tier: 1 },
    { id: "abp-bn-entertainment", lang: "bn", bucket: "entertainment", publisher: "abp", url: "https://bengali.abplive.com/entertainment/feed", tier: 1 },
    { id: "news18-bn-entertainment", lang: "bn", bucket: "entertainment", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/entertainment.xml", tier: 1 },
    { id: "news18-bn-technology", lang: "bn", bucket: "science", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/technology.xml", tier: 2 },
    { id: "news18-bn-offbeat", lang: "bn", bucket: "kicker", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/off-beat.xml", tier: 2 },
  ],
  gu: [
    { id: "bbc-gu", lang: "gu", bucket: "national", publisher: "bbc", url: "https://feeds.bbci.co.uk/gujarati/rss.xml", tier: 1, mixed: true },
    { id: "divya-india", lang: "gu", bucket: "national", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-1037.xml", tier: 1 },
    { id: "tv9-gu-national", lang: "gu", bucket: "national", publisher: "tv9", url: "https://tv9gujarati.com/national/feed", tier: 1 },
    { id: "abp-gu-india", lang: "gu", bucket: "national", publisher: "abp", url: "https://gujarati.abplive.com/india/feed", tier: 2 },
    { id: "ie-gu", lang: "gu", bucket: "national", publisher: "iegu", url: "https://gujarati.indianexpress.com/feed/", tier: 3, mixed: true },
    { id: "divya-gujarat", lang: "gu", bucket: "state", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-1035.xml", tier: 1, state: "GJ" },
    { id: "news18-gu-gujarat", lang: "gu", bucket: "state", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/gujarat.xml", tier: 1, state: "GJ" },
    { id: "tv9-gu-gujarat", lang: "gu", bucket: "state", publisher: "tv9", url: "https://tv9gujarati.com/gujarat/feed", tier: 1, state: "GJ" },
    { id: "abp-gu-gujarat", lang: "gu", bucket: "state", publisher: "abp", url: "https://gujarati.abplive.com/gujarat/feed", tier: 2, state: "GJ" },
    { id: "gstv", lang: "gu", bucket: "state", publisher: "gstv", url: "https://www.gstv.in/feed/", tier: 2, state: "GJ" },
    { id: "divya-world", lang: "gu", bucket: "world", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-1038.xml", tier: 1 },
    { id: "abp-gu-world", lang: "gu", bucket: "world", publisher: "abp", url: "https://gujarati.abplive.com/news/world/feed", tier: 1 },
    { id: "divya-cricket", lang: "gu", bucket: "sports", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-5207.xml", tier: 1 },
    { id: "tv9-gu-sports", lang: "gu", bucket: "sports", publisher: "tv9", url: "https://tv9gujarati.com/sports/feed", tier: 1 },
    { id: "abp-gu-sports", lang: "gu", bucket: "sports", publisher: "abp", url: "https://gujarati.abplive.com/sports/feed", tier: 2 },
    { id: "divya-business", lang: "gu", bucket: "business", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-969.xml", tier: 1 },
    { id: "tv9-gu-business", lang: "gu", bucket: "business", publisher: "tv9", url: "https://tv9gujarati.com/business/feed", tier: 1 },
    { id: "news18-gu-business", lang: "gu", bucket: "business", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/business.xml", tier: 2 },
    { id: "divya-entertainment", lang: "gu", bucket: "entertainment", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-12042.xml", tier: 1 },
    { id: "tv9-gu-entertainment", lang: "gu", bucket: "entertainment", publisher: "tv9", url: "https://tv9gujarati.com/entertainment/feed", tier: 1 },
    { id: "news18-gu-tech", lang: "gu", bucket: "science", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/tech.xml", tier: 3 },
    { id: "news18-gu-eyecatcher", lang: "gu", bucket: "kicker", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/eye-catcher.xml", tier: 3 },
    { id: "bbc-world-en", lang: "en", bucket: "world", publisher: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml", tier: 3 },
  ],
};

/** Publisher state feeds: language → ISO 3166-2 suffix → feeds. */
export const STATE_FEEDS: Partial<Record<NewsLang, Record<string, FeedSource[]>>> = {
  hi: {
    GJ: [{ id: "hi-state-gj-1", lang: "hi", bucket: "state", publisher: "news18", url: "https://hindi.news18.com/commonfeeds/v1/hin/rss/gujarat.xml", tier: 1, state: "GJ" }, { id: "hi-state-gj-2", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-2314.xml", tier: 1, state: "GJ" }],
    MH: [{ id: "hi-state-mh-1", lang: "hi", bucket: "state", publisher: "news18", url: "https://hindi.news18.com/commonfeeds/v1/hin/rss/maharashtra.xml", tier: 1, state: "MH" }, { id: "hi-state-mh-2", lang: "hi", bucket: "state", publisher: "amarujala", url: "https://www.amarujala.com/rss/maharashtra.xml", tier: 1, state: "MH", clampFutureDates: true }],
    RJ: [{ id: "hi-state-rj-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1740.xml", tier: 1, state: "RJ" }],
    MP: [{ id: "hi-state-mp-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1739.xml", tier: 1, state: "MP" }],
    UP: [{ id: "hi-state-up-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-2052.xml", tier: 1, state: "UP" }],
    BR: [{ id: "hi-state-br-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-3679.xml", tier: 1, state: "BR" }],
    DL: [{ id: "hi-state-dl-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-7140.xml", tier: 1, state: "DL" }, { id: "hi-state-dl-2", lang: "hi", bucket: "state", publisher: "amarujala", url: "https://www.amarujala.com/rss/delhi.xml", tier: 1, state: "DL", clampFutureDates: true }],
    HR: [{ id: "hi-state-hr-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1742.xml", tier: 1, state: "HR" }],
    PB: [{ id: "hi-state-pb-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1743.xml", tier: 1, state: "PB" }],
    JH: [{ id: "hi-state-jh-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-3682.xml", tier: 1, state: "JH" }],
    CT: [{ id: "hi-state-ct-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1741.xml", tier: 1, state: "CT" }],
    HP: [{ id: "hi-state-hp-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-12084.xml", tier: 1, state: "HP" }],
    CH: [{ id: "hi-state-ch-1", lang: "hi", bucket: "state", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-11649.xml", tier: 1, state: "CH" }],
  },
  mr: {
    MH: [{ id: "mr-state-mh-1", lang: "mr", bucket: "state", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/maharashtra.xml", tier: 1, state: "MH" }, { id: "mr-state-mh-2", lang: "mr", bucket: "state", publisher: "tv9", url: "https://www.tv9marathi.com/maharashtra/feed", tier: 1, state: "MH" }, { id: "mr-state-mh-3", lang: "mr", bucket: "state", publisher: "abp", url: "https://marathi.abplive.com/news/maharashtra/feed", tier: 1, state: "MH" }],
  },
  ta: {
    TN: [{ id: "ta-state-tn-1", lang: "ta", bucket: "state", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/tamil-nadu.xml", tier: 1, state: "TN" }, { id: "ta-state-tn-2", lang: "ta", bucket: "state", publisher: "samayam", url: "https://tamil.samayam.com/tamil-nadu/news/rssfeed/48069549.xml", tier: 1, state: "TN" }, { id: "ta-state-tn-3", lang: "ta", bucket: "state", publisher: "abp", url: "https://tamil.abplive.com/news/tamil-nadu/feed", tier: 1, state: "TN" }],
  },
  bn: {
    WB: [{ id: "bn-state-wb-1", lang: "bn", bucket: "state", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/west-bengal.xml", tier: 1, state: "WB" }, { id: "bn-state-wb-2", lang: "bn", bucket: "state", publisher: "abp", url: "https://bengali.abplive.com/news/west-bengal/feed", tier: 1, state: "WB" }, { id: "bn-state-wb-3", lang: "bn", bucket: "state", publisher: "abp", url: "https://bengali.abplive.com/district/feed", tier: 1, state: "WB" }],
  },
  gu: {
    GJ: [{ id: "gu-state-gj-1", lang: "gu", bucket: "state", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-1035.xml", tier: 1, state: "GJ" }, { id: "gu-state-gj-2", lang: "gu", bucket: "state", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/gujarat.xml", tier: 1, state: "GJ" }, { id: "gu-state-gj-3", lang: "gu", bucket: "state", publisher: "tv9", url: "https://tv9gujarati.com/gujarat/feed", tier: 1, state: "GJ" }],
  },
};

/** Publisher city feeds: language → city key → feeds. */
export const CITY_FEEDS: Partial<Record<NewsLang, Record<string, FeedSource[]>>> = {
  gu: {
    ahmedabad: [{ id: "gu-city-ahmedabad-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-6309.xml", tier: 1, city: "ahmedabad" }, { id: "gu-city-ahmedabad-2", lang: "gu", bucket: "city", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/ahmedabad.xml", tier: 1, city: "ahmedabad" }, { id: "gu-city-ahmedabad-3", lang: "gu", bucket: "city", publisher: "tv9", url: "https://tv9gujarati.com/ahmedabad/feed", tier: 1, city: "ahmedabad" }],
    vadodara: [{ id: "gu-city-vadodara-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-6322.xml", tier: 1, city: "vadodara" }, { id: "gu-city-vadodara-2", lang: "gu", bucket: "city", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/vadodara.xml", tier: 1, city: "vadodara" }],
    surat: [{ id: "gu-city-surat-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-1043.xml", tier: 1, city: "surat" }, { id: "gu-city-surat-2", lang: "gu", bucket: "city", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/surat.xml", tier: 1, city: "surat" }],
    rajkot: [{ id: "gu-city-rajkot-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-6334.xml", tier: 1, city: "rajkot" }, { id: "gu-city-rajkot-2", lang: "gu", bucket: "city", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/rajkot.xml", tier: 1, city: "rajkot" }],
    gandhinagar: [{ id: "gu-city-gandhinagar-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-2261.xml", tier: 1, city: "gandhinagar" }, { id: "gu-city-gandhinagar-2", lang: "gu", bucket: "city", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/gandhinagar.xml", tier: 1, city: "gandhinagar" }],
    bhavnagar: [{ id: "gu-city-bhavnagar-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-1775.xml", tier: 1, city: "bhavnagar" }, { id: "gu-city-bhavnagar-2", lang: "gu", bucket: "city", publisher: "news18", url: "https://gujarati.news18.com/commonfeeds/v1/guj/rss/bhavnagar.xml", tier: 1, city: "bhavnagar" }],
    jamnagar: [{ id: "gu-city-jamnagar-1", lang: "gu", bucket: "city", publisher: "divyabhaskar", url: "https://www.divyabhaskar.co.in/rss-v1--category-2281.xml", tier: 1, city: "jamnagar" }],
  },
  mr: {
    mumbai: [{ id: "mr-city-mumbai-1", lang: "mr", bucket: "city", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/mumbai.xml", tier: 1, city: "mumbai" }, { id: "mr-city-mumbai-2", lang: "mr", bucket: "city", publisher: "tv9", url: "https://www.tv9marathi.com/mumbai/feed", tier: 1, city: "mumbai" }, { id: "mr-city-mumbai-3", lang: "mr", bucket: "city", publisher: "abp", url: "https://marathi.abplive.com/news/mumbai/feed", tier: 1, city: "mumbai" }],
    pune: [{ id: "mr-city-pune-1", lang: "mr", bucket: "city", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/pune.xml", tier: 1, city: "pune" }, { id: "mr-city-pune-2", lang: "mr", bucket: "city", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/2429654.xml", tier: 1, city: "pune" }, { id: "mr-city-pune-3", lang: "mr", bucket: "city", publisher: "abp", url: "https://marathi.abplive.com/news/pune/feed", tier: 1, city: "pune" }],
    nagpur: [{ id: "mr-city-nagpur-1", lang: "mr", bucket: "city", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/maharashtra/nagpur.xml", tier: 1, city: "nagpur" }, { id: "mr-city-nagpur-2", lang: "mr", bucket: "city", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/51327950.xml", tier: 1, city: "nagpur" }],
    thane: [{ id: "mr-city-thane-1", lang: "mr", bucket: "city", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/thane.xml", tier: 1, city: "thane" }, { id: "mr-city-thane-2", lang: "mr", bucket: "city", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/51327489.xml", tier: 1, city: "thane" }],
    nashik: [{ id: "mr-city-nashik-1", lang: "mr", bucket: "city", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/maharashtra/nashik.xml", tier: 1, city: "nashik" }],
    kolhapur: [{ id: "mr-city-kolhapur-1", lang: "mr", bucket: "city", publisher: "news18", url: "https://news18marathi.com/commonfeeds/v1/mar/rss/maharashtra/kolhapur.xml", tier: 1, city: "kolhapur" }, { id: "mr-city-kolhapur-2", lang: "mr", bucket: "city", publisher: "mt", url: "https://maharashtratimes.com/rssfeed/51327702.xml", tier: 1, city: "kolhapur" }],
  },
  ta: {
    chennai: [{ id: "ta-city-chennai-1", lang: "ta", bucket: "city", publisher: "news18", url: "https://tamil.news18.com/commonfeeds/v1/tam/rss/chennai.xml", tier: 1, city: "chennai" }, { id: "ta-city-chennai-2", lang: "ta", bucket: "city", publisher: "samayam", url: "https://tamil.samayam.com/tamil-nadu/chennai/rssfeed/56624393.xml", tier: 1, city: "chennai" }, { id: "ta-city-chennai-3", lang: "ta", bucket: "city", publisher: "abp", url: "https://tamil.abplive.com/news/chennai/feed", tier: 1, city: "chennai" }],
    coimbatore: [{ id: "ta-city-coimbatore-1", lang: "ta", bucket: "city", publisher: "samayam", url: "https://tamil.samayam.com/tamil-nadu/coimbatore/rssfeed/56624383.xml", tier: 1, city: "coimbatore" }],
  },
  bn: {
    kolkata: [{ id: "bn-city-kolkata-1", lang: "bn", bucket: "city", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/kolkata.xml", tier: 1, city: "kolkata" }, { id: "bn-city-kolkata-2", lang: "bn", bucket: "city", publisher: "abp", url: "https://bengali.abplive.com/news/kolkata/feed", tier: 1, city: "kolkata" }],
    howrah: [{ id: "bn-city-howrah-1", lang: "bn", bucket: "city", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/west-bengal/howrah.xml", tier: 1, city: "howrah" }],
    siliguri: [{ id: "bn-city-siliguri-1", lang: "bn", bucket: "city", publisher: "news18", url: "https://bengali.news18.com/commonfeeds/v1/ben/rss/west-bengal/siliguri.xml", tier: 1, city: "siliguri" }],
  },
  hi: {
    jaipur: [{ id: "hi-city-jaipur-1", lang: "hi", bucket: "city", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-1709.xml", tier: 1, city: "jaipur" }],
    lucknow: [{ id: "hi-city-lucknow-1", lang: "hi", bucket: "city", publisher: "amarujala", url: "https://www.amarujala.com/rss/lucknow.xml", tier: 1, city: "lucknow", clampFutureDates: true }, { id: "hi-city-lucknow-2", lang: "hi", bucket: "city", publisher: "nbt", url: "https://navbharattimes.indiatimes.com/state/uttar-pradesh/lucknow/rssfeed/87255070.xml", tier: 1, city: "lucknow" }],
    delhi: [{ id: "hi-city-delhi-1", lang: "hi", bucket: "city", publisher: "bhaskar", url: "https://www.bhaskar.com/rss-v1--category-7140.xml", tier: 1, city: "delhi" }, { id: "hi-city-delhi-2", lang: "hi", bucket: "city", publisher: "amarujala", url: "https://www.amarujala.com/rss/delhi.xml", tier: 1, city: "delhi", clampFutureDates: true }],
  },
};

/** Native state names (Bing query and the spoken label). */
export const STATE_NAMES: Record<string, Partial<Record<NewsLang, string>>> = {"GJ":{"en":"Gujarat","hi":"गुजरात","mr":"गुजरात","ta":"குஜராத்","bn":"গুজরাট","gu":"ગુજરાત"},"MH":{"en":"Maharashtra","hi":"महाराष्ट्र","mr":"महाराष्ट्र","ta":"மகாராஷ்டிரா","bn":"মহারাষ্ট্র","gu":"મહારાષ્ટ્ર"},"TN":{"en":"Tamil Nadu","hi":"तमिलनाडु","mr":"तमिळनाडू","ta":"தமிழ்நாடு","bn":"তামিলনাড়ু","gu":"તમિલનાડુ"},"WB":{"en":"West Bengal","hi":"पश्चिम बंगाल","mr":"पश्चिम बंगाल","ta":"மேற்கு வங்கம்","bn":"পশ্চিমবঙ্গ","gu":"પશ્ચિમ બંગાળ"},"DL":{"en":"Delhi","hi":"दिल्ली","mr":"दिल्ली","ta":"டெல்லி","bn":"দিল্লি","gu":"દિલ્હી"},"KA":{"en":"Karnataka","hi":"कर्नाटक","mr":"कर्नाटक","ta":"கர்நாடகா","bn":"কর্ণাটক","gu":"કર્ણાટક"},"UP":{"en":"Uttar Pradesh","hi":"उत्तर प्रदेश","mr":"उत्तर प्रदेश","ta":"உத்தரப் பிரதேசம்","bn":"উত্তরপ্রদেশ","gu":"ઉત્તર પ્રદેશ"},"RJ":{"en":"Rajasthan","hi":"राजस्थान","mr":"राजस्थान","ta":"ராஜஸ்தான்","bn":"রাজস্থান","gu":"રાજસ્થાન"},"MP":{"en":"Madhya Pradesh","hi":"मध्य प्रदेश","mr":"मध्य प्रदेश","ta":"மத்தியப் பிரதேசம்","bn":"মধ্যপ্রদেশ","gu":"મધ્ય પ્રદેશ"},"BR":{"en":"Bihar","hi":"बिहार","mr":"बिहार","ta":"பீகார்","bn":"বিহার","gu":"બિહાર"},"TG":{"en":"Telangana","hi":"तेलंगाना","mr":"तेलंगणा","ta":"தெலங்கானா","bn":"তেলেঙ্গানা","gu":"તેલંગાણા"},"AP":{"en":"Andhra Pradesh","hi":"आंध्र प्रदेश","mr":"आंध्र प्रदेश","ta":"ஆந்திரப் பிரதேசம்","bn":"অন্ধ্রপ্রদেশ","gu":"આંધ્ર પ્રદેશ"},"KL":{"en":"Kerala","hi":"केरल","mr":"केरळ","ta":"கேரளா","bn":"কেরল","gu":"કેરળ"},"PB":{"en":"Punjab","hi":"पंजाब","mr":"पंजाब","ta":"பஞ்சாப்","bn":"পাঞ্জাব","gu":"પંજાબ"},"HR":{"en":"Haryana","hi":"हरियाणा","mr":"हरियाणा","ta":"ஹரியானா","bn":"হরিয়ানা","gu":"હરિયાણા"},"AS":{"en":"Assam","hi":"असम","mr":"आसाम","ta":"அசாம்","bn":"অসম","gu":"આસામ"}};

/** Native city names, keyed by the normalized edge city. */
export const CITY_NAMES: Record<string, Partial<Record<NewsLang, string>>> = {"vadodara":{"hi":"वडोदरा","mr":"वडोदरा","ta":"வதோதரா","bn":"ভদোদরা","gu":"વડોદરા"},"ahmedabad":{"hi":"अहमदाबाद","mr":"अहमदाबाद","ta":"அகமதாபாத்","bn":"আহমেদাবাদ","gu":"અમદાવાદ"},"surat":{"hi":"सूरत","mr":"सुरत","ta":"சூரத்","bn":"সুরাট","gu":"સુરત"},"rajkot":{"hi":"राजकोट","mr":"राजकोट","ta":"ராஜ்கோட்","bn":"রাজকোট","gu":"રાજકોટ"},"mumbai":{"hi":"मुंबई","mr":"मुंबई","ta":"மும்பை","bn":"মুম্বই","gu":"મુંબઈ"},"pune":{"hi":"पुणे","mr":"पुणे","ta":"புனே","bn":"পুনে","gu":"પુણે"},"nagpur":{"hi":"नागपुर","mr":"नागपूर","ta":"நாக்பூர்","bn":"নাগপুর","gu":"નાગપુર"},"chennai":{"hi":"चेन्नई","mr":"चेन्नई","ta":"சென்னை","bn":"চেন্নাই","gu":"ચેન્નઈ"},"coimbatore":{"hi":"कोयंबटूर","mr":"कोईम्बतूर","ta":"கோவை","bn":"কোয়েম্বাটুর","gu":"કોઈમ્બતુર"},"madurai":{"hi":"मदुरै","mr":"मदुराई","ta":"மதுரை","bn":"মাদুরাই","gu":"મદુરાઈ"},"kolkata":{"hi":"कोलकाता","mr":"कोलकाता","ta":"கொல்கத்தா","bn":"কলকাতা","gu":"કોલકાતા"},"howrah":{"hi":"हावड़ा","mr":"हावडा","ta":"ஹவுரா","bn":"হাওড়া","gu":"હાવડા"},"siliguri":{"hi":"सिलीगुड़ी","mr":"सिलिगुडी","ta":"சிலிகுரி","bn":"শিলিগুড়ি","gu":"સિલિગુડી"},"delhi":{"hi":"दिल्ली","mr":"दिल्ली","ta":"டெல்லி","bn":"দিল্লি","gu":"દિલ્હી"},"bengaluru":{"hi":"बेंगलुरु","mr":"बंगळूरु","ta":"பெங்களூரு","bn":"বেঙ্গালুরু","gu":"બેંગલુરુ"},"hyderabad":{"hi":"हैदराबाद","mr":"हैदराबाद","ta":"ஹைதராபாத்","bn":"হায়দরাবাদ","gu":"હૈદરાબાદ"},"lucknow":{"hi":"लखनऊ","mr":"लखनौ","ta":"லக்னோ","bn":"লখনউ","gu":"લખનઉ"},"jaipur":{"hi":"जयपुर","mr":"जयपूर","ta":"ஜெய்ப்பூர்","bn":"জয়পুর","gu":"જયપુર"}};

/** Bing News topic queries per language (variety and fallback, never the backbone). */
export const BING_TOPICS: Partial<Record<NewsLang, Partial<Record<Bucket, string>>>> = {"hi":{"sports":"क्रिकेट","business":"शेयर बाजार","entertainment":"बॉलीवुड","world":"अंतरराष्ट्रीय","science":"इसरो","kicker":"अनोखी पहल"},"mr":{"sports":"क्रिकेट सामना","business":"शेअर बाजार","entertainment":"मराठी चित्रपट","world":"आंतरराष्ट्रीय","science":"विज्ञान","kicker":"प्रेरणादायी"},"ta":{"sports":"கிரிக்கெட்","business":"பங்குச்சந்தை","entertainment":"தமிழ் சினிமா","world":"உலக செய்திகள்","science":"அறிவியல்","kicker":"நெகிழ்ச்சி"},"bn":{"sports":"ক্রিকেট","business":"ব্যবসা","entertainment":"টলিউড","world":"আন্তর্জাতিক","science":"বিজ্ঞান","kicker":"অনুপ্রেরণা"},"gu":{"sports":"ક્રિકેટ","business":"શેરબજાર","entertainment":"બોલિવૂડ","world":"વિશ્વ"}};

/** Spoken publisher names per language. */
export const PUBLISHERS: Record<string, Partial<Record<NewsLang, string>>> = {"bbc":{"en":"BBC","hi":"बीबीसी हिंदी","mr":"बीबीसी मराठी","ta":"பிபிசி தமிழ்","bn":"বিবিসি বাংলা","gu":"બીબીસી ગુજરાતી"},"bhaskar":{"en":"Dainik Bhaskar","hi":"दैनिक भास्कर"},"divyabhaskar":{"en":"Divya Bhaskar","gu":"દિવ્ય ભાસ્કર"},"amarujala":{"en":"Amar Ujala","hi":"अमर उजाला"},"news18":{"en":"News18","hi":"न्यूज़18","mr":"न्यूज18 लोकमत","ta":"நியூஸ்18 தமிழ்நாடு","bn":"নিউজ18 বাংলা","gu":"ન્યૂઝ18 ગુજરાતી"},"abp":{"en":"ABP","hi":"एबीपी न्यूज़","mr":"एबीपी माझा","ta":"ஏபிபி நாடு","bn":"এবিপি আনন্দ","gu":"એબીપી અસ્મિતા"},"tv9":{"en":"TV9","hi":"टीवी9 भारतवर्ष","mr":"टीव्ही9 मराठी","ta":"டிவி9 தமிழ்","bn":"টিভি9 বাংলা","gu":"ટીવી9 ગુજરાતી"},"aajtak":{"en":"Aaj Tak","hi":"आज तक"},"zee":{"en":"Zee News","hi":"ज़ी न्यूज़"},"ndtvindia":{"en":"NDTV India","hi":"एनडीटीवी इंडिया"},"unnews":{"en":"UN News","hi":"यूएन समाचार"},"mt":{"en":"Maharashtra Times","mr":"महाराष्ट्र टाइम्स"},"samayam":{"en":"Samayam Tamil","ta":"சமயம் தமிழ்"},"dinamani":{"en":"Dinamani","ta":"தினமணி"},"dailythanthi":{"en":"Daily Thanthi","ta":"தினத்தந்தி"},"oneindia":{"en":"Oneindia","ta":"ஒன்இந்தியா தமிழ்","bn":"ওয়ানইন্ডিয়া বাংলা"},"pratidin":{"en":"Sangbad Pratidin","bn":"সংবাদ প্রতিদিন"},"dw":{"en":"DW","bn":"ডয়চে ভেলে"},"iegu":{"en":"Indian Express Gujarati","gu":"ઇન્ડિયન એક્સપ્રેસ ગુજરાતી"},"gstv":{"en":"GSTV","gu":"જીએસટીવી"},"livehindustan":{"en":"Live Hindustan","hi":"लाइव हिन्दुस्तान"},"ddnews":{"en":"DD News","hi":"डीडी न्यूज़"},"bing":{"en":"local media","hi":"स्थानीय मीडिया","mr":"स्थानिक माध्यमे","ta":"உள்ளூர் ஊடகங்கள்","bn":"স্থানীয় সংবাদমাধ্যম","gu":"સ્થાનિક મીડિયા"}};
