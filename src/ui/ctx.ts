import { PrimeM2Device } from "../protocol/device";
import { h } from "./dom";

const logLines: string[] = [];

export const log = (msg: string) => {
  logLines.push(`${new Date().toLocaleTimeString()}  ${msg}`);
  if (logLines.length > 300) logLines.shift();
  const el = document.getElementById("log");
  if (el) {
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    const top = el.scrollTop;
    el.textContent = logLines.join("\n");
    el.scrollTop = atBottom ? el.scrollHeight : top;
  }
};

export const device = new PrimeM2Device(log);

export type Tab = "chain" | "mixer" | "drum" | "looper" | "samples" | "settings" | "backup";

/** Shared UI state. `render` is set by main.ts. */
export const ui = {
  dragging: false,
  tab: "chain" as Tab,
  render: () => {},
};

let renderQueued = false;
/** False while the user is typing in a text field or has a menu open: a rebuild would reset the field or close the menu. */
let committed = true;
/** A click moves focus on mouse-down but fires on mouse-up: rebuilding in between (also for a background update) would swallow the click. */
let pointerDown = false;
document.addEventListener("focusin", () => (committed = false));
document.addEventListener("change", () => {
  committed = true;
  if (!pointerDown) scheduleRender(); // blurring a field by clicking a button also fires change: wait for the click
});
const textLike = (a: Element | null) => a instanceof HTMLSelectElement || (a instanceof HTMLInputElement && a.type === "text");
const settle = () =>
  setTimeout(() => {
    if (!textLike(document.activeElement)) committed = true;
    scheduleRender();
  }, 0);
document.addEventListener("pointerdown", () => (pointerDown = true), true);
const pointerEnd = () => {
  pointerDown = false;
  setTimeout(settle, 0); // after the click handlers have run
};
document.addEventListener("pointerup", pointerEnd, true);
document.addEventListener("pointercancel", pointerEnd, true);
document.addEventListener("focusout", () => {
  if (!pointerDown) settle();
});

const isEditing = () => pointerDown || (!committed && textLike(document.activeElement));

/** Re-renders on the next frame, unless a slider is being dragged or a field is being edited (rebuilding would drop it);
 *  the render then happens when the edit is committed or the field loses focus. */
export function scheduleRender() {
  if (ui.dragging || renderQueued || isEditing()) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    ui.render();
  });
}

device.addEventListener("change", scheduleRender);

// Built once so re-renders don't collapse it or drop the text selection.
export const logPanel = h(
  "details",
  {},
  h("summary", {}, "Log"),
  h("button", { onclick: () => void navigator.clipboard.writeText(logLines.join("\n")).then(() => log("Log copied")) }, "Copy log"),
  h("pre", { id: "log" }, ""),
);
