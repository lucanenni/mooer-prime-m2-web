import * as catalog from "../protocol/catalog";
import { device, ui, scheduleRender } from "./ctx";
import { h } from "./dom";
import { SAMPLE_FILE_FOR_MODULE } from "../protocol/loopFile";
import { USER_MODEL_BASE } from "../protocol/modelNames";
import { stripNamMarker } from "../protocol/nam";
import { type PrimeModule, isEnabled, modelOf, slotLabel, withWord } from "../protocol/models";

export function presetList(): HTMLElement {
  const list = h("ul", { class: "presets", ariaLabel: "Presets" });
  const shown = device.displayedPresetIndex;
  for (let i = 1; i <= 80; i++) {
    const name = device.presetNames.get(i) ?? "";
    const select = () => device.selectPreset(i);
    const li = h(
      "li",
      {
        class: i === shown ? "active" : "",
        tabIndex: 0,
        role: "button",
        ariaCurrent: i === shown ? "true" : "false",
        onclick: select,
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select();
          }
        },
      },
      h("span", { class: "slot" }, slotLabel(i)),
      h("span", {}, name || "—"),
    );
    list.append(li);
  }
  return list;
}

export function slider(m: PrimeModule, wordIndex: number): HTMLElement {
  const model = modelOf(m);
  const prm = catalog.param(m.type, model, wordIndex - 2);
  const value = m.words[wordIndex];
  const range = catalog.sliderRange(prm, value);
  const label = h("span", { class: "val" }, catalog.formatValue(value, prm.kind));
  const set = (v: number) => {
    const cur = device.preset?.modules.find((x) => x.slot === m.slot) ?? m;
    device.updateModule(withWord(cur, wordIndex, v));
    label.textContent = catalog.formatValue(v, prm.kind);
  };

  const delayTime = catalog.isSyncable(prm); // Delay Time and Mod Rate
  const syncedNow = delayTime && catalog.syncIndex(prm, value) !== null;
  let control: HTMLElement;
  if (syncedNow) {
    // Tempo-synced delay: the slider steps through the note values.
    const position = Math.max(0, catalog.SYNC_NOTE_ORDER.findIndex(([i]) => i === catalog.syncIndex(prm, value)));
    control = h("input", {
      type: "range",
      min: "0",
      max: String(catalog.SYNC_NOTE_ORDER.length - 1),
      value: String(position),
      oninput: (e: Event) => set(catalog.syncedValue(prm.kind, catalog.SYNC_NOTE_ORDER[Number((e.target as HTMLInputElement).value)][0])),
      onpointerdown: () => (ui.dragging = true),
      onpointerup: () => {
        ui.dragging = false;
        scheduleRender();
      },
    });
  } else if (range) {
    control = h("input", {
      type: "range",
      min: String(range[0]),
      max: String(range[1]),
      value: String(value),
      oninput: (e: Event) => set(Number((e.target as HTMLInputElement).value)),
      onpointerdown: () => (ui.dragging = true),
      onpointerup: () => {
        ui.dragging = false;
        scheduleRender();
      },
    });
  } else {
    control = h("input", {
      type: "number",
      value: String(value),
      onchange: (e: Event) => set(Math.max(0, Math.min(0xffff, Number((e.target as HTMLInputElement).value) || 0))),
    });
  }

  const row = h("div", { class: "param" }, h("label", {}, prm.label), control, label);
  if (delayTime) {
    // Choose how the delay time is shown and set: milliseconds or note value, converted at the pedal's tempo.
    row.append(
      h(
        "button",
        {
          title: syncedNow ? prm.kind === "rate" ? "Set the rate freely" : "Show and set the time in milliseconds" : "Sync to the tempo (note value)",
          onclick: () => {
            const bpm = device.tempo || 120;
            const cur = device.preset?.modules.find((x) => x.slot === m.slot) ?? m;
            const now = cur.words[wordIndex];
            const index = catalog.syncIndex(prm, now);
            // A delay time converts at the tempo; a modulation rate has no unit, so it starts from 1/4 or the middle.
            const next =
              prm.kind === "rate"
                ? index === null
                  ? catalog.syncedValue(prm.kind, 10)
                  : 50
                : index === null
                  ? catalog.syncedValue(prm.kind, catalog.nearestSync(now, bpm))
                  : Math.max(40, Math.min(2500, Math.round(catalog.syncMs(index, bpm))));
            device.updateModule(withWord(cur, wordIndex, next));
            scheduleRender();
          },
        },
        syncedNow ? (prm.kind === "rate" ? "Free" : "ms") : "♩",
      ),
    );
  }
  return row;
}

const requestedSampleLists = new Set<number>();

/** Model text for the picker; user slots show the name of the sample stored there once the pedal's list was read over USB. */
function modelText(type: number, model: number): string {
  const fileType = SAMPLE_FILE_FOR_MODULE[type];
  if (fileType === undefined || model < USER_MODEL_BASE) return catalog.modelLabel(type, model);
  const slot = device.sampleSlots.get(fileType)?.find((s) => s.id === model - USER_MODEL_BASE + 1);
  if (!slot) return catalog.modelLabel(type, model);
  const num = String(model + 1).padStart(2, "0");
  return `${num} ${slot.empty || !slot.name ? `User ${slot.id} (empty)` : stripNamMarker(slot.name)}`;
}

/** Asks the pedal once for the sample names of this effect type (USB only), so user models can show them. */
function wantSampleNames(type: number) {
  const fileType = SAMPLE_FILE_FOR_MODULE[type];
  if (device.link !== "USB") return requestedSampleLists.clear();
  if (fileType === undefined || requestedSampleLists.has(fileType) || device.sampleSlots.has(fileType)) return;
  requestedSampleLists.add(fileType);
  queueMicrotask(() => device.readSampleList(fileType));
}

export function moduleCard(m: PrimeModule, usedCount: number): HTMLElement {
  const model = modelOf(m);
  wantSampleNames(m.type);
  const card = h("section", { class: "module" + (isEnabled(m) ? "" : " off") });

  const typeSel = h("select", {
    onchange: (e: Event) => {
      const type = Number((e.target as HTMLSelectElement).value);
      device.placeModule(m.slot, type, catalog.modelsOf(type)[0]);
    },
  });
  for (const t of catalog.CATEGORY_ORDER) typeSel.append(h("option", { value: String(t), selected: t === m.type }, catalog.typeName(t)));

  const modelSel = h("select", {
    onchange: (e: Event) => device.placeModule(m.slot, m.type, Number((e.target as HTMLSelectElement).value)),
  });
  for (const mo of catalog.modelsOf(m.type)) modelSel.append(h("option", { value: String(mo), selected: mo === model }, modelText(m.type, mo)));

  card.append(
    h(
      "div",
      { class: "module-head" },
      h("input", {
        type: "checkbox",
        checked: isEnabled(m),
        title: "On/off",
        ariaLabel: "Effect on/off",
        onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          device.updateModule(withWord(device.preset?.modules.find((x) => x.slot === m.slot) ?? m, 0, on ? 1 : 0));
        },
      }),
      typeSel,
      modelSel,
      h("button", { title: "Move up", ariaLabel: "Move effect up", disabled: m.slot <= 1, onclick: () => device.moveModule(m.slot, m.slot - 1) }, "↑"),
      h("button", { title: "Move down", ariaLabel: "Move effect down", disabled: m.slot >= usedCount, onclick: () => device.moveModule(m.slot, m.slot + 1) }, "↓"),
      h("button", { class: "danger", title: "Remove", ariaLabel: "Remove effect", onclick: () => device.deleteModule(m.slot) }, "✕"),
    ),
  );

  const params = h("div", { class: "params" });
  // Only the visible parameters are shown; hidden DSP words stay untouched.
  const visible = visibleWordCount(m);
  for (let i = 2; i < 2 + visible && i < m.words.length; i++) params.append(slider(m, i));
  card.append(params);
  return card;
}

export function visibleWordCount(m: PrimeModule): number {
  const model = modelOf(m);
  let n = 0;
  while (catalog.param(m.type, model, n).kind !== "unknown" && 2 + n < m.words.length) n++;
  // Unknown types/models: show everything so nothing is hidden.
  return n === 0 ? Math.max(0, m.words.length - 2) : n;
}
