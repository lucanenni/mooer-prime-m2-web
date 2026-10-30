import { device, ui, scheduleRender } from "./ctx";
import { h } from "./dom";
import { levelRow } from "./widgets";
import { levelDb, panText, MIXER_MAX } from "./format";

// ---- Mixer -------------------------------------------------------------------

/** Byte indexes in the system state, all confirmed on a real pedal. */
export const MIXER_CHANNELS = [
  { name: "Instrument", mute: 33, level: 34, pan: 92 },
  { name: "Vocal", mute: 51, level: 52, pan: 89 },
  { name: "Bluetooth", mute: 29, level: 30, pan: 90 },
  { name: "USB", mute: 31, level: 32, pan: 91 },
];

/** Pan byte: 0...100, 50 = centre; the app shows it as L<n>, C or R<n>, and only in stereo. */



export function mixerSection(): HTMLElement {
  const state = device.systemStateBytes;
  const box = h("section", { class: "mixer" }, h("strong", {}, "Mixer"));
  if (!state) return box;
  const stereoMaster = state[39] === 1;
  for (const ch of MIXER_CHANNELS) {
    const level = Math.min(state[ch.level], MIXER_MAX);
    const label = h("span", { class: "val" }, levelDb(level));
    box.append(
      h(
        "div",
        { class: "param", },
        h("label", {}, ch.name),
        h("input", {
          type: "range",
          min: "0",
          max: String(MIXER_MAX),
          value: String(level),
          oninput: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            device.setSystemByte(ch.level, v);
            label.textContent = levelDb(v);
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
          checked: state[ch.mute] === 0,
          onchange: (e: Event) => device.setSystemByte(ch.mute, (e.target as HTMLInputElement).checked ? 0 : 1),
        }), " on"),
      ),
    );
    if (stereoMaster) {
      const pan = Math.min(state[ch.pan], 100);
      const panLabel = h("span", { class: "val" }, panText(pan));
      box.append(
        h(
          "div",
          { class: "param" },
          h("label", {}, "  Pan"),
          h("input", {
            type: "range",
            min: "0",
            max: "100",
            value: String(pan),
            oninput: (e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              device.setSystemByte(ch.pan, v);
              panLabel.textContent = panText(v);
            },
            ondblclick: () => {
              device.setSystemByte(ch.pan, 50);
              scheduleRender();
            },
            onpointerdown: () => (ui.dragging = true),
            onpointerup: () => {
              ui.dragging = false;
              scheduleRender();
            },
          }),
          panLabel,
        ),
      );
    }
  }
  // Master: [37] left, [38] right, [39] 0 = mono, 1 = stereo. In mono one slider drives both.
  const stereo = state[39] === 1;
  box.append(
    h(
      "div",
      { class: "param" },
      h("label", {}, "Master"),
      h("label", { class: "on" }, h("input", {
        type: "checkbox",
        checked: stereo,
        onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          device.setSystemByte(39, on ? 1 : 0);
          if (!on) device.setSystemByte(38, state[37]);
          scheduleRender();
        },
      }), " stereo"),
      // [35]: master mute, 1 = muted (same convention as the channel switches).
      h("label", { class: "on" }, h("input", {
        type: "checkbox",
        checked: state[35] === 1,
        onchange: (e: Event) => device.setSystemByte(35, (e.target as HTMLInputElement).checked ? 1 : 0),
      }), " mute"),
    ),
  );
  if (stereo) {
    // [36] is the chain icon next to the master sliders: 1 = L and R linked.
    const linked = state[36] === 1;
    const set = (index: number) => (v: number) => {
      device.setSystemByte(index, v);
      if (linked) device.setSystemByte(index === 37 ? 38 : 37, v);
    };
    box.append(
      levelRow("Master L", state[37], set(37)),
      levelRow("Master R", state[38], set(38)),
      h("label", { class: "on" }, h("input", {
        type: "checkbox",
        checked: linked,
        onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          device.setSystemByte(36, on ? 1 : 0);
          if (on) device.setSystemByte(38, state[37]);
          scheduleRender();
        },
      }), " link L/R"),
      // [88]: the "3D" icon, only offered in stereo; 1 = on.
      h("label", { class: "on" }, h("input", {
        type: "checkbox",
        checked: state[88] === 1,
        onchange: (e: Event) => device.setSystemByte(88, (e.target as HTMLInputElement).checked ? 1 : 0),
      }), " 3D"),
    );
  } else {
    box.append(levelRow("Master", state[37], (v) => (device.setSystemByte(37, v), device.setSystemByte(38, v))));
  }
  if (!stereoMaster) box.append(h("span", { class: "hint" }, "Set the Master to stereo to adjust the pan of each channel."));
  return box;
}
