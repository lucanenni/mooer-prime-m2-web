import * as catalog from "../protocol/catalog";
import { device, log, scheduleRender } from "./ctx";
import { h } from "./dom";
import { slotLabel } from "../protocol/models";
import { type BankEntry, CloudPreset, decodeBank, encodeBank } from "../protocol/cloudPreset";

// ---- Backup and restore (whole presets, USB only) --------------------------

export let backupMsg = "";
export let backupBusy = false;
export let imported: { entries: BankEntry[]; selected: number; target: number } | null = null;

export function download(name: string, data: Uint8Array | string, type = "application/octet-stream") {
  const a = h("a", { href: URL.createObjectURL(new Blob([data as BlobPart], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const fileName = (index: number, name: string) => `${slotLabel(index)}-${name.replace(/[^\w.-]+/g, "_")}`;

/** Runs a transfer job with a status line and error handling. */
export async function runBackup(job: () => Promise<void>) {
  backupBusy = true;
  backupMsg = "";
  scheduleRender();
  try {
    await device.transfer(job);
  } catch (e) {
    backupMsg = `Error: ${e instanceof Error ? e.message : e}`;
    log(backupMsg);
  } finally {
    backupBusy = false;
    scheduleRender();
  }
}

export function setMsg(msg: string) {
  backupMsg = msg;
  scheduleRender();
}

export const exportCurrent = (index: number) =>
  runBackup(async () => {
    const preset = await device.readStoredPreset(index);
    download(`${fileName(index, preset.name)}.preset`, preset.fileData);
    setMsg(`Exported the saved version of ${slotLabel(index)} “${preset.name}”.`);
  });

export const exportAll = () =>
  runBackup(async () => {
    const entries: BankEntry[] = [];
    for (let i = 1; i <= 80; i++) {
      setMsg(`Reading preset ${i}/80…`);
      const preset = await device.readStoredPreset(i);
      entries.push({ index: i, name: preset.name, preset });
    }
    download(`mooer-m2-bank-${new Date().toISOString().slice(0, 10)}.json`, encodeBank(entries), "application/json");
    setMsg("Exported all 80 presets.");
  });

let copyTarget = 0;

/** Copies the saved version of preset `from` over slot `to`, after downloading a backup of `to`. */
export async function copyPreset(from: number, to: number) {
  if (from === to) return setMsg("Pick a different slot.");
  const current = device.presetNames.get(to) ?? "";
  const source = device.presetNames.get(from) ?? "";
  if (!confirm(`Overwrite ${slotLabel(to)} “${current}” with ${slotLabel(from)} “${source}”?\n\nA backup of ${slotLabel(to)} is downloaded first. Unsaved edits to ${slotLabel(from)} are not copied.`)) return;
  await runBackup(async () => {
    const old = await device.readStoredPreset(to);
    download(`backup-${fileName(to, old.name)}.preset`, old.fileData);
    const preset = await device.readStoredPreset(from);
    await device.restoreStoredPreset(to, preset);
    device.refreshPreset(to);
    setMsg(`Copied ${slotLabel(from)} to ${slotLabel(to)} and verified. The previous ${slotLabel(to)} was downloaded as a backup.`);
  });
}

export async function importFile(file: File) {
  let entries: BankEntry[] | null = null;
  if (file.name.toLowerCase().endsWith(".json")) {
    entries = decodeBank(await file.text());
  } else {
    const preset = CloudPreset.fromFile(new Uint8Array(await file.arrayBuffer()));
    if (preset) entries = [{ index: 0, name: preset.name, preset }];
  }
  if (!entries?.length) return setMsg("Not a valid preset or bank file.");
  const bad = entries.find((e) => !e.preset.crcIsValid);
  if (bad) return setMsg(`The checksum of “${bad.name}” is wrong; the file is damaged and was not loaded.`);
  imported = { entries, selected: 0, target: entries[0].index || device.preset?.index || 1 };
  setMsg(`Loaded ${entries.length === 1 ? `“${entries[0].name}”` : `${entries.length} presets`} from ${file.name}.`);
}

export function backupBar(): HTMLElement {
  const usb = device.link === "USB";
  const disabled = !usb || backupBusy || device.isTransferring;
  const index = device.preset?.index;
  const fileInput = h("input", {
    type: "file",
    accept: ".preset,.json",
    hidden: true,
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.files?.[0]) void importFile(input.files[0]);
      input.value = "";
    },
  });
  const bar = h(
    "section",
    { class: "backup" },
    h("strong", {}, "Backup"),
    h("button", { disabled: disabled || index === undefined, onclick: () => void exportCurrent(index!) }, "Export this preset"),
    h("button", { disabled, onclick: () => void exportAll() }, "Export all 80"),
    h("button", { disabled, onclick: () => fileInput.click() }, "Import…"),
    fileInput,
    copyRow(disabled, index),
    usb ? null : h("span", { class: "hint" }, "USB only"),
    backupMsg ? h("span", { class: backupMsg.startsWith("Error") ? "notice-inline" : "hint" }, backupMsg) : null,
  );
  if (imported) bar.append(importPanel(disabled));
  return bar;
}

export function importPanel(disabled: boolean): HTMLElement {
  const state = imported!;
  const entry = state.entries[state.selected];
  const chain = entry.preset.chain.map((m) => `${catalog.typeName(m.type)}${m.enabled ? "" : " (off)"}`).join(" → ") || "empty";

  const pick = h("select", {
    onchange: (e: Event) => {
      state.selected = Number((e.target as HTMLSelectElement).value);
      state.target = state.entries[state.selected].index || state.target;
      scheduleRender();
    },
  });
  state.entries.forEach((en, i) => pick.append(h("option", { value: String(i), selected: i === state.selected }, `${en.index ? slotLabel(en.index) + " " : ""}${en.name}`)));

  const target = h("select", { onchange: (e: Event) => (state.target = Number((e.target as HTMLSelectElement).value)) });
  for (let i = 1; i <= 80; i++) target.append(h("option", { value: String(i), selected: i === state.target }, `${slotLabel(i)} ${device.presetNames.get(i) ?? ""}`));

  const write = async () => {
    const t = state.target;
    const current = device.presetNames.get(t) ?? "";
    if (!confirm(`Overwrite ${slotLabel(t)} “${current}” with “${entry.name}”?\n\nA backup of the current preset is downloaded first.`)) return;
    await runBackup(async () => {
      const old = await device.readStoredPreset(t);
      download(`backup-${fileName(t, old.name)}.preset`, old.fileData);
      await device.restoreStoredPreset(t, entry.preset);
      device.refreshPreset(t);
      setMsg(`Written to ${slotLabel(t)} and verified. The previous version was downloaded as a backup.`);
    });
  };

  return h(
    "div",
    { class: "import" },
    state.entries.length > 1 ? pick : h("strong", {}, entry.name),
    h("span", { class: "hint" }, `${chain} · ${entry.preset.bpm} BPM`),
    h("button", { disabled, title: "Plays it on the pedal without storing it", onclick: () => void runBackup(() => device.writeStoredPreset(0, entry.preset).then(() => setMsg("Auditioning: nothing is stored. Press “End audition” to go back."))) }, "Audition"),
    h("button", { disabled, onclick: () => void runBackup(() => device.endAudition().then(() => setMsg("Audition ended."))) }, "End audition"),
    h("span", {}, "write to"),
    target,
    h("button", { class: "primary", disabled, onclick: () => void write() }, "Write to slot"),
    h("button", { onclick: () => { imported = null; scheduleRender(); } }, "Close"),
  );
}

function copyRow(disabled: boolean, index: number | undefined): HTMLElement {
  if (!copyTarget && index) copyTarget = index === 80 ? 79 : index + 1;
  const target = h("select", { ariaLabel: "Copy to slot", onchange: (e: Event) => (copyTarget = Number((e.target as HTMLSelectElement).value)) });
  for (let i = 1; i <= 80; i++) target.append(h("option", { value: String(i), selected: i === copyTarget }, `${slotLabel(i)} ${device.presetNames.get(i) ?? ""}`));
  return h(
    "span",
    { class: "inline" },
    h("span", {}, "Copy this preset to"),
    target,
    h("button", { disabled: disabled || index === undefined, onclick: () => void copyPreset(index!, copyTarget) }, "Copy"),
  );
}
