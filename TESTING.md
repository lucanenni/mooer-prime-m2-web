# Verification status

This project talks to a real Mooer Prime M2. Not everything has been checked on hardware yet.

## Verified on a pedal

- USB connection, preset list and selection, live parameter edits, adding / removing / reordering effects.
- Mixer: channel switches and levels, pan, Master (mute, L/R levels, mono/stereo, link, 3D).
- Vocal FX (Comp, EQ, Reverb) and their switches.
- Tuner (reference pitch, mute), Drum (pattern, speed, pattern names), Connection messages (pedal unplugged, pedal busy with another program), Backup (export one or all 80, audition), copy preset to another slot, import and write to a slot (verified write), Tempo (the same value as the drum speed, with Tap), Drum Play/Pause (`47 1` / `47 0`), Looper (songs 1…10, loop export as WAV and import of WAV files, song, volume, file list with a recorded loop, buttons `4d 1…5`: 1 Rec keeps overdubbing until stopped, 5 Play leaves recording and plays, 2 Pause, 3 Undo removes the last rec session's layers in play mode, 4 Clear; the pedal sends no reply), Global (CabSim, EQ, input gain), brightness, auto shutdown, footswitch (`[76]`: 0 off, 1 A = Page Down / B = Page Up), RGB dynamic mode (`[94]`), RGB brightness (`[96]`: 0 soft, 1 bright), RGB colour (`[97]`: 1…9, swatches match the pedal), RGB speed with dynamic off (`[95]`: I, II, III), RGB colour sequence (`[77]`–`[85]`: colours in selection order; the pedal shows the change after leaving and re-entering its colour menu).
- NAM A2 import into an Entire Amp slot (Samples tab).
- Factory reset (Settings → Global). MIDI editor (Learn, Save, Remove) over Bluetooth, with function numbers 1-based; the table value is the CC number. Learn did not answer over USB.

- Offline workspace (Work offline: add effects, edit, saved in the browser) and a preset exported from it, imported on the pedal.
- Samples tab: list, export, import of a NAM into a Pre-Amp slot and of a cab IR, delete (the row disappears); sample names shown in the model menus over USB.
- Using samples in presets: the model word of user slot 1 is 200 (Pre-Amp and Cab). Slots 2…10 and the Drive / Entire Amp slots follow the same pattern.
- Bluetooth name (Settings → Global): the pedal takes a name that starts with `M2`, so the editor always adds the prefix; the new name is advertised after a restart (Chrome may keep showing the old one until the site's Bluetooth permission is removed).
- Delay time ms / note toggle and Mod Rate Free / note toggle.

## Implemented, still to verify

| Feature | What to check |
|---|---|
| MIDI assignments (`b1`, "Read assignments" in Settings) | Compare each function's value with what the official app shows for that function (channel and CC number) |

## Unknown system-state bytes

`[40]`, `[93]`, `[86]`–`[87]`, `[98]` (the official app has no setting for it; the Tempo Sync page is only a tap tempo).

## Automated tests

`npm test` runs the protocol and format tests, and interface tests (`test/ui.test.ts`, jsdom) against the simulated pedal: samples (write, list, names in the model menu, delete), the Bluetooth name prefix and when the page may be redrawn.
