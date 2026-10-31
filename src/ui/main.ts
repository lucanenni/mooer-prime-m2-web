import * as catalog from "../protocol/catalog";
import { isEmpty, slotLabel } from "../protocol/models";
import { bluetoothSupported } from "../transport/webbluetooth";
import { hidSupported } from "../transport/webhid";
import { backupBar } from "./backup";
import { moduleCard, presetList } from "./chain";
import { connectionBanner, initConnection, toolbar } from "./connection";
import { type Tab, device, logPanel, ui } from "./ctx";
import { h } from "./dom";
import { renderState, statePanel } from "./inspector";
import { mixerSection } from "./mixer";
import { displaySection, drumSection, globalSection, looperSection, tempoSection, tunerSection } from "./settings";
import "./style.css";
import { vocalFxSection } from "./vocalfx";

const app = document.getElementById("app")!;

let draftName: string | null = null;
let saveTarget: number | null = null;
let lastPresetIndex: number | undefined;

const TABS: { id: Tab; label: string }[] = [
  { id: "chain", label: "Effects" },
  { id: "mixer", label: "Mixer" },
  { id: "looper", label: "Looper" },
  { id: "settings", label: "Settings" },
  { id: "backup", label: "Backup" },
];

function tabBar(): HTMLElement {
  return h(
    "div",
    { class: "tabs", role: "tablist" },
    ...TABS.map((t) =>
      h(
        "button",
        {
          class: "tab" + (ui.tab === t.id ? " active" : ""),
          role: "tab",
          ariaSelected: String(ui.tab === t.id),
          onclick: () => {
            ui.tab = t.id;
            ui.render();
          },
        },
        t.label,
      ),
    ),
  );
}

function saveBar(index: number, name: string): HTMLElement {
  if (draftName === null || saveTarget === null) {
    draftName = name;
    saveTarget = index;
  }
  const nameInput = h("input", {
    type: "text",
    value: draftName,
    maxLength: 20,
    ariaLabel: "Preset name",
    oninput: (e: Event) => (draftName = (e.target as HTMLInputElement).value),
  });
  const targetSel = h("select", { ariaLabel: "Save to slot", onchange: (e: Event) => (saveTarget = Number((e.target as HTMLSelectElement).value)) });
  for (let i = 1; i <= 80; i++) targetSel.append(h("option", { value: String(i), selected: i === saveTarget }, `${slotLabel(i)} ${device.presetNames.get(i) ?? ""}`));
  return h(
    "div",
    { class: "savebar" },
    h("strong", {}, `${slotLabel(index)} `),
    nameInput,
    h("span", {}, "save to"),
    targetSel,
    h("button", { class: "primary", onclick: () => device.savePreset(saveTarget!, draftName!) }, "Save"),
  );
}

function chainTab(): HTMLElement[] {
  const used = device.preset!.modules.filter((m) => !isEmpty(m));
  const out: HTMLElement[] = [];
  if (device.notice) out.push(h("p", { class: "notice", role: "alert" }, device.notice));
  if (used.some(catalog.isUnnamed)) out.push(h("p", { class: "hint" }, "Some effects have no name in the catalog yet."));
  for (const m of used) out.push(moduleCard(m, used.length));
  if (used.length < catalog.MAX_MODULES) {
    const nextSlot = used.length + 1;
    const add = h("select", {
      ariaLabel: "Add effect",
      onchange: (e: Event) => {
        const type = Number((e.target as HTMLSelectElement).value);
        if (type) device.placeModule(nextSlot, type, catalog.modelsOf(type)[0]);
      },
    });
    add.append(h("option", { value: "" }, "+ Add effect…"));
    for (const t of catalog.CATEGORY_ORDER) add.append(h("option", { value: String(t) }, catalog.typeName(t)));
    out.push(h("div", { class: "add" }, add));
  }
  return out;
}

function editor(): HTMLElement {
  const preset = device.preset;
  const box = h("main", { class: "editor" });
  if (!preset) {
    box.append(h("p", { class: "hint" }, device.link ? "Loading…" : "Connect the pedal by USB (recommended) or Bluetooth."));
    return box;
  }
  box.append(saveBar(preset.index, preset.name), tabBar());
  switch (ui.tab) {
    case "chain":
      box.append(...chainTab());
      break;
    case "mixer":
      box.append(mixerSection(), vocalFxSection());
      break;
    case "looper":
      box.append(looperSection());
      break;
    case "settings":
      box.append(globalSection(), displaySection(), tempoSection(), tunerSection(), drumSection());
      break;
    case "backup":
      box.append(backupBar());
      break;
  }
  return box;
}

/** Gives every control inside a `.param` row the row's label as its accessible name. */
function labelControls() {
  for (const row of app.querySelectorAll<HTMLElement>(".param")) {
    const text = row.querySelector("label:not(.on)")?.textContent?.trim();
    if (!text) continue;
    for (const control of row.querySelectorAll<HTMLElement>("input:not([aria-label]), select:not([aria-label])")) {
      if (!control.closest("label.on")) control.setAttribute("aria-label", text);
    }
  }
}

function render() {
  const keepScroll = app.querySelector<HTMLElement>(".presets")?.scrollTop ?? 0;
  const editScroll = app.querySelector<HTMLElement>(".editor")?.scrollTop ?? 0;
  if (device.preset && saveTarget !== null && device.preset.index !== lastPresetIndex) {
    draftName = null;
    saveTarget = null;
  }
  lastPresetIndex = device.preset?.index;

  const body = h("div", { class: "body" }, presetList(), editor());
  // Re-attaching the log resets its scroll position, so restore it.
  const logEl = document.getElementById("log");
  const logScroll = logEl?.scrollTop ?? 0;
  renderState();
  app.replaceChildren(toolbar(), body, statePanel, logPanel);
  if (logEl) logEl.scrollTop = logScroll;
  const presets = app.querySelector<HTMLElement>(".presets");
  if (presets) presets.scrollTop = keepScroll;
  const ed = app.querySelector<HTMLElement>(".editor");
  if (ed) ed.scrollTop = editScroll;

  labelControls();

  const banner = connectionBanner();
  if (banner) app.prepend(banner);
  if (!hidSupported() && !bluetoothSupported()) {
    app.prepend(h("p", { class: "notice" }, "This browser supports neither WebHID nor Web Bluetooth. Use Chrome or Edge on desktop."));
  }
}

ui.render = render;
if (new URLSearchParams(location.search).has("demo")) {
  // `?demo`: a simulated pedal, to try the interface without hardware.
  void import("../demo/fakePedal").then(({ attachDemoPedal }) => attachDemoPedal(device));
} else {
  initConnection();
}
render();
