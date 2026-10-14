import type { Source } from '../../shared/types';

/** Headlines the news bulletin was written from. */
export default function Sources({ sources, lang, className = '' }: { sources: Source[]; lang: string; className?: string }) {
  return (
    <section aria-labelledby="sources-title" className={className}>
      <h2 id="sources-title" className="text-sm font-medium">
        Headlines in this bulletin
      </h2>
      <ul className="divide-line mt-1 divide-y">
        {sources.slice(0, 5).map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-link">
              <span lang={lang} className="text-[0.95rem]">
                {source.title}
              </span>
              {source.source ? <span className="text-fg-3 mt-0.5 block text-xs">{source.source}</span> : null}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-fg-3 mt-2 text-xs">Via Google News. Rephrased for radio, no facts added.</p>
    </section>
  );
}
