/** Perforated speaker grille. The cone glow behind the holes breathes with `--level`. */
export default function SpeakerGrille({ className = '' }: { className?: string }) {
  return (
    <div className={`grille ${className}`} aria-hidden="true">
      <span className="grille-cone" />
      <span className="grille-holes" />
      <span className="grille-badge">Tarang</span>
    </div>
  );
}
