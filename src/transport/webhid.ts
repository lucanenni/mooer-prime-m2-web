// USB HID link via WebHID (Chrome/Edge desktop, secure context).
// VID 0x34DB, PID 13; one interface, 1024-byte reports, no report ID.

import type { PrimeM2Device, Transport } from "../protocol/device";

export const VENDOR_ID = 0x34db;
export const PRODUCT_ID = 13;
const REPORT_SIZE = 1024;

export const hidSupported = () => "hid" in navigator;

/** Output report = [frameLength, frame...], zero-padded to the report size. */
export function hidReport(frame: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(REPORT_SIZE));
  out[0] = frame.length;
  out.set(frame, 1);
  return out;
}

export class WebHidLink implements Transport {
  kind = "USB" as const;
  private onReport = (e: HIDInputReportEvent) => this.device.receive("USB", new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));

  private constructor(private hid: HIDDevice, private device: PrimeM2Device) {}

  /** Opens an already-authorised device, or asks the user to pick one. */
  static async connect(device: PrimeM2Device, log: (m: string) => void, interactive: boolean): Promise<WebHidLink | null> {
    const filters = [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }];
    let hid = (await navigator.hid.getDevices()).find((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
    if (!hid && interactive) hid = (await navigator.hid.requestDevice({ filters }))[0];
    if (!hid) return null;
    if (!hid.opened) await hid.open();
    log(`USB: opened ${hid.productName ?? "device"}, collections: ${hid.collections.map((c) => `page ${c.usagePage}/usage ${c.usage}`).join(", ")}`);
    const link = new WebHidLink(hid, device);
    hid.addEventListener("inputreport", link.onReport);
    device.attach(link);
    return link;
  }

  async write(data: Uint8Array): Promise<void> {
    await this.hid.sendReport(0, hidReport(data));
  }

  async close(): Promise<void> {
    this.hid.removeEventListener("inputreport", this.onReport);
    this.device.detach("USB");
    if (this.hid.opened) await this.hid.close();
  }
}
