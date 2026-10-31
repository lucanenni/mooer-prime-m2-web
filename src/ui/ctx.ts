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

export type Tab = "chain" | "mixer" | "drum" | "looper" | "settings" | "backup";

/** Shared UI state. `render` is set by main.ts. */
export const ui = {
  dragging: false,
  tab: "chain" as Tab,
  render: () => {},
};

let renderQueued = false;

/** Re-renders on the next frame, unless a slider is being dragged (rebuilding would drop it). */
export function scheduleRender() {
  if (ui.dragging || renderQueued) return;
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
