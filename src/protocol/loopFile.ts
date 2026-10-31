// Loop files on the pedal (USB only): file type 6, slots 1...10, transferred in frames of 1000 bytes.
// A stored file is 1000 bytes of control data followed by the audio, 24-bit stereo PCM at 44.1 kHz.

export const LOOP_FILE_TYPE = 6;
export const FILE_READ = 0x63;
export const FILE_READ_REPLY = 0x64;
export const LOOP_CONTROL_BYTES = 1000;
export const LOOP_SAMPLE_RATE = 44100;
const BYTES_PER_FRAME = 6; // 2 channels x 3 bytes

export interface FileFrame {
  /** 0 = the file does not exist. */
  status: number;
  /** Number of frames including the first one, which carries the file name. */
  total: number;
  index: number;
  data: Uint8Array;
}

/** Reply `64 type id(u16) status total(u32) index(u32) length(u16) data`; null for an error reply. */
export function parseFileFrame(p: Uint8Array): FileFrame | null {
  if (p.length < 15 || p[0] !== FILE_READ_REPLY) return null;
  const u32 = (o: number) => (p[o] | (p[o + 1] << 8) | (p[o + 2] << 16) | (p[o + 3] << 24)) >>> 0;
  const length = p[13] | (p[14] << 8);
  if (p.length < 15 + length) return null;
  return { status: p[4], total: u32(5), index: u32(9), data: p.slice(15, 15 + length) };
}

/** Request for frame `index` of loop file `id`. */
export const fileFrameRequest = (id: number, index: number) =>
  Uint8Array.of(FILE_READ, LOOP_FILE_TYPE, id & 0xff, id >> 8, index & 0xff, (index >> 8) & 0xff, (index >> 16) & 0xff, (index >>> 24) & 0xff);

/** Splits the stored file into control data and audio (a trailing block of 1000 zero bytes is padding). */
export function splitLoopFile(raw: Uint8Array): { control: Uint8Array; audio: Uint8Array } {
  const control = raw.slice(0, LOOP_CONTROL_BYTES);
  let audio = raw.slice(LOOP_CONTROL_BYTES);
  if (audio.length > LOOP_CONTROL_BYTES && audio.subarray(audio.length - LOOP_CONTROL_BYTES).every((b) => b === 0)) {
    audio = audio.slice(0, audio.length - LOOP_CONTROL_BYTES);
  }
  return { control, audio: audio.slice(0, audio.length - (audio.length % BYTES_PER_FRAME)) };
}

/** A WAV file with the audio chunk followed by the control data, after the chunk, so a re-import can restore it. */
export function buildWav(audio: Uint8Array, control: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(44 + audio.length + control.length));
  const view = new DataView(out.buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + audio.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true);
  view.setUint32(24, LOOP_SAMPLE_RATE, true);
  view.setUint32(28, LOOP_SAMPLE_RATE * BYTES_PER_FRAME, true);
  view.setUint16(32, BYTES_PER_FRAME, true);
  view.setUint16(34, 24, true);
  text(36, "data");
  view.setUint32(40, audio.length, true);
  out.set(audio, 44);
  out.set(control, 44 + audio.length);
  return out;
}
