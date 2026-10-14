import { useEffect, useRef } from 'react';

/**
 * Runs `onLevel` every animation frame with a 0..1 loudness (RMS of the master analyser)
 * while `active`. Stops the loop when inactive or when the tab is hidden.
 */
export function useAnalyserLevel(
  active: boolean,
  analyser: () => AnalyserNode | null,
  onLevel: (level: number) => void,
) {
  const cb = useRef(onLevel);
  cb.current = onLevel;

  useEffect(() => {
    if (!active) {
      cb.current(0);
      return;
    }
    let raf = 0;
    let data: Float32Array<ArrayBuffer> | null = null;
    const tick = () => {
      const node = analyser();
      if (node) {
        if (!data || data.length !== node.fftSize) data = new Float32Array(node.fftSize);
        node.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        // Speech RMS sits around 0.02-0.25; map it onto a meter-friendly curve.
        cb.current(Math.min(1, Math.pow(rms * 4.2, 0.75)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cb.current(0);
    };
  }, [active, analyser]);
}
