/** Studio "ON AIR" sign: a red glass lamp that glows with the audio level and flickers while warming up. */
export default function OnAirLamp({
  on,
  warming = false,
  size = 'md',
}: {
  on: boolean;
  warming?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span className="lamp" data-on={on} data-warming={warming && !on} data-size={size}>
      <span className="lamp-glow" aria-hidden="true" />
      <span className="lamp-text" aria-hidden="true">
        On air
      </span>
      <span className="sr-only">{on ? 'On air' : warming ? 'Tuning in' : 'Off air'}</span>
    </span>
  );
}
