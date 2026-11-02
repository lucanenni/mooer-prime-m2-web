import { device, ui, scheduleRender } from "./ctx";
import { h } from "./dom";
import { levelDb, MIXER_MAX } from "./format";

export function levelRow(name: string, raw: number, onSet: (v: number) => void): HTMLElement {
  const max = Math.max(MIXER_MAX, raw);
  const label = h("span", { class: "val" }, levelDb(raw));
  return h(
    "div",
    { class: "param" },
    h("label", {}, name),
    h("input", {
      type: "range",
      min: "0",
      max: String(max),
      value: String(raw),
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        onSet(v);
        label.textContent = levelDb(v);
      },
      onpointerdown: () => (ui.dragging = true),
      onpointerup: () => {
        ui.dragging = false;
        scheduleRender();
      },
    }),
    label,
  );
}

export function byteSlider(name: string, index: number, max: number, fmt: (raw: number) => string): HTMLElement {
  return byteSliderRange(name, index, 0, max, fmt);
}

export function byteSliderRange(name: string, index: number, min: number, max: number, fmt: (raw: number) => string): HTMLElement {
  const state = device.systemStateBytes!;
  const value = Math.max(min, Math.min(state[index], max));
  const label = h("span", { class: "val" }, fmt(value));
  return h(
    "div",
    { class: "param" },
    h("label", {}, name),
    h("input", {
      type: "range",
      min: String(min),
      max: String(max),
      value: String(value),
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        device.setSystemByte(index, v);
        label.textContent = fmt(v);
      },
      onpointerdown: () => (ui.dragging = true),
      onpointerup: () => {
        ui.dragging = false;
        scheduleRender();
      },
    }),
    label,
  );
}

export const onOff = (text: string, index: number, on: number, off: number): HTMLElement =>
  h("label", { class: "on" }, h("input", {
    type: "checkbox",
    checked: device.systemStateBytes![index] === on,
    onchange: (e: Event) => device.setSystemByte(index, (e.target as HTMLInputElement).checked ? on : off),
  }), ` ${text}`);
