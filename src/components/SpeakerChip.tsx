interface SpeakerChipProps {
  /** Bulbul v4 Flash speaker ID, e.g. 'mukul_hi_suspense' */
  id: string;
  /** Not heard yet */
  dim?: boolean;
  /** Currently speaking */
  speaking?: boolean;
}

export default function SpeakerChip({ id, dim = false, speaking = false }: SpeakerChipProps) {
  return (
    <span className="chip" data-dim={dim} data-speaking={speaking} title="Bulbul v4 Flash speaker ID">
      <span className="chip-tag" aria-hidden="true">
        V4
      </span>
      <span className="sr-only">Bulbul v4 Flash voice </span>
      <span className="chip-id">{id}</span>
    </span>
  );
}
