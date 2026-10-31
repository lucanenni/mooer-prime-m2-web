import { describe, expect, it } from "vitest";
import * as catalog from "../src/protocol/catalog";
import { encodeName, parseLooperFiles, parseNameList } from "../src/protocol/models";
import { INPUT_GAIN, SLEEP_OPTIONS, eqDb, levelDb, panText, tapBpm, tunerHz } from "../src/ui/format";

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
