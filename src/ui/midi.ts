import { device, log, scheduleRender } from "./ctx";
import { h } from "./dom";
import { MIDI_FUNCTIONS } from "../protocol/models";

// ---- MIDI assignments (experimental) -----------------------------------------

type Learning = { index: number; state: "waiting" | "learned" | "used" | "failed"; detail: string };
let learning: Learning | null = null;

async function learn(index: number) {
  learning = { index, state: "waiting", detail: "Send a MIDI message from the external device (20 s)…" };
  scheduleRender();
  try {
    const result = await device.midiLearn(index);
    if (!learning || learning.index !== index) return;
    const raw = result.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    if (result.status === 1) learning = { index, state: "learned", detail: `Learned (${raw}). Save to keep it.` };
    else if (result.status === 6) learning = { index, state: "used", detail: "That MIDI message is already used by another function." };
    else learning = { index, state: "failed", detail: `Learning failed (status ${result.status}).` };
  } catch {
    if (learning?.index === index) learning = { index, state: "failed", detail: "No MIDI message received." };
  }
  scheduleRender();
}

export function midiSection(): HTMLElement {
  const box = h("section", { class: "mixer" }, h("strong", {}, "MIDI (experimental)"));
  const table = device.midiTable;
  box.append(
    h(
      "div",
      { class: "backup" },
      h("button", { onclick: () => device.readMidiTable() }, "Read assignments"),
      h("span", { class: "hint" }, table.length ? "The value is the number the pedal learned for each function." : "Not read yet"),
    ),
  );
  table.forEach((a, i) => {
    const active = learning?.index === i;
    box.append(
      h(
        "div",
        { class: "param" },
        h("label", {}, MIDI_FUNCTIONS[i]),
        h("span", { class: "val" }, a.assigned ? String(a.value) : "—"),
        h("button", { disabled: !!learning && learning.state === "waiting", onclick: () => void learn(i) }, "Learn"),
        h("button", { disabled: !a.assigned || (!!learning && learning.state === "waiting"), onclick: () => confirm(`Remove the MIDI assignment of “${MIDI_FUNCTIONS[i]}”?`) && device.midiRemove(i) }, "Remove"),
        active && learning
          ? h(
              "span",
              { class: "hint" },
              learning.detail,
              learning.state === "learned"
                ? h("button", { class: "primary", onclick: () => { learning = null; device.midiSave(); scheduleRender(); } }, "Save")
                : null,
              learning.state !== "waiting" ? h("button", { onclick: () => { learning = null; log("MIDI learn dismissed"); scheduleRender(); } }, "Close") : null,
            )
          : null,
      ),
    );
  });
  return box;
}
