/** Studio "ON AIR" sign. Glows with the audio level; flickers while warming up (tuning). */
export default function OnAirLamp({ on, warming = false }: { on: boolean; warming?: boolean }) {
  return (
    <p className="lamp" data-on={on} data-warming={warming && !on}>
      <span aria-hidden="true">ON AIR</span>
      <span className="sr-only">{on ? 'On air' : warming ? 'Tuning in' : 'Off air'}</span>
    </p>
  );
}
