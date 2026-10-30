import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as frame from "../src/protocol/frame";
import { PrimeM2Device, type Transport } from "../src/protocol/device";
import { encodeModule, encodeName, parsePreset, slotLabel } from "../src/protocol/models";
import * as catalog from "../src/protocol/catalog";
import { hidReport } from "../src/transport/webhid";
import { CloudPreset, decodeBank, encodeBank } from "../src/protocol/cloudPreset";

/** A valid 1198-byte whole preset: name, bpm and one Drive module, with its CRC. */
function makeCloud(name: string, fill = 0): CloudPreset {
  const data = new Uint8Array(1198).fill(0);
  data.fill(fill, 322, 390);
  data[390] = 120;
  data.set(encodeName(name), 392);
  data[412] = 1; // module 1: type 1 (Drive), enabled
  data[414] = 1;
  const crc = frame.crc16(data.subarray(322, 1196));
  data[1196] = crc & 0xff;
  data[1197] = crc >> 8;
  const frames = [data.slice(0, 322), data.slice(322, 834), data.slice(834)];
  return CloudPreset.fromFrames(frames)!;
}

describe("cloud preset", () => {
  it("validates the CRC, round-trips .preset files and bank files", () => {
    const c = makeCloud("Clean", 7);
    expect(c.crcIsValid).toBe(true);
    expect(c.name).toBe("Clean");
    expect(c.bpm).toBe(120);
    expect(c.chain).toEqual([{ type: 1, enabled: true }]);
    expect(CloudPreset.fromFile(c.fileData)!.equals(c)).toBe(true);
    const bank = decodeBank(encodeBank([{ index: 3, name: "Clean", preset: c }]))!;
    expect(bank[0].index).toBe(3);
    expect(bank[0].preset.equals(c)).toBe(true);
    const bad = new Uint8Array(c.data);
    bad[400] ^= 1;
    expect(CloudPreset.fromFrames([bad.slice(0, 322), bad.slice(322, 834), bad.slice(834)])!.crcIsValid).toBe(false);
    expect(decodeBank("{}")).toBeNull();
  });
});

describe("frame", () => {
  it("matches the documented example (payload 15 -> aa 55 01 00 15 8a 5b)", () => {
    expect(frame.hex(frame.encode([0x15]))).toBe("aa 55 01 00 15 8a 5b");
  });

  it("round-trips and detects corruption", () => {
    const f = frame.encode([0x21, 5]);
    expect(frame.decode(f)).toEqual({ payload: Uint8Array.of(0x21, 5), crcOk: true });
    f[4] ^= 1;
    expect(frame.decode(f)?.crcOk).toBe(false);
  });

  it("reassembles frames split across chunks and zero-padded HID reports", () => {
    const a = frame.encode([0x12, 1, 2, 3]);
    const b = frame.encode([0x14, 1]);
    const r = new frame.FrameReassembler();
    const stream = Uint8Array.from([...a, ...b, ...new Array(100).fill(0)]);
    const out = [...r.feed(stream.subarray(0, 3)), ...r.feed(stream.subarray(3, 9)), ...r.feed(stream.subarray(9))];
    expect(out.map((f) => frame.hex(f))).toEqual([frame.hex(a), frame.hex(b)]);
  });
});

describe("models", () => {
  it("labels preset slots", () => {
    expect([1, 2, 4, 5, 80].map(slotLabel)).toEqual(["0A", "0B", "0D", "1A", "19D"]);
  });

  it("encodes names as NUL-padded printable ASCII", () => {
    const n = encodeName("Clean é ☃ tone that is far too long");
    expect(n.length).toBe(20);
    expect(new TextDecoder().decode(n).replace(/\0/g, "")).toBe("Clean   tone that is");
  });

  it("encodes modules little-endian", () => {
    expect(Array.from(encodeModule({ slot: 1, type: 1, words: [1, 0x0102] }))).toEqual([1, 1, 4, 1, 0, 2, 1]);
  });

  it("formats values in the units shown to the user", () => {
    expect(catalog.formatValue(32, "eqGain")).toBe("+0.0 dB");
    expect(catalog.formatValue(0, "off")).toBe("OFF");
    expect(catalog.formatValue(0x8000 | 10, "ms")).toBe("♩ 1/4");
    expect(catalog.formatValue(101 + 2, "rate")).toBe("♩ 1/32");
    expect(catalog.modelLabel(1, 1)).toBe("02 Flex Boost");
  });

  it("builds every catalog type name", () => {
    expect(Object.keys(catalog.MODEL_NAMES).length).toBe(11);
    const total = Object.values(catalog.MODEL_NAMES).reduce((n, m) => n + Object.keys(m).length, 0);
    expect(total).toBe(277);
  });

  it("USB output reports are [len, frame, zero padding] x 1024", () => {
    const f = frame.encode([0x11]);
    const r = hidReport(f);
    expect(r.length).toBe(1024);
    expect(r[0]).toBe(f.length);
    expect(Array.from(r.subarray(1, 1 + f.length))).toEqual(Array.from(f));
  });
});

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** Minimal simulated pedal answering the BLE command set. */
function makePedal(device: PrimeM2Device) {
  let active = 1;
  const state = new Uint8Array(99);
  state[0] = 0x12;
  state[1] = active;
  state[41] = 120;
  const presetPayload = (idx: number) => {
    const out = [0x22, idx, ...encodeName(`P${idx}`)];
    for (let slot = 1; slot <= 20; slot++) {
      if (slot === 1) out.push(...encodeModule({ slot, type: 1, words: [1, 3, 50, 50, 50] }));
      else out.push(slot, 0, 0);
    }
    out.push(0, 0, 0, 0, 0, 0, 0);
    return out;
  };
  const requests: number[][] = [];
  const stored = new Map<number, Uint8Array>();
  const pending = new Map<number, Uint8Array[]>();
  for (let i = 0; i <= 80; i++) stored.set(i, makeCloud(`P${i}`, i).data);
  const reply = (payload: number[]) => device.receive("USB", frame.encode(payload));
  const transport: Transport = {
    kind: "USB",
    async close() {},
    async write(data) {
      const p = Array.from(frame.decode(data)!.payload);
      requests.push(p);
      queueMicrotask(() => {
        switch (p[0]) {
          case 0x01: return reply([0x02, 0x41, 0x01, ...ascii("V1.5.0"), 0]);
          case 0xa9: return reply([0xaa, 0, 0, ...ascii("iPedal1"), 0]);
          case 0x29: {
            const out = [0x2a, p[1], p[2]];
            for (let i = p[1]; i <= p[2]; i++) out.push(...encodeName(`P${i}`));
            return reply(out);
          }
          case 0x11: state[1] = active; return reply(Array.from(state));
          case 0x13: active = p[1]; return reply([0x14, 1]);
          case 0x21: return reply(presetPayload(p[1]));
          case 0x33: return reply([0x34, 120, 0]);
          case 0x91: return reply([0x92, 87, 0]);
          case 0x25: return reply([0x26, 1]);
          case 0x2d: return reply([0x2e, p[1], 1]);
          case 0x35: return reply([0x36, 1]);
          case 0x53: {
            const rec = (empty: number, ms: number, name: string) => [empty, 1, ms & 0xff, (ms >> 8) & 0xff, 0, 0, ...encodeName(name)];
            return reply([0x54, ...rec(0, 3000, "Loop A"), ...rec(1, 0, "")]);
          }
          case 0x4d: return reply([0x4e, 1]);
          case 0x65: {
            const start = p[2] | (p[3] << 8);
            const end = p[4] | (p[5] << 8);
            const out = [0x66];
            for (let i = start; i <= end; i++) out.push(p[1], i & 0xff, i >> 8, 1, 1, ...encodeName(`D${i}`), ...new Array(34).fill(0));
            return reply(out);
          }
          case 0xab: {
            const data = stored.get(p[1])!;
            const n = p[2] | (p[3] << 8);
            if (n === 0) return reply([0xac, 3, 0]);
            const lens = [322, 512, 364];
            const start = lens.slice(0, n - 1).reduce((a, b) => a + b, 0);
            const chunk = data.subarray(start, start + lens[n - 1]);
            return reply([0xac, n, 0, chunk.length & 0xff, chunk.length >> 8, ...chunk]);
          }
          case 0xad: {
            if (p[1] === 0xff) return reply([0xae, 0, 0, 1]);
            const n = p[2] | (p[3] << 8);
            const len = p[4] | (p[5] << 8);
            const list = pending.get(p[1]) ?? [];
            list[n - 1] = Uint8Array.from(p.slice(6, 6 + len));
            pending.set(p[1], list);
            if (n === 3) {
              stored.set(p[1], Uint8Array.from(list.flatMap((f) => Array.from(f))));
              pending.delete(p[1]);
            }
            return reply([0xae, n & 0xff, n >> 8, 1]);
          }
        }
      });
    },
  };
  return { transport, requests };
}

describe("PrimeM2Device session", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("syncs, reads all presets, selects and edits", async () => {
    const device = new PrimeM2Device(() => {});
    const { transport, requests } = makePedal(device);
    device.attach(transport);
    await vi.advanceTimersByTimeAsync(500);

    expect(device.isReady).toBe(true);
    expect(device.firmware).toBe("V1.5.0");
    expect(device.activePresetIndex).toBe(1);
    expect(device.presetNames.get(80)).toBe("P80");
    expect(device.presetCache.size).toBe(80);
    expect(device.battery).toBe(87);
    expect(device.drumNames[0]).toBe("D1");
    expect(device.drumNames[59]).toBe("D60");

    device.selectPreset(5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(device.activePresetIndex).toBe(5);
    expect(device.preset?.name).toBe("P5");
    // USB deaf period: nothing may follow the select reply by < 300 ms.

    const mod = device.preset!.modules[0];
    device.updateModule({ ...mod, words: [1, 3, 99, 50, 50] });
    await vi.advanceTimersByTimeAsync(100);
    const edit = requests.filter((r) => r[0] === 0x25).pop()!;
    expect(edit.slice(0, 4)).toEqual([0x25, 1, 1, 10]);
    expect(requests.some((r) => r[0] === 0x81)).toBe(false);

    device.looperAction(5);
    await vi.advanceTimersByTimeAsync(100);
    expect(requests.filter((r) => r[0] === 0x4d).pop()).toEqual([0x4d, 5]);

    device.readLooperFiles();
    await vi.advanceTimersByTimeAsync(100);
    expect(device.looperFiles.map((f) => [f.empty, f.sync, f.ms, f.name])).toEqual([
      [false, true, 3000, "Loop A"],
      [true, true, 0, ""],
    ]);

    device.setTempo(140);
    await vi.advanceTimersByTimeAsync(100);
    expect(requests.filter((r) => r[0] === 0x35).pop()).toEqual([0x35, 140, 0]);
    device.setTempo(999); // clamped to the 40...260 range
    await vi.advanceTimersByTimeAsync(100);
    expect(requests.filter((r) => r[0] === 0x35).pop()).toEqual([0x35, 4, 1]);

    device.moveModule(1, 2);
    await vi.advanceTimersByTimeAsync(1000);
    const move = requests.filter((r) => r[0] === 0x2d).pop()!;
    expect([move[0], move[2], move[3], move[4]]).toEqual([0x2d, 4, 1, 2]);
    expect(parsePreset(Uint8Array.from([0x22, 1, ...new Array(20).fill(0)]))).toBeNull();
  });

  it("reads, audits and restores whole presets over USB, verifying the write", async () => {
    const device = new PrimeM2Device(() => {});
    const { transport, requests } = makePedal(device);
    device.attach(transport);
    await vi.advanceTimersByTimeAsync(500);

    const run = async <T,>(job: () => Promise<T>) => {
      const promise = device.transfer(job);
      await vi.advanceTimersByTimeAsync(2000);
      return promise;
    };

    const p7 = await run(() => device.readStoredPreset(7));
    expect(p7.name).toBe("P7");
    expect(p7.crcIsValid).toBe(true);

    const custom = makeCloud("Custom", 99);
    await run(() => device.writeStoredPreset(0, custom)); // audition slot
    expect((await run(() => device.readStoredPreset(0))).name).toBe("Custom");
    await run(() => device.endAudition());

    await run(() => device.restoreStoredPreset(9, custom));
    expect((await run(() => device.readStoredPreset(9))).equals(custom)).toBe(true);
    expect((await run(() => device.readStoredPreset(10))).name).toBe("P10"); // neighbours untouched
    expect(requests.some((r) => r[0] === 0x81)).toBe(false);
  });
});
