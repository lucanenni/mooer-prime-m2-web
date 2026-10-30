import * as catalog from "../protocol/catalog";
import { device, ui, scheduleRender } from "./ctx";
import { h } from "./dom";
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

  let control: HTMLElement;
  if (range) {
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
  if (catalog.isSyncable(prm)) {
    const synced = catalog.syncIndex(prm, value) !== null;
    const select = h("select", {
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        set(v === "" ? (prm.kind === "rate" ? 50 : 500) : catalog.syncedValue(prm.kind, Number(v)));
        scheduleRender();
      },
    });
    select.append(h("option", { value: "" }, "Free"));
    for (const [idx, note] of catalog.SYNC_NOTE_ORDER) {
      select.append(h("option", { value: String(idx), selected: catalog.syncIndex(prm, value) === idx }, note));
    }
    if (!synced) select.value = "";
    row.append(select);
  }
  return row;
}

export function moduleCard(m: PrimeModule, usedCount: number): HTMLElement {
  const model = modelOf(m);
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
  for (const mo of catalog.modelsOf(m.type)) modelSel.append(h("option", { value: String(mo), selected: mo === model }, catalog.modelLabel(m.type, mo)));

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
