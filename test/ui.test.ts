// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { attachDemoPedal } from "../src/demo/fakePedal";
import { device, scheduleRender, ui } from "../src/ui/ctx";
import { moduleCard } from "../src/ui/chain";
import { samplesTab } from "../src/ui/samples";
import { globalSection } from "../src/ui/settings";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const button = (root: HTMLElement, text: string, nth = 0) => [...root.querySelectorAll("button")].filter((b) => b.textContent === text)[nth]!;

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0));
  vi.stubGlobal("confirm", () => true);
  attachDemoPedal(device, true);
  for (let i = 0; i < 40 && !device.firmware; i++) await wait(25);
});

describe("samples against the simulated pedal", () => {
  it("lists a written sample, names it in the model menu and removes it on delete", async () => {
    await device.transfer(() => device.writeFile(3, 1, "Ivory Blue", new Uint8Array(800), 400));
    device.readSampleList(3);
    await wait(100);

    const tab = samplesTab();
    button(tab, "Pre-Amp").click();
    let rows = samplesTab();
    expect(rows.textContent).toContain("Ivory Blue");

    const card = moduleCard({ slot: 1, type: 2, words: [1, 200, 50, 50, 50, 50, 50, 50] }, 1);
    const options = [...card.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toContain("201 Ivory Blue");
    expect(options).toContain("202 User 2 (empty)");

    button(rows, "Delete", 0).click();
    await wait(100);
    rows = samplesTab();
    expect(rows.querySelector(".param .val")!.textContent).toBe("Empty");
  });
});

describe("Bluetooth name", () => {
  it("adds the M2 prefix to what is typed", async () => {
    const box = globalSection();
    const input = box.querySelector<HTMLInputElement>('input[aria-label^="Bluetooth name"]')!;
    input.value = "Studio";
    button(box, "Rename").click();
    await wait(20);
    expect(device.bluetoothName).toBe("M2Studio");
  });
});

describe("rendering while editing", () => {
  const render = vi.fn();
  beforeEach(async () => {
    document.body.replaceChildren();
    await wait(50); // let any pending redraw from the previous test finish
    render.mockClear();
    ui.render = render;
  });

  it("waits while a text field is being edited, then renders on change", async () => {
    const input = document.createElement("input");
    input.type = "text";
    document.body.append(input);
    input.focus();
    scheduleRender();
    await wait(20);
    expect(render).not.toHaveBeenCalled();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(20);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild between mouse-down and mouse-up", async () => {
    const input = document.createElement("input");
    input.type = "text";
    document.body.append(input);
    input.focus();
    document.dispatchEvent(new Event("pointerdown"));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
    await wait(20);
    expect(render).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("pointerup"));
    await wait(40);
    expect(render).toHaveBeenCalled();
  });

  it("renders at once when nothing is being edited", async () => {
    scheduleRender();
    await wait(20);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
