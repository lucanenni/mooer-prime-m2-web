# Prime M2 protocol notes

What this project relies on to talk to a Mooer Prime M2 (firmware V1.5.0). The framing, the preset format and the base command set are documented by the upstream project, [andymann/mooer-prime-m2-app](https://github.com/andymann/mooer-prime-m2-app) (`docs/PROTOCOL.md`); this page summarises them and adds what was verified here.

Status markers: **verified** = checked on a real pedal; *unverified* = implemented from observation or inference, still to be checked (see [TESTING.md](../TESTING.md)).

> Never send command `0x81` to an M2. It belongs to another Mooer model and the upstream project reports that it may zero a preset. This app never sends it.

## 1. Transports

| | USB HID | Bluetooth LE |
|---|---|---|
| Identity | VID `0x34DB`, PID 13 | name `M2Prime M2`, service `FFF0` |
| Host → pedal | output report `[frameLength, frame…]`, zero-padded to 1024 bytes, no report ID | write with response to `FFF3` |
| Pedal → host | input reports of 1024 bytes, zero-padded, starting with the frame | notifications on `FFF2` (split in ≈244-byte pieces) |
| Pushes | none apart from a heartbeat (`9e 01`); poll `11` about once a second | preset and tempo changes are pushed |
| Whole-preset transfer | yes (`ab` / `ad`) | not supported |

After a preset select (`13`), a save (`2f`) and a module add / delete (`2d`), the pedal ignores requests for about 200 ms over USB. This app waits 300 ms.

## 2. Frames

```
aa 55 | len (u16 LE) | payload[len] | CRC-16/GSM (u16 BE)
```

The CRC (poly `0x1021`, init 0, xorout `0xFFFF`, not reflected) covers the length field and the payload. `payload[0]` is the opcode; a reply's opcode is the request's opcode + 1. Only one request is in flight at a time.

## 3. Commands

| Request | Reply | Meaning | Status |
|---|---|---|---|
| `01` | `02` | device info (firmware string) | verified |
| `11` | `12` | read system state (§4) | verified |
| `13 state` | `14 01` | write system state; also selects a preset | verified |
| `21 pp` | `22` | read preset `pp` (1…80) | verified |
| `23 slot` | `24` | read one effect slot | verified |
| `25 slot type n data` | `26 01` | live edit of one slot | verified |
| `29 start end` | `2a` | preset names, 20 bytes each | verified |
| `2d id 01 slot type model` | `2e id ok` | add an effect | verified |
| `2d id 02 slot type model` | `2e id ok` | change an effect | verified |
| `2d id 03 slot` | `2e id ok` | delete an effect (later slots move up) | verified |
| `2d id 04 from to` | `2e id ok` | move an effect: out of `from`, into position `to` | verified |
| `2f pp name[20]` | `30 01` | save the edit buffer to preset `pp` | verified |
| `33 pp` | `34 bpm(u16)` | tempo of preset `pp` | verified |
| `47 state 00 00` | | drum machine play (1) / stop (0); no reply | verified |
| `4d n` | | looper button, `n` = 1 Rec, 2 Pause, 3 Undo, 4 Clear, 5 Play. The pedal sends no reply | verified |
| `53 01 0a` | `54` | looper file list: records of 26 bytes (recorded flag: 1 = has a loop, sync flag, time in ms u32, name[20]) | verified |
| | `69` | pushed by the pedal when a loop changes (observed after a recording: `06 01 00 01 00 <ms u32> <name>`); the app refreshes the file list | observed |
| `65 07 start(u16) end(u16)` | `66` | drum pattern names | *unverified* |
| `63 type id(u16) index(u32)` | `64 type id(u16) status total(u32) index(u32) len(u16) data` | read frame `index` of a stored file (§7); type 6 = loop, ids 1…10 | *unverified* |
| `91` | `92 pct` | battery percentage | verified |
| `a9` | `aa` | serial / id string | verified |
| `ab idx n(u16)` | `ac` | whole-preset read (USB) | verified upstream |
| `ad idx n(u16) len(u16) data` | `ae n(u16) status` | whole-preset write (USB); `idx` 0 = audition slot | verified upstream |
| `b1` | `b2` | MIDI table (layout not decoded) | *unverified* |

Presets are numbered 1…80 (bank × 4 + slot + 1; bank 0A = 1, 0B = 2 …).

## 4. System state (`11` / `12`, `13` / `14`)

A 99-byte payload (opcode included). Writing it back with `13` applies the settings; to change one setting, read it, change the byte and write the whole state back. Indices are payload offsets.

| Byte | Meaning |
|---|---|
| `[1]` | active preset (1…80) |
| `[2]` | CabSim on/off |
| `[3]`…`[6]` | global EQ 100 Hz, 350 Hz, 1800 Hz, 4000 Hz: dB = raw / 2 − 12 (raw 0…48) |
| `[7]` | input gain, 22 steps: −∞, −60, −45, −35, −30, −25, −20, −10, −5, 0, then +0.5 dB steps to +6 |
| `[8]` | auto shutdown in minutes (5, 10, 15, 20, 30), 255 = never |
| `[9]`…`[28]` | pedal name, NUL-padded |
| `[29]` / `[30]` | Bluetooth channel: off flag (1 = off) / level |
| `[31]` / `[32]` | USB channel: off flag / level |
| `[33]` / `[34]` | Instrument channel: off flag / level |
| `[35]` | Master mute (1 = muted) |
| `[36]` | Master L/R link (1 = linked) |
| `[37]` / `[38]` | Master level L / R |
| `[39]` | Master mode: 0 mono, 1 stereo |
| `[40]` | unknown (60 in the dump) |
| `[41]`…`[42]` | tempo = drum speed, u16 LE, 40…260 BPM |
| `[43]` | drum pattern, 0 = first (0…59) |
| `[44]` | tuner reference: Hz = 430 + raw (0…15) |
| `[45]` | tuner mute: 1 = mute, 2 = no mute |
| `[46]` | drum sync with the looper |
| `[47]` | looper volume (0…100) |
| `[48]` | looper song (1…8) |
| `[49]` | global EQ on/off |
| `[51]` / `[52]` | Vocal channel: off flag / level |
| `[53]` | Vocal Comp on/off |
| `[55]` / `[57]` | Vocal Comp level / sensitivity (0…100) |
| `[59]` | Vocal EQ on/off |
| `[61]`, `[63]`, `[65]` | Vocal EQ low / mid / high: dB = raw / 2 − 12 (raw 0…48) |
| `[67]` | Vocal Reverb on/off |
| `[69]`, `[71]`, `[73]` | Vocal Reverb mix / decay / time (0…100) |
| `[75]` | display brightness (5…55) |
| `[76]` | footswitch: 0 off, 1 = A is Page Down and B is Page Up |
| `[77]`…`[85]` | RGB colour sequence: the colour (1…9) at each position in the order they were selected, 0 = empty; removing a colour compacts the list |
| `[88]` | 3D (stereo only), 1 = on |
| `[89]`…`[92]` | pan of Vocal, Bluetooth, USB, Instrument: 0…100, 50 = centre |
| `[94]` | RGB dynamic mode on/off |
| `[96]` | RGB brightness: 0 soft, 1 bright |
| `[95]` | RGB speed with dynamic mode off: 0 I, 1 II, 2 III |
| `[97]` | RGB colour: palette entry 1…9 = #ff6400, #ffdc00, #64ff00, #ff0000, #00ffff, #ffffff, #0064ff, #c800ff, #ff00f3 |

Mixer levels: dB = raw / 2 − 30, raw 0…72 (−30 … +6 dB, 60 = 0 dB). Values that don't fit in one byte are little-endian words; the parameters above only use the low byte except drum speed. Bytes not listed are not mapped (apart from the high bytes of the 16-bit words above); `[93]` is also unmapped (it is not the RGB speed: that has no setting with dynamic mode on).

## 5. Preset, effect slots, catalog

Presets (`22` payload): `pp | name[20] | 20 × slot | 7 bytes`, with a slot being `slot# | type | n | data[n]` and `data` made of little-endian words: enabled, model, then the parameters. Types, models and parameter encodings (dB, Hz, ms, tempo-synced values) are in `src/protocol/catalog.ts`; they follow the upstream catalog.

## 6. Whole-preset format (USB)

1198 bytes in three frames (322 + 512 + 364): the name at 392, the BPM at 390, 20 module records of 36 bytes from 412, and a CRC-16/GSM over bytes 322…1195 stored little-endian at 1196. Writing to `idx` 0 plays the preset without storing it; `ad ff 00 00 00 00` ends the audition. See `src/protocol/cloudPreset.ts`.

## 7. Loop files (USB)

Loop files are file type 6, ids 1…10. Frame 0 of a file carries its name (`len` = name length); frames 1…`total`−1 carry 1000 bytes each (the last may be shorter). A frame the pedal cannot deliver comes back as a 1-byte reply. The concatenated data is 1000 bytes of control data followed by the audio: 24-bit little-endian stereo PCM (L, R interleaved) at 44.1 kHz, optionally followed by 1000 zero bytes of padding.

The exported WAV holds the audio in its `data` chunk and the control data after the chunk, so that a later import can restore it. Writing a file (command `61`, same layout with `62` acknowledgements, a frame at a time) is not implemented.
