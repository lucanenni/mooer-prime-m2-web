# Mooer Prime M2 Web

A browser-based editor for the **Mooer Prime M2** multi-effects pedal. It talks to the pedal directly from the page, over **USB (WebHID)** or **Bluetooth LE (Web Bluetooth)**. There is nothing to install and no server: everything runs locally in your browser.

> Unofficial. Not affiliated with or endorsed by Mooer Audio. Use at your own risk, and read [Safety](#safety) first.

## What it does

- Lists all 80 presets and selects them with one click. It follows preset changes made on the pedal. The editor is split in five tabs: **Effects**, **Mixer**, **Looper**, **Settings** and **Backup**.
- Edits the effect chain of a preset:
  - adds, changes, removes and **reorders** effects, with all categories and models;
  - turns effects on and off and edits every parameter with sliders in the right units (dB, Hz, ms, semitones);
  - syncs delay time and modulation rate to the tempo.
- Saves the edited preset under any name to any of the 80 slots.
- **Mixer**: level, on/off and pan of each channel (Instrument, Vocal, Bluetooth, USB), Master level, mono/stereo, L/R link, mute and 3D.
- **Vocal FX** (compressor, EQ, reverb), **Global** settings (CabSim, global EQ, input gain), **Tuner** reference pitch and mute, **Drum** pattern and speed, **Looper** song, volume and basic controls, display brightness and auto shutdown, tempo with tap.
- **Backup and restore** of presets over USB: export one preset or all 80 to a file, import a file, audition it on the pedal without storing it, copy a preset to another slot, and write to a slot with automatic backup of the previous content and read-back verification.
- A raw view of the pedal's system state, useful to explore settings that are not mapped yet.

See [TESTING.md](TESTING.md) for what has been verified on a real pedal and what is still experimental.

## Requirements

- A desktop **Chrome** or **Edge** (or another Chromium browser). WebHID and Web Bluetooth are not available in Safari or Firefox.
- The page must be served over HTTPS or from `localhost`.
- USB is preferred (faster, and required for backup and restore). Close other programs that use the pedal first: only one application can talk to it at a time.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # protocol tests against a simulated pedal
npm run build    # static build in dist/
```

Open the page, plug the pedal in and click **Connect USB** (or **Connect Bluetooth**). Chrome asks you to choose the device the first time.

No pedal at hand? Open the page with `?demo` (for example `http://localhost:5173/?demo`) to try the interface against a simulated pedal. It is only a rough simulation: backup and restore, for instance, are not available in it.

## Safety

- Edits are sent to the pedal immediately. They live in the pedal's edit buffer until you save the preset; selecting another preset discards them.
- Mixer, tuner, drum and other global settings are written to the pedal's system state straight away. The "System state" panel has **Restore original**, which writes back the values read when you connected.
- Writing a whole preset (restore) replaces the slot. The app downloads a backup of the slot first and verifies the result, but keep your own backups of presets you care about.
- Looper upload/download and the MIDI mapping editor are not implemented. Some settings are marked as unverified in [TESTING.md](TESTING.md).

## Project layout

| Path | Contents |
|---|---|
| `src/protocol/` | Frame encoding and CRC, preset and module structs, the effect catalog, whole-preset format and the pedal session (request queue, polling, edits) |
| `src/transport/` | WebHID and Web Bluetooth links |
| `src/ui/` | The page: preset list, effect chain, mixer, settings, backup and the system-state inspector |
| `src/demo/` | The simulated pedal used by `?demo` |
| `docs/PROTOCOL.md` | The protocol and system-state byte map used by the app |
| `test/` | Tests, including a simulated pedal |

## Credits and license

This project is inspired by, and partly derived from, [andymann/mooer-prime-m2-app](https://github.com/andymann/mooer-prime-m2-app) (MIT license), whose documentation of the pedal's protocol and whose catalog of models and parameters made this possible. Parts of the protocol layer here are a TypeScript port of that work.

Released under the [MIT license](LICENSE), which also carries the original copyright notice.
