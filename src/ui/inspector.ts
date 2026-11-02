import { device } from "./ctx";
import { h } from "./dom";

// ---- System state inspector (experimental) ---------------------------------

/** Labels from one real dump and observed behaviour; the ones with a question mark are guesses. */
export function guessLabel(i: number): string {
  if (i === 1) return "preset";
  if (i === 2) return "CabSim on/off";
  if (i === 8) return "Auto shutdown (min, 255 = never)";
  if (i === 75) return "Display brightness (5...55)";
  if (i === 76) return "External footswitch (0 off, 1 A = Page Down / B = Page Up)";
  if (i === 94) return "RGB dynamic mode (on/off)";
  if (i === 96) return "RGB brightness (0 soft, 1 bright)";
  if (i === 97) return "RGB colour (1…9, palette entry)";
  if (i >= 77 && i <= 85) return `RGB colour sequence, position ${i - 76} (colour 1…9, 0 = empty)`;
  if (i === 95) return "RGB speed with dynamic off (0 I, 1 II, 2 III)";
  if (i >= 3 && i <= 6) return `Global EQ ${["100 Hz", "350 Hz", "1800 Hz", "4000 Hz"][i - 3]} (dB = raw/2 − 12)`;
  if (i === 7) return "Input gain (0 = −∞ … 9 = 0 dB … 21 = +6 dB)";
  if (i === 49) return "Global EQ on/off";
  if (i >= 9 && i <= 28) return "name";
  if (i === 41 || i === 42) return "tempo";
  const mutes: Record<number, string> = { 29: "Bluetooth", 31: "USB", 33: "Instrument", 51: "Vocal" };
  if (i in mutes) return `${mutes[i]} off (1 = off)`;
  const levels: Record<number, string> = { 30: "Bluetooth", 32: "USB", 34: "Instrument", 52: "Vocal" };
  if (i in levels) return `${levels[i]} level (dB = raw/2 − 30, max 72)`;
  if (i === 37) return "Master level L";
  if (i === 38) return "Master level R";
  const fxNames: Record<number, string> = { 57: "Vocal Comp sensitivity", 55: "Vocal Comp level", 61: "Vocal EQ low", 63: "Vocal EQ mid", 65: "Vocal EQ high", 69: "Vocal Reverb mix", 71: "Vocal Reverb decay", 73: "Vocal Reverb time" };
  if (i in fxNames) return fxNames[i];
  if ([53, 59, 67].includes(i)) return "Vocal FX on/off (Comp / EQ / Reverb)";
  if (i === 41) return "Drum speed (BPM, u16 LE with 42, 40...260)";
  if (i === 43) return "Drum pattern (0 = POP01 … 59)";
  if (i === 46) return "Drum sync with looper (0/1)";
  if (i === 44) return "Tuner reference (Hz = 430 + raw, 0...15)";
  if (i === 45) return "Tuner mute (1 = mute, 2 = no mute)";
  if (i === 88) return "3D (stereo only, 1 = on)";
  if (i === 35) return "Master mute (1 = muted)";
  if (i === 36) return "Master L/R link (chain icon, 1 = linked)";
  if (i === 39) return "Master mode (0 = mono, 1 = stereo)";
  if (i === 48) return "Looper song (1...10)";
  if (i === 47) return "Looper volume (0...100)";
  if (i === 40) return "level? (dB = raw/2 − 30)";
  const pans: Record<number, string> = { 89: "Vocal", 90: "Bluetooth", 91: "USB", 92: "Instrument" };
  if (i in pans) return `${pans[i]} pan (50 = centre)`;
  if (i >= 93 && i <= 96) return "channel on?";
  return "";
}

export const statePanel = h("details", { class: "state" }, h("summary", {}, "System state (experimental)"));
export const stateBody = h("div", {});
statePanel.append(stateBody);

export function renderState() {
  if (stateBody.contains(document.activeElement) && document.activeElement !== document.body) return;
  const state = device.systemStateBytes;
  const original = device.originalSystemState;
  stateBody.replaceChildren();
  if (!state) return void stateBody.append(h("p", { class: "hint" }, "Not connected."));
  stateBody.append(
    h("p", { class: "hint" }, "Bytes of the pedal's system state. Edits are sent to the pedal immediately and affect its global settings; “Restore original” writes back the values read at connection. Changed bytes are highlighted."),
    h(
      "div",
      { class: "backup" },
      h("button", { onclick: () => device.restoreSystemState() }, "Restore original"),
      h("button", { onclick: () => void navigator.clipboard.writeText(Array.from(state, (b) => b.toString(16).padStart(2, "0")).join(" ")) }, "Copy hex"),
    ),
  );
  const grid = h("div", { class: "bytes" });
  for (let i = 1; i < state.length; i++) {
    const editable = i >= 2 && !(i >= 9 && i <= 28);
    const changed = original !== undefined && original[i] !== state[i];
    grid.append(
      h(
        "label",
        { class: "byte" + (changed ? " changed" : ""), title: guessLabel(i) },
        h("span", { class: "idx" }, String(i)),
        h("input", {
          type: "number",
          min: "0",
          max: "255",
          value: String(state[i]),
          disabled: !editable,
          onchange: (e: Event) => device.setSystemByte(i, Number((e.target as HTMLInputElement).value)),
        }),
        h("span", { class: "guess" }, guessLabel(i)),
      ),
    );
  }
  stateBody.append(grid);
}
