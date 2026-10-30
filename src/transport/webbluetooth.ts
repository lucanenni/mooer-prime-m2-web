// BLE link via Web Bluetooth. Service FFF0: FFF2 notify (device -> host), FFF3 write (host -> device).
// The device advertises as "M2Prime M2"; no pairing needed.

import type { PrimeM2Device, Transport } from "../protocol/device";

const SERVICE = 0xfff0;
const NOTIFY = 0xfff2;
const WRITE = 0xfff3;

export const bluetoothSupported = () => "bluetooth" in navigator;

export class WebBluetoothLink implements Transport {
  kind = "Bluetooth" as const;

  private constructor(
    private server: BluetoothRemoteGATTServer,
    private writeChar: BluetoothRemoteGATTCharacteristic,
    private notifyChar: BluetoothRemoteGATTCharacteristic,
    private onNotify: (e: Event) => void,
    private device: PrimeM2Device,
  ) {}

  static async connect(device: PrimeM2Device, log: (m: string) => void): Promise<WebBluetoothLink> {
    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "M2Prime" }],
      optionalServices: [SERVICE],
    });
    const server = await dev.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE);
    const notifyChar = await service.getCharacteristic(NOTIFY);
    const writeChar = await service.getCharacteristic(WRITE);
    const onNotify = (e: Event) => {
      const v = (e.target as BluetoothRemoteGATTCharacteristic).value!;
      device.receive("Bluetooth", new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    };
    const onDisconnect = () => {
      log("Bluetooth: disconnected");
      device.detach("Bluetooth");
    };
    notifyChar.addEventListener("characteristicvaluechanged", onNotify);
    dev.addEventListener("gattserverdisconnected", onDisconnect);
    await notifyChar.startNotifications();
    log(`Bluetooth: connected to ${dev.name ?? "device"}`);
    const link = new WebBluetoothLink(server, writeChar, notifyChar, onNotify, device);
    device.attach(link);
    return link;
  }

  async write(data: Uint8Array): Promise<void> {
    // Write with response. Frames can exceed the default
    // 20-byte ATT payload; the browser fragments long writes.
    await this.writeChar.writeValueWithResponse(data as BufferSource);
  }

  async close(): Promise<void> {
    this.notifyChar.removeEventListener("characteristicvaluechanged", this.onNotify);
    this.device.detach("Bluetooth");
    if (this.server.connected) this.server.disconnect();
  }
}
