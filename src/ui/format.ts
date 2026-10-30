// Value conversions and constants shared by the settings sections.

/** Mixer level slider: raw 0...72, dB = raw / 2 - 30 (60 = 0 dB, 72 = +6 dB). */
export const MIXER_MAX = 72;

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

export const levelDb = (raw: number) => `${signed(raw / 2 - 30)} dB`;

/** EQ bands (global and vocal): raw 0...48, dB = raw / 2 - 12. */
export const eqDb = (raw: number) => `${signed(raw / 2 - 12)} dB`;

/** Pan byte: 0...100, 50 = centre; shown as L<n>, C or R<n>. */
export const panText = (raw: number) => (raw === 50 ? "C" : raw < 50 ? `L${50 - raw}` : `R${raw - 50}`);

/** Input gain steps (0...21): off, -60, -45, -35, -30, -25, -20, -10, -5, 0, then +0.5 dB steps up to +6. */
export const INPUT_GAIN = [
  "−∞",
  ...["−60", "−45", "−35", "−30", "−25", "−20", "−10", "−5", "0"],
  ...Array.from({ length: 12 }, (_, i) => `+${((i + 1) / 2).toFixed(1)}`),
].map((t, i) => (i === 0 ? t : `${t} dB`));

/** Auto shutdown in minutes, 255 = never. */
export const SLEEP_OPTIONS = [255, 5, 10, 15, 20, 30];

/** Tuner reference pitch in Hz: 430 + raw (0...15). */
export const tunerHz = (raw: number) => 430 + raw;

/** Tempo-tap: BPM from a list of tap times in ms, or undefined with fewer than two taps. */
export function tapBpm(times: number[]): number | undefined {
  if (times.length < 2) return undefined;
  const mean = (times[times.length - 1] - times[0]) / (times.length - 1);
  return mean > 0 ? 60000 / mean : undefined;
}

/** RGB colours 1...9 as shown by the pedal's colour menu (value of byte [97], and the entries of [77]...[85]). */
export const RGB_COLORS = ["#ff6400", "#ffdc00", "#64ff00", "#ff0000", "#00ffff", "#ffffff", "#0064ff", "#c800ff", "#ff00f3"];
