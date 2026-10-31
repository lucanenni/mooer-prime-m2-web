// A simulated pedal for trying the interface without hardware (open the page with `?demo`).
// It answers the commands the editor uses over a fake Bluetooth link; it is not a faithful emulation.

import * as frame from "../protocol/frame";
import type { PrimeM2Device, Transport } from "../protocol/device";
import { type PrimeModule, encodeModule, encodeName } from "../protocol/models";

const DEFAULTS: { type: number; model: number; params: number[] }[] = [
  { type: 0x01, model: 3, params: [50, 50, 50] }, // Drive 808
  { type: 0x02, model: 4, params: [50, 50, 50, 50, 50, 50] }, // Pre-Amp
  { type: 0x03, model: 7, params: [50, 0, 0] }, // Cab
  { type: 0x07, model: 1, params: [40, 30, 500] }, // Delay
  { type: 0x08, model: 1, params: [0, 40, 50, 50] }, // Reverb
];

const newModule = (slot: number, d = DEFAULTS[(slot - 1) % DEFAULTS.length]): PrimeModule => ({ slot, type: d.type, words: [1, d.model, ...d.params] });

function initialState(): Uint8Array {
  const s = new Uint8Array(99);
  s[0] = 0x12;
  s[1] = 1;
  s[2] = 1;
  s.set([24, 24, 24, 24, 9, 255], 3);
  s.set(encodeName("M2Prime M2"), 9);
  s.set([0, 60, 0, 60, 0, 60, 0, 0, 60, 60, 0, 60, 120, 0, 1, 10, 1, 0, 60, 1, 0], 29);
  s.set([255, 1, 60, 1, 0, 70, 0, 20, 0, 1, 0, 24, 0, 24, 0, 24, 0, 1, 0, 40, 0, 50, 0, 50, 0, 25, 0], 50);
  s.set([50, 50, 50, 50, 1, 1, 1, 1, 3, 0], 89);
  return s;
}

export function attachDemoPedal(device: PrimeM2Device): void {
  const state = initialState();
  const stored: { name: string; modules: PrimeModule[]; bpm: number }[] = Array.from({ length: 81 }, (_, i) => ({
    name: i === 0 ? "" : `Demo ${i}`,
    modules: DEFAULTS.map((_, k) => newModule(k + 1)),
    bpm: 120,
  }));
  let buffer = structuredClone(stored[state[1]]);

  const presetPayload = (idx: number) => {
    const source = idx === state[1] ? buffer : stored[idx];
    const slots = Array.from({ length: 20 }, (_, k) => source.modules[k]);
    return [0x22, idx, ...encodeName(source.name), ...slots.flatMap((m, k) => (m ? Array.from(encodeModule({ ...m, slot: k + 1 })) : [k + 1, 0, 0])), 0, 0, 0, 0, 0, 0, 0];
  };

  const respond = (p: number[]): number[] | null => {
    switch (p[0]) {
      case 0x01: return [0x02, 0x41, 0x01, ...Array.from("V1.5.0", (c) => c.charCodeAt(0)), 0];
      case 0xa9: return [0xaa, 0, 0, ...Array.from("demo", (c) => c.charCodeAt(0)), 0];
      case 0x29: return [0x2a, p[1], p[2], ...Array.from({ length: p[2] - p[1] + 1 }, (_, i) => Array.from(encodeName(stored[p[1] + i].name))).flat()];
      case 0x11: return Array.from(state);
      case 0x13: {
        state.set(p.slice(1), 1);
        buffer = structuredClone(stored[state[1]]);
        return [0x14, 1];
      }
      case 0x21: return presetPayload(p[1]);
      case 0x23: return [0x24, ...encodeModule({ ...(buffer.modules[p[1] - 1] ?? { type: 0, words: [] }), slot: p[1] })];
      case 0x25: {
        const slot = p[1];
        const words = Array.from({ length: p[3] / 2 }, (_, i) => p[4 + i * 2] | (p[5 + i * 2] << 8));
        if (buffer.modules[slot - 1]) buffer.modules[slot - 1] = { slot, type: p[2], words };
        return [0x26, 1];
      }
      case 0x2d: {
        const [, id, op, a, b, c] = p;
        const m = buffer.modules;
        let ok = true;
        if (op === 1 || op === 2) {
          if (a > m.length + 1) ok = false;
          else m[a - 1] = { slot: a, type: b, words: [1, c, ...(DEFAULTS.find((d) => d.type === b)?.params ?? [50, 50, 50])] };
        } else if (op === 3) {
          m.splice(a - 1, 1);
        } else if (op === 4 && a >= 1 && a <= m.length && b >= 1 && b <= m.length) {
          m.splice(b - 1, 0, ...m.splice(a - 1, 1));
        } else ok = false;
        return [0x2e, id, ok ? 1 : 0];
      }
      case 0x2f: {
        const name = new TextDecoder().decode(Uint8Array.from(p.slice(2, 22))).replace(/\0.*$/, "");
        stored[p[1]] = { ...structuredClone(buffer), name };
        return [0x30, 1];
      }
      case 0x33: return [0x34, stored[p[1]].bpm & 0xff, stored[p[1]].bpm >> 8];
      case 0x4d: return [0x4e, 1];
      case 0x53: return [0x54, ...Array.from({ length: 10 }, () => [1, 0, 0, 0, 0, 0, ...encodeName("")]).flat()];
      case 0xb1: return [0xb2, ...[[1, 26], [1, 25], [1, 10], [1, 22], [1, 11], [1, 24], [0, 255], [0, 255], [1, 14], ...Array.from({ length: 11 }, () => [0, 255])].flat()];
      case 0xb3: return [0xb4, 1, 0, 0];
      case 0xb5: case 0xb7: return [p[0] + 1, 1];
      case 0x65: return [0x66, ...Array.from({ length: (p[4] | (p[5] << 8)) - (p[2] | (p[3] << 8)) + 1 }, (_, i) => { const n = (p[2] | (p[3] << 8)) + i; return [p[1], n & 0xff, n >> 8, 1, 1, ...encodeName(`PATTERN ${n}`), ...new Array(34).fill(0)]; }).flat()];
      case 0x91: return [0x92, 80, 0];
      case 0xb1: return [0xb2];
      default: return null;
    }
  };

  const transport: Transport = {
    kind: "Bluetooth",
    async close() {},
    async write(data) {
      const decoded = frame.decode(data);
      if (!decoded) return;
      const reply = respond(Array.from(decoded.payload));
      if (reply) setTimeout(() => device.receive("Bluetooth", frame.encode(reply)), 5);
    },
  };
  device.attach(transport);
}
