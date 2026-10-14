import { STATIONS } from '../../shared/stations';
import { PROGRAMME, programmeSpeakers } from './data';
import { SectionHead, SpeakerId } from './ui';

/** The show as a broadcast cue sheet: five segments in running order, each with its cast. */
export default function Rundown() {
  const hindi = STATIONS[0];
  return (
    <section className="lp-section lp-rundown-sec" aria-labelledby="rundown-title">
      <div className="lp-wrap">
        <SectionHead id="rundown-title" title="What’s on air">
          A fresh show written for you each time you tune in. Every segment gets the voice whose style fits the job.
        </SectionHead>
        <ol className="lp-rundown">
          {PROGRAMME.map((item, i) => (
            <li key={item.key} className="lp-cue">
              <span className="lp-cue-n" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="lp-h3">{item.title}</h3>
              <p className="lp-cue-body">{item.body}</p>
              <div className="lp-ids">
                {programmeSpeakers(item).map((s) => (
                  <SpeakerId key={s} id={s} />
                ))}
              </div>
            </li>
          ))}
        </ol>
        <p className="lp-footnote">
          Cast shown: {hindi.languageName} {hindi.frequency}. Each station has its own native cast.
        </p>
      </div>
    </section>
  );
}
