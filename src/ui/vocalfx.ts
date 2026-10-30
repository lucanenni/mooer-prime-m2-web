import { device, ui, scheduleRender } from "./ctx";
import { h } from "./dom";
import { eqDb } from "./format";

// ---- Vocal FX ------------------------------------------------------------------

interface FxParam {
  name: string;
  index: number; // low byte of a u16 LE word in the system state; values stay below 256
  max: number;
  format?: (raw: number) => string;
}


/** `enable` is the on/off word just before each group (1 = on). */
export const VOCAL_FX: { name: string; enable: number; params: FxParam[] }[] = [
  { name: "Comp", enable: 53, params: [{ name: "Sensitivity", index: 57, max: 100 }, { name: "Level", index: 55, max: 100 }] },
  {
    name: "EQ",
    enable: 59,
    params: [
      { name: "Low", index: 61, max: 48, format: eqDb },
      { name: "Mid", index: 63, max: 48, format: eqDb },
      { name: "High", index: 65, max: 48, format: eqDb },
    ],
  },
  {
    name: "Reverb",
    enable: 67,
    params: [{ name: "Mix", index: 69, max: 100 }, { name: "Decay", index: 71, max: 100 }, { name: "Time", index: 73, max: 100 }],
  },
];

export function vocalFxSection(): HTMLElement {
  const state = device.systemStateBytes;
  const box = h("section", { class: "mixer" }, h("strong", {}, "Vocal FX"));
  if (!state) return box;
  for (const fx of VOCAL_FX) {
    box.append(
      h(
        "div",
        { class: "param" },
        h("label", {}, fx.name),
        h("label", { class: "on" }, h("input", {
          type: "checkbox",
          checked: state[fx.enable] === 1,
          onchange: (e: Event) => device.setSystemByte(fx.enable, (e.target as HTMLInputElement).checked ? 1 : 0),
        }), " on"),
      ),
    );
    for (const prm of fx.params) {
      const fmt = prm.format ?? String;
      const value = Math.min(state[prm.index], prm.max);
      const label = h("span", { class: "val" }, fmt(value));
      box.append(
        h(
          "div",
          { class: "param" },
          h("label", {}, "  " + prm.name),
          h("input", {
            type: "range",
            min: "0",
            max: String(prm.max),
            value: String(value),
            oninput: (e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              device.setSystemByte(prm.index, v);
              label.textContent = fmt(v);
            },
            onpointerdown: () => (ui.dragging = true),
            onpointerup: () => {
              ui.dragging = false;
              scheduleRender();
            },
          }),
          label,
        ),
      );
    }
  }
  return box;
}
