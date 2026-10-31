import { device, ui, scheduleRender } from "./ctx";
import { h } from "./dom";
import { byteSlider, byteSliderRange, onOff } from "./widgets";
import { INPUT_GAIN, RGB_COLORS, SLEEP_OPTIONS, eqDb, tapBpm, tunerHz } from "./format";

// ---- Drum machine and tempo --------------------------------------------------

let taps: number[] = [];

export function tapTempo() {
  const now = Date.now();
  if (taps.length && now - taps[taps.length - 1] > 3000) taps = [];
  taps.push(now);
  taps = taps.slice(-5);
  const bpm = tapBpm(taps);
  if (bpm !== undefined) device.setTempo(bpm);
}

/** [41..42] speed = the tempo, u16 LE, 40...260; [43] pattern (0 = first); [46] sync with the looper (1 = on assumed). */
export function drumSection(): HTMLElement {
  const state = device.systemStateBytes;
  const box = h("section", { class: "mixer" }, h("strong", {}, "Drum"));
  if (!state) return box;
  const speed = state[41] | (state[42] << 8);
  const speedLabel = h("span", { class: "val" }, `${speed} BPM`);
  const pattern = h("select", { onchange: (e: Event) => device.setSystemByte(43, Number((e.target as HTMLSelectElement).value)) });
  const count = Math.max(60, device.drumNames.length, state[43] + 1);
  for (let i = 0; i < count; i++) pattern.append(h("option", { value: String(i), selected: i === state[43] }, device.drumNames[i] || `Pattern ${i + 1}`));
  box.append(
    h(
      "div",
      { class: "param" },
      h("label", {}, "Pattern"),
      pattern,
      h("button", { class: device.drumPlaying ? "primary" : "", title: "Start or stop the drum machine", onclick: () => device.drumPlay(!device.drumPlaying) }, device.drumPlaying ? "⏸ Pause" : "▶ Play"),
    ),
    h(
      "div",
      { class: "param" },
      h("label", {}, "Tempo"),
      h("input", {
        type: "range",
        min: "40",
        max: "260",
        value: String(Math.max(40, Math.min(260, speed))),
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          device.setTempo(v);
          speedLabel.textContent = `${v} BPM`;
        },
        onpointerdown: () => (ui.dragging = true),
        onpointerup: () => {
          ui.dragging = false;
          scheduleRender();
        },
      }),
      speedLabel,
      h("button", { onclick: tapTempo }, "Tap"),
    ),
    h(
      "div",
      { class: "param" },
      h("label", {}, "Looper"),
      h("label", { class: "on" }, h("input", {
        type: "checkbox",
        checked: state[46] === 1,
        onchange: (e: Event) => device.setSystemByte(46, (e.target as HTMLInputElement).checked ? 1 : 0),
      }), " sync drum with the looper"),
    ),
    h("span", { class: "hint" }, "The tempo is the drum speed. Play/Pause is unverified."),
  );
  return box;
}

// ---- Global settings ---------------------------------------------------------

/** Input gain steps ([7], 0...21): off, -60, -45, -35, -30, -25, -20, -10, -5, 0, then +0.5 dB steps up to +6. */




function colored<T extends HTMLElement>(el: T, color: string): T {
  el.style.background = color;
  return el;
}

/** [75] display brightness, 5...55. */
export function displaySection(): HTMLElement {
  const state = device.systemStateBytes;
  const box = h("section", { class: "mixer" }, h("strong", {}, "Display & power"));
  if (!state) return box;
  const sleep = h("select", { onchange: (e: Event) => device.setSystemByte(8, Number((e.target as HTMLSelectElement).value)) });
  const options = SLEEP_OPTIONS.includes(state[8]) ? SLEEP_OPTIONS : [...SLEEP_OPTIONS, state[8]];
  for (const v of options) sleep.append(h("option", { value: String(v), selected: v === state[8] }, v === 255 ? "Never" : `${v} min`));
  box.append(
    h("div", { class: "param" }, h("label", {}, "Auto shutdown"), sleep),
    byteSliderRange("Brightness", 75, 5, 55, String),
    // [76]: 0 = off, 1 = footswitch A sends Page Down, B sends Page Up.
    h("div", { class: "param" }, h("label", {}, "Footswitch page"), onOff("A = Page Down, B = Page Up (off = disabled)", 76, 1, 0)),
    // RGB: [94] is the dynamic-mode switch. The app also has brightness ([96]), colour ([97]) and static speed ([95]);
    h("div", { class: "param" }, h("label", {}, "RGB dynamic"), onOff("on", 94, 1, 0)),
    h("div", { class: "param" }, h("label", {}, "RGB brightness"), onOff("bright (off = soft)", 96, 1, 0)),
    h(
      "div",
      { class: "param" },
      h("label", {}, "RGB colour"),
      h("span", { class: "swatches" }, ...RGB_COLORS.map((color, c) =>
        colored(
          h("button", {
            class: "swatch" + (state[97] === c + 1 ? " active" : ""),
            title: `Colour ${c + 1}`,
            ariaLabel: `Colour ${c + 1}`,
            onclick: () => device.setSystemByte(97, c + 1),
          }),
          color,
        ),
      )),
    ),
    byteSliderRange("RGB speed (static)", 95, 0, 2, (v) => ["I", "II", "III"][v] ?? String(v)),
    h(
      "div",
      { class: "param" },
      h("label", {}, "RGB colour sequence"),
      h("span", { class: "swatches" }, ...Array.from({ length: 9 }, (_, c) => [
        colored(h("span", { class: "swatch small" }), RGB_COLORS[state[77 + c] - 1] ?? "transparent"),
        h("input", {
          type: "number",
          min: "0",
          max: "9",
          title: `Position ${c + 1}: the colour (1…9) at this place in the sequence, 0 = empty`,
          value: String(state[77 + c]),
          class: "narrow",
          onchange: (e: Event) => device.setSystemByte(77 + c, Number((e.target as HTMLInputElement).value)),
        }),
      ]).flat()),
      h("span", { class: "hint" }, "unverified"),
    ),
    h("div", { class: "param" }, h("label", {}, "MIDI"), h("button", { onclick: () => device.readMidiTable() }, "Read table (log)")),
  );
  return box;
}

/** [2] CabSim on/off, [7] input gain, [49] global EQ on/off, [3..6] global EQ 100 Hz / 350 Hz / 1.8 kHz / 4 kHz. */
export function globalSection(): HTMLElement {
  const box = h("section", { class: "mixer" }, h("strong", {}, "Global"));
  if (!device.systemStateBytes) return box;
  box.append(
    h("div", { class: "param" }, h("label", {}, "CabSim"), onOff("on", 2, 1, 0)),
    byteSlider("Input gain", 7, INPUT_GAIN.length - 1, (raw) => INPUT_GAIN[raw] ?? String(raw)),
    h("div", { class: "param" }, h("label", {}, "Global EQ"), onOff("on", 49, 1, 0)),
    byteSlider("  100 Hz", 3, 48, eqDb),
    byteSlider("  350 Hz", 4, 48, eqDb),
    byteSlider("  1800 Hz", 5, 48, eqDb),
    byteSlider("  4000 Hz", 6, 48, eqDb),
  );
  return box;
}

// ---- Looper -------------------------------------------------------------------

/** [47] looper volume, 0...100. */
export function looperSection(): HTMLElement {
  const state = device.systemStateBytes;
  const box = h("section", { class: "mixer" }, h("strong", {}, "Looper"));
  if (!state) return box;
  const volume = Math.min(state[47], 100);
  const volumeLabel = h("span", { class: "val" }, String(volume));
  const volumeRow = h(
    "div",
    { class: "param" },
    h("label", {}, "Volume"),
    h("input", {
      type: "range",
      min: "0",
      max: "100",
      value: String(volume),
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        device.setSystemByte(47, v);
        volumeLabel.textContent = String(v);
      },
      onpointerdown: () => (ui.dragging = true),
      onpointerup: () => {
        ui.dragging = false;
        scheduleRender();
      },
    }),
    volumeLabel,
  );
  // [48]: looper song, 1...8.
  const song = h("select", { onchange: (e: Event) => device.setSystemByte(48, Number((e.target as HTMLSelectElement).value)) });
  for (let i = 1; i <= 8; i++) song.append(h("option", { value: String(i), selected: i === state[48] }, `Song ${i}`));
  // Actions are sent as `4d n` (the pedal does not reply).
  const action = (label: string, n: number, title: string, confirmText?: string) =>
    h("button", { title, onclick: () => (!confirmText || confirm(confirmText)) && device.looperAction(n) }, label);
  box.append(
    h("div", { class: "param" }, h("label", {}, "Song"), song),
    volumeRow,
    h(
      "div",
      { class: "backup" },
      action("● Rec", 1, "Record, and keep overdubbing layers until Play"),
      action("▶ Play", 5, "Leave recording and play what is recorded"),
      action("⏸ Pause", 2, "Pause everything"),
      action("↶ Undo", 3, "Undo the layers of the last rec session (in play mode)"),
      action("🗑 Clear", 4, "Clear the loop", "Clear the loop on the pedal? The recording is deleted."),
    ),
    h(
      "div",
      { class: "backup" },
      h("button", { onclick: () => device.readLooperFiles() }, "Read files"),
      device.looperFiles.length
        ? h(
            "span",
            { class: "hint" },
            device.looperFiles.map((f, i) => `${i + 1}: ${f.empty ? "empty" : `${f.name || "(no name)"} ${(f.ms / 1000).toFixed(1)} s${f.sync ? " sync" : ""}`}`).join(" · "),
          )
        : h("span", { class: "hint" }, "Not read yet"),
    ),
  );
  return box;
}

// ---- Tuner settings ----------------------------------------------------------

/** [44]: reference pitch, Hz = 430 + raw (0...15). [45]: tuner mute, 1 = mute, 2 = no mute. */
export function tunerSection(): HTMLElement {
  const state = device.systemStateBytes;
  const box = h("section", { class: "mixer" }, h("strong", {}, "Tuner"));
  if (!state) return box;
  const raw = Math.min(state[44], 15);
  const label = h("span", { class: "val" }, `${tunerHz(raw)} Hz`);
  box.append(
    h(
      "div",
      { class: "param" },
      h("label", {}, "Reference"),
      h("input", {
        type: "range",
        min: "0",
        max: "15",
        value: String(raw),
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          device.setSystemByte(44, v);
          label.textContent = `${tunerHz(v)} Hz`;
        },
        onpointerdown: () => (ui.dragging = true),
        onpointerup: () => {
          ui.dragging = false;
          scheduleRender();
        },
      }),
      label,
      h("label", { class: "on" }, h("input", {
        type: "checkbox",
        checked: state[45] === 1,
        onchange: (e: Event) => device.setSystemByte(45, (e.target as HTMLInputElement).checked ? 1 : 2),
      }), " mute"),
    ),
  );
  return box;
}
