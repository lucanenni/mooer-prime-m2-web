import { CAB_IR_SAMPLES, SAMPLE_FRAME_BYTES, SAMPLE_TYPES, checkSampleFile, dataSection, packCabIr } from "../protocol/loopFile";
import { device, scheduleRender } from "./ctx";
import { h } from "./dom";
import { download } from "./backup";
import { NAM_A2_NAME_MARKER, namA2Payload, stripNamMarker } from "../protocol/nam";

// ---- Samples: cabs, drives, pre-amps, entire amps (USB only, experimental) ----------------------

let message = "";
let busy = false;
const slotCount = 10;
let selectedType: number = SAMPLE_TYPES[0].type;

const safe = (name: string) => name.replace(/[^\w.-]+/g, "_") || "sample";

async function run(job: () => Promise<void>) {
  busy = true;
  message = "";
  scheduleRender();
  try {
    await device.transfer(job);
  } catch (e) {
    message = `Error: ${e instanceof Error ? e.message : e}`;
  } finally {
    busy = false;
    scheduleRender();
  }
}

async function exportSample(type: number, id: number, extension: string) {
  await run(async () => {
    const file = await device.readFile(type, id, (done, total) => {
      message = `Reading slot ${id}: ${Math.round((done / total) * 100)}%`;
      scheduleRender();
    });
    download(`${safe(file.name)}.${extension}`, file.data);
    message = `Exported “${file.name}” (${file.data.length} bytes).`;
  });
}

/** The bytes to store for a file chosen by the user; the cab accepts a WAV (its first 1024 samples) or raw IR data. */
async function sampleData(type: number, file: File): Promise<{ data: Uint8Array; marker: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkSampleFile(type, file.name, bytes);
  if (problem) throw new Error(problem);
  if (/\.nam$/i.test(file.name)) {
    const nam = namA2Payload(new TextDecoder().decode(bytes));
    if ("error" in nam) throw new Error(nam.error);
    return { data: nam.data, marker: true };
  }
  if (type === 1 && /\.wav$/i.test(file.name)) {
    const context = new AudioContext({ sampleRate: 44100 });
    try {
      const audio = await context.decodeAudioData(bytes.slice().buffer);
      return { data: packCabIr(audio.getChannelData(0)), marker: false };
    } catch {
      throw new Error("This WAV could not be decoded.");
    } finally {
      void context.close();
    }
  }
  const data = dataSection(bytes);
  if (type === 1 && data.length !== CAB_IR_SAMPLES * 4) throw new Error(`A cab IR is ${CAB_IR_SAMPLES * 4} bytes; this file has ${data.length}.`);
  return { data, marker: false };
}

async function importSample(type: number, id: number, file: File, current: string) {
  if (current && !confirm(`Replace “${current}” in slot ${id} with “${file.name}”? The current file is lost; export it first if you want to keep it.`)) return;
  await run(async () => {
    const { data, marker } = await sampleData(type, file);
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\x20-\x7e]+/g, "_") || "untitled";
    const name = marker ? NAM_A2_NAME_MARKER + base.slice(0, 50 - NAM_A2_NAME_MARKER.length) : base.slice(0, 50);
    await device.writeFile(type, id, name, data, SAMPLE_FRAME_BYTES, (done, total) => {
      message = `Writing slot ${id}: ${Math.round((done / total) * 100)}%`;
      scheduleRender();
    });
    message = `Imported “${name}” (${data.length} bytes) into slot ${id}.`;
    device.readSampleList(type);
  });
}

async function deleteSample(type: number, id: number, name: string) {
  if (!confirm(`Delete “${name}” from slot ${id}? Export it first if you want to keep it.`)) return;
  await run(async () => {
    await device.deleteFile(type, id, name);
    message = `Deleted “${name}”.`;
    device.clearSampleSlot(type, id);
    // The pedal needs a moment before the list reflects the change.
    setTimeout(() => device.readSampleList(type), 1000);
  });
}

export function samplesTab(): HTMLElement {
  const usb = device.link === "USB";
  const box = h("section", { class: "mixer" }, h("strong", {}, "Samples (experimental)"));
  box.append(
    h(
      "div",
      { class: "backup" },
      h("button", { disabled: !usb || busy, onclick: () => device.readSampleList(selectedType) }, "Read"),
      h("span", { class: "hint" }, usb ? "Cabs, drives, pre-amps and entire amps stored on the pedal. Import and delete change the pedal: export first." : "USB only"),
      message ? h("span", { class: message.startsWith("Error") ? "notice-inline" : "hint" }, message) : null,
    ),
  );
  box.append(
    h(
      "div",
      { class: "tabs", role: "tablist" },
      ...SAMPLE_TYPES.map((t) =>
        h("button", { class: "tab" + (t.type === selectedType ? " active" : ""), role: "tab", ariaSelected: String(t.type === selectedType), onclick: () => { selectedType = t.type; if (usb && !device.sampleSlots.has(t.type)) device.readSampleList(t.type); scheduleRender(); } }, t.label),
      ),
    ),
  );
  for (const t of SAMPLE_TYPES.filter((x) => x.type === selectedType)) {
    const slots = device.sampleSlots.get(t.type);
    for (let id = 1; id <= slotCount; id++) {
      const slot = slots?.find((s) => s.id === id);
      const name = slot && !slot.empty ? slot.name : "";
      const shown = stripNamMarker(name);
      const input = h("input", {
        type: "file",
        ariaLabel: `Choose a file for slot ${id}`,
        accept: t.accepts,
        hidden: true,
        onchange: (e: Event) => {
          const el = e.target as HTMLInputElement;
          if (el.files?.[0]) void importSample(t.type, id, el.files[0], name);
          el.value = "";
        },
      });
      box.append(
        h(
          "div",
          { class: "param" },
          h("label", {}, `${id}`),
          h("span", { class: "val" }, slots ? (shown || "Empty") + (name.startsWith(NAM_A2_NAME_MARKER) ? " (NAM)" : "") : "—"),
          h("button", { disabled: !usb || busy || !name, onclick: () => void exportSample(t.type, id, t.extension) }, "Export"),
          h("button", { disabled: !usb || busy, onclick: () => input.click() }, "Import…"),
          input,
          h("button", { class: "danger", disabled: !usb || busy || !name, onclick: () => void deleteSample(t.type, id, name) }, "Delete"),
        ),
      );
    }
  }
  return box;
}
