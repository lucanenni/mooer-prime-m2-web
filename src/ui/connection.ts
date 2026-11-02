import { WebBluetoothLink, bluetoothSupported } from "../transport/webbluetooth";
import { WebHidLink, hidSupported } from "../transport/webhid";
import { device, log, scheduleRender } from "./ctx";
import { h } from "./dom";

let links: { usb?: WebHidLink; ble?: WebBluetoothLink } = {};
let connecting = false;
let connectionError = "";
let offline = false;

/** Turns a browser error into something a person can act on; "" means the user simply cancelled. */
export function friendlyError(e: unknown, what: "USB" | "Bluetooth"): string {
  const name = e instanceof DOMException ? e.name : "";
  const message = e instanceof Error ? e.message : String(e);
  if (name === "NotFoundError" && /no device selected|chooser/i.test(message)) return "";
  if (name === "NotFoundError") return `No ${what} device was found. Is the pedal on and plugged in?`;
  if (name === "SecurityError") return `The browser blocked ${what}. Use HTTPS or localhost.`;
  if (name === "NotAllowedError" || /failed to open|access denied|busy/i.test(message)) {
    return what === "USB"
      ? "The pedal can't be opened. Another program may be using it (for example Mooer Studio): close it and try again."
      : "Bluetooth access was denied or the pedal is already connected to another device.";
  }
  return `${what}: ${message}`;
}

async function attempt(what: "USB" | "Bluetooth", job: () => Promise<void>) {
  connecting = true;
  connectionError = "";
  scheduleRender();
  try {
    await job();
  } catch (e) {
    log(`${what}: ${e}`);
    connectionError = friendlyError(e, what);
  } finally {
    connecting = false;
    scheduleRender();
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An automatic attempt right after a plug-in often fails because the system has not released the device yet:
 *  retry a few times before showing an error. */
export const connectUsb = (interactive: boolean) =>
  offline ? Promise.resolve() : attempt("USB", async () => {
    for (let tries = interactive ? 1 : 6; ; tries--) {
      try {
        const link = await WebHidLink.connect(device, log, interactive);
        if (link) links.usb = link;
        return;
      } catch (e) {
        if (tries <= 1 || links.usb) throw e;
        log(`USB: ${e}; retrying`);
        await wait(700);
      }
    }
  });

export const connectBle = () =>
  attempt("Bluetooth", async () => {
    links.ble = await WebBluetoothLink.connect(device, log);
  });

/** An empty simulated pedal: build and edit presets without hardware, then save them with Backup → Export. */
export async function workOffline() {
  offline = true;
  const { attachDemoPedal } = await import("../demo/fakePedal");
  attachDemoPedal(device, true);
  log("Offline workspace: saved in this browser as you edit; nothing is sent to a pedal. Use Backup → Export to save files.");
  scheduleRender();
}

/** Erases the offline workspace kept in this browser and starts again with 80 empty presets. */
async function resetWorkspace() {
  if (!confirm("Erase all offline presets saved in this browser?")) return;
  const { clearWorkspace } = await import("../demo/fakePedal");
  clearWorkspace();
  await disconnect();
  await workOffline();
}

export async function disconnect() {
  if (offline) {
    device.detach("USB");
    offline = false;
  }
  await links.usb?.close();
  await links.ble?.close();
  links = {};
  connectionError = "";
  scheduleRender();
}

/** Reconnects a previously authorised pedal and follows plug / unplug events. */
export function initConnection() {
  if (!hidSupported()) return;
  navigator.hid.addEventListener("disconnect", (e) => {
    if (e.device.vendorId === 0x34db) {
      log("USB: pedal unplugged");
      device.detach("USB");
      links.usb = undefined;
      connectionError = "The pedal was unplugged. Plug it back in and click Connect USB (the browser forgets the permission when the cable is removed).";
      scheduleRender();
    }
  });
  navigator.hid.addEventListener("connect", (e) => {
    log(`USB: device plugged in (${e.device.productName ?? "unknown"})`);
    if (!links.usb && !connecting) void connectUsb(false);
  });
  void connectUsb(false);
}

export function toolbar(): HTMLElement {
  const connected = device.link !== null;
  const status = connected
    ? offline
      ? "Offline workspace (no pedal): saved in this browser, export from Backup for files"
      : `${device.link} · ${device.firmware ?? "…"}${device.battery !== undefined ? ` · battery ${device.battery}%` : ""}${device.tempo ? ` · ${device.tempo} BPM` : ""}`
    : connecting
      ? "Connecting…"
      : "Not connected";
  return h(
    "header",
    {},
    h("h1", {}, "Mooer Prime M2"),
    h("span", { class: "status", role: "status" }, status),
    device.isBusy ? h("span", { class: "busy" }, "working…") : null,
    h("span", { class: "spacer" }),
    hidSupported() ? h("button", { onclick: () => void connectUsb(true), disabled: !!links.usb || connecting || offline }, "Connect USB") : null,
    bluetoothSupported() ? h("button", { onclick: () => void connectBle(), disabled: !!links.ble || connecting || offline }, "Connect Bluetooth") : null,
    !connected && !connecting ? h("button", { title: "Build and edit presets without a pedal and save them as files", onclick: () => void workOffline() }, "Work offline") : null,
    connected && offline ? h("button", { class: "danger", title: "Erase the offline presets saved in this browser", onclick: () => void resetWorkspace() }, "Reset workspace") : null,
    connected ? h("button", { onclick: () => void disconnect() }, offline ? "Leave offline mode" : "Disconnect") : null,
  );
}

/** Banner for the last connection problem, or a pedal that stopped answering; null when all is well. */
export function connectionBanner(): HTMLElement | null {
  const text = connectionError || device.connectionIssue || "";
  return text ? h("p", { class: "notice", role: "alert" }, text) : null;
}
