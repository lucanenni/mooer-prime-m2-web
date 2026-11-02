import { describe, expect, it } from "vitest";
import * as catalog from "../src/protocol/catalog";
import { encodeName, parseLooperFiles, parseNameList } from "../src/protocol/models";
import { LOOP_CONTROL_BYTES, buildWav, fileFrameWrite, isPedalFormat, packPcm24, parseFileFrame, readWav, splitLoopFile, wavControl } from "../src/protocol/loopFile";
import { MIDI_FUNCTIONS, parseMidiTable } from "../src/protocol/models";
import { INPUT_GAIN, SLEEP_OPTIONS, addTap, eqDb, levelDb, panText, tapBpm, tunerHz } from "../src/ui/format";

describe("value formatting", () => {
  it("converts mixer levels (raw / 2 - 30 dB)", () => {
    expect(levelDb(0)).toBe("-30.0 dB");
    expect(levelDb(60)).toBe("0.0 dB");
    expect(levelDb(72)).toBe("+6.0 dB");
  });

  it("converts EQ bands (raw / 2 - 12 dB)", () => {
    expect([0, 24, 48].map(eqDb)).toEqual(["-12.0 dB", "0.0 dB", "+12.0 dB"]);
  });

  it("formats pan around the centre", () => {
    expect([0, 20, 50, 51, 100].map(panText)).toEqual(["L50", "L30", "C", "R1", "R50"]);
  });

  it("has the 22 input gain steps", () => {
    expect(INPUT_GAIN).toHaveLength(22);
    expect(INPUT_GAIN[0]).toBe("−∞");
    expect(INPUT_GAIN[9]).toBe("0 dB");
    expect(INPUT_GAIN[10]).toBe("+0.5 dB");
    expect(INPUT_GAIN[21]).toBe("+6.0 dB");
  });

  it("maps tuner pitch and sleep options", () => {
    expect([0, 10, 15].map(tunerHz)).toEqual([430, 440, 445]);
    expect(SLEEP_OPTIONS[0]).toBe(255);
  });

  it("computes tap tempo from tap times", () => {
    expect(addTap([], 100)).toEqual([100]);
    expect(addTap([0, 500], 1000)).toEqual([0, 500, 1000]);
    expect(addTap([0, 500, 1000], 3500)).toEqual([3500]); // far longer than the others: restart
    expect(addTap([0, 500, 1000], 1200)).toEqual([1200]); // far shorter: restart
    expect(addTap([0, 500, 1000], 4500)).toEqual([4500]); // pause over 3 s
    expect(addTap([0, 500, 1000, 1500, 2000], 2520)).toEqual([500, 1000, 1500, 2000, 2520]);
    expect(tapBpm([0])).toBeUndefined();
    expect(tapBpm([0, 500, 1000])).toBeCloseTo(120);
    expect(tapBpm([1000, 1000])).toBeUndefined();
  });
});

describe("catalog helpers", () => {
  it("round-trips tempo-synced values", () => {
    const delayTime = catalog.param(0x07, 0, 2);
    const modRate = catalog.param(0x06, 0, 0);
    for (const [prm, kind] of [[delayTime, "ms"], [modRate, "rate"]] as const) {
      const value = catalog.syncedValue(kind, 10);
      expect(catalog.syncIndex(prm, value)).toBe(10);
      expect(catalog.syncLabel(10)).toBe("♩ 1/4");
    }
    expect(catalog.syncIndex(delayTime, 500)).toBeNull();
    expect(catalog.syncIndex(modRate, 50)).toBeNull();
  });

  it("gives slider ranges only for values inside the known range", () => {
    const delayTime = catalog.param(0x07, 0, 2);
    expect(catalog.sliderRange(delayTime, 500)).toEqual([40, 2500]);
    expect(catalog.sliderRange(delayTime, 0x8000 | 3)).toBeNull();
    expect(catalog.sliderRange(catalog.param(0x01, 0, 0), 50)).toEqual([0, 100]);
  });

  it("names models and parameters", () => {
    expect(catalog.modelLabel(0x01, 1)).toBe("02 Flex Boost");
    expect(catalog.modelLabel(0x01, 99)).toBe("100");
    expect(catalog.param(0x03, 0, 1).label).toBe("Low Cut");
    expect(catalog.param(0x99, 0, 3).kind).toBe("unknown");
  });
});

describe("list parsers", () => {
  it("parses a named list of 59-byte records", () => {
    const names = ["POP01", "POP02", "POP03"];
    const payload = Uint8Array.from([0x66, ...names.flatMap((n, i) => [7, i + 1, 0, 1, 1, ...encodeName(n), ...new Array(34).fill(0)])]);
    expect(parseNameList(payload)).toEqual({ category: 7, start: 1, names });
    expect(parseNameList(Uint8Array.of(0x66, 7, 1, 0, 3, 0, 1, 2, 3, 4))).toBeNull();
    expect(parseNameList(Uint8Array.of(0x22, 1))).toBeNull();
  });

  it("parses looper file records with or without a small header", () => {
    const rec = (used: number, ms: number, name: string) => [used, 0, ms & 0xff, ms >> 8, 0, 0, ...encodeName(name)];
    const body = [...rec(1, 1500, "Loop"), ...rec(0, 0, "")];
    const plain = parseLooperFiles(Uint8Array.from([0x54, ...body]))!;
    expect(plain.map((f) => [f.empty, f.ms, f.name])).toEqual([[false, 1500, "Loop"], [true, 0, ""]]);
    const withHeader = parseLooperFiles(Uint8Array.from([0x54, 1, 10, ...body]))!;
    expect(withHeader).toHaveLength(2);
    expect(parseLooperFiles(Uint8Array.of(0x54, 1, 2, 3))).toBeNull();
  });
});

describe("loop files", () => {
  it("parses file frames and rejects error replies", () => {
    const data = [1, 2, 3];
    const reply = Uint8Array.from([0x64, 6, 2, 0, 1, 5, 0, 0, 0, 3, 0, 0, 0, data.length, 0, ...data]);
    expect(parseFileFrame(reply)).toEqual({ status: 1, total: 5, index: 3, data: Uint8Array.from(data) });
    expect(parseFileFrame(Uint8Array.of(0x64, 0))).toBeNull();
  });

  it("splits control data and audio and builds a WAV with the control after the data chunk", () => {
    const control = new Uint8Array(LOOP_CONTROL_BYTES).fill(7);
    const audio = new Uint8Array(1200).fill(1);
    const raw = Uint8Array.from([...control, ...audio, ...new Uint8Array(LOOP_CONTROL_BYTES)]);
    const split = splitLoopFile(raw);
    expect(split.control).toEqual(control);
    expect(split.audio).toHaveLength(1200);
    const wav = buildWav(split.audio, split.control);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(1200);
    expect(wav).toHaveLength(44 + 1200 + LOOP_CONTROL_BYTES);
    expect(wav[44 + 1200]).toBe(7);
  });

  it("reads back a WAV built for the pedal, including its control data", () => {
    const audio = new Uint8Array(600).map((_, i) => i % 251);
    const control = new Uint8Array(LOOP_CONTROL_BYTES).fill(5);
    const bytes = buildWav(audio, control);
    const wav = readWav(bytes)!;
    expect(isPedalFormat(wav)).toBe(true);
    expect([wav.dataOffset, wav.dataSize]).toEqual([44, 600]);
    expect(wavControl(bytes, wav)).toEqual(control);
    expect(readWav(Uint8Array.of(1, 2, 3))).toBeNull();
  });

  it("packs float samples into 24-bit stereo", () => {
    const pcm = packPcm24(Float32Array.of(1, -1, 0), Float32Array.of(0, 0.5, -0.5));
    expect(Array.from(pcm.subarray(0, 6))).toEqual([0xff, 0xff, 0x7f, 0, 0, 0]);
    expect(Array.from(pcm.subarray(6, 9))).toEqual([0, 0, 0x80]);
    expect(pcm).toHaveLength(18);
  });

  it("builds upload frames", () => {
    const frame = fileFrameWrite(3, 5, 2, Uint8Array.of(9, 8));
    expect(Array.from(frame)).toEqual([0x61, 6, 3, 0, 5, 0, 0, 0, 2, 0, 0, 0, 2, 0, 9, 8]);
  });
});

describe("MIDI table", () => {
  it("decodes a reply from a real pedal", () => {
    const hex = "b2 01 1a 01 19 01 0a 01 16 01 0b 01 18 00 ff 00 ff 01 0e 00 ff 00 ff 00 ff 00 ff 00 ff 00 ff 00 ff 00 ff 00 ff 00 ff 00 ff";
    const table = parseMidiTable(Uint8Array.from(hex.split(" ").map((h) => parseInt(h, 16))))!;
    expect(table).toHaveLength(MIDI_FUNCTIONS.length);
    expect(table.slice(0, 6).map((a) => a.value)).toEqual([26, 25, 10, 22, 11, 24]);
    expect(table.map((a) => a.assigned).filter(Boolean)).toHaveLength(7);
    expect(table[8]).toEqual({ assigned: true, value: 14 });
    expect(parseMidiTable(Uint8Array.of(0xb2, 1, 2))).toBeNull();
  });
});

import { nearestSync, syncMs } from "../src/protocol/catalog";

describe("tempo-synced delay", () => {
  it("converts note values at the tempo", () => {
    expect(syncMs(10, 120)).toBeCloseTo(500); // 1/4
    expect(syncMs(8, 120)).toBeCloseTo(250); // 1/8
    expect(syncMs(12, 120)).toBeCloseTo(750); // 1/4 dotted
    expect(syncMs(6, 120)).toBeCloseTo(333.3, 0); // 1/4 triplet
    expect(nearestSync(500, 120)).toBe(10);
  });
});

import { dataSection, fileFrameRequest, packCabIr } from "../src/protocol/loopFile";
import { parseSampleList } from "../src/protocol/models";

describe("sample files", () => {
  it("parses the 59-byte slot records", () => {
    const rec = (id: number, name: string, length: number) => {
      const r = new Uint8Array(59);
      r[0] = 3;
      r[1] = id;
      r.set(encodeName(name, 50), 5);
      new DataView(r.buffer).setUint32(55, length, true);
      return r;
    };
    const p = new Uint8Array(1 + 59 * 2);
    p[0] = 0x66;
    p.set(rec(1, "Plexi", 70000), 1);
    p.set(rec(2, "", 0), 60);
    const slots = parseSampleList(p)!;
    expect(slots.map((s) => [s.id, s.name, s.empty, s.length])).toEqual([[1, "Plexi", false, 70000], [2, "", true, 0]]);
  });

  it("addresses the file type in requests and writes", () => {
    expect(Array.from(fileFrameRequest(5, 2, 4).subarray(0, 4))).toEqual([0x63, 4, 5, 0]);
    expect(fileFrameWrite(3, 10, 1, Uint8Array.of(9), 2)[1]).toBe(2);
  });

  it("takes the data after the data chunk header, or the whole file", () => {
    expect(Array.from(dataSection(Uint8Array.of(1, 2, 0x64, 0x61, 0x74, 0x61, 3, 0, 0, 0, 7, 8, 9)))).toEqual([7, 8, 9]);
    expect(Array.from(dataSection(Uint8Array.of(1, 2, 3)))).toEqual([1, 2, 3]);
  });

  it("stores a cab IR as 1024 float32 samples", () => {
    const ir = packCabIr(Float32Array.of(1, -0.5));
    expect(ir.length).toBe(4096);
    expect(new DataView(ir.buffer).getFloat32(4, true)).toBe(-0.5);
  });
});

import { namA2Payload } from "../src/protocol/nam";

describe("NAM A2 captures", () => {
  const capture = (channels: number, weights: unknown) =>
    JSON.stringify({ architecture: "SlimmableContainer", config: { submodels: [{ model: { config: { layers: [{ channels: 8 }] }, weights: [9] } }, { model: { config: { layers: [{ channels }] }, weights } }] } });

  it("takes the weights of the 3-channel model, padded to 2560 floats with the end marker", () => {
    const nam = namA2Payload(capture(3, [0.5, -1]));
    if (!("data" in nam)) throw new Error(nam.error);
    expect(nam.data.length).toBe(2560 * 4);
    const view = new DataView(nam.data.buffer);
    expect([view.getFloat32(0, true), view.getFloat32(4, true), view.getFloat32(8, true)]).toEqual([0.5, -1, 0]);
    expect(Array.from(nam.data.subarray(-4))).toEqual([0xff, 0xaa, 0xbb, 0xcc]);
  });

  it("refuses older captures and bad files", () => {
    expect("error" in namA2Payload(JSON.stringify({ architecture: "WaveNet" }))).toBe(true);
    expect("error" in namA2Payload("nope")).toBe(true);
    expect("error" in namA2Payload(capture(8, [1]))).toBe(true);
  });
});
