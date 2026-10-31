# Verification status

This project talks to a real Mooer Prime M2. Not everything has been checked on hardware yet.

## Verified on a pedal

- USB connection, preset list and selection, live parameter edits, adding / removing / reordering effects.
- Mixer: channel switches and levels, pan, Master (mute, L/R levels, mono/stereo, link, 3D).
- Vocal FX (Comp, EQ, Reverb) and their switches.
- Tuner (reference pitch, mute), Drum (pattern, speed, pattern names), Connection messages (pedal unplugged, pedal busy with another program), Backup (export one or all 80, audition), copy preset to another slot, import and write to a slot (verified write), Tempo (the same value as the drum speed, with Tap), Drum Play/Pause (`47 1` / `47 0`), Looper (songs 1…10, loop export as WAV and import of WAV files, song, volume, file list with a recorded loop, buttons `4d 1…5`: 1 Rec keeps overdubbing until stopped, 5 Play leaves recording and plays, 2 Pause, 3 Undo removes the last rec session's layers in play mode, 4 Clear; the pedal sends no reply), Global (CabSim, EQ, input gain), brightness, auto shutdown, footswitch (`[76]`: 0 off, 1 A = Page Down / B = Page Up), RGB dynamic mode (`[94]`), RGB brightness (`[96]`: 0 soft, 1 bright), RGB colour (`[97]`: 1…9, swatches match the pedal), RGB speed with dynamic off (`[95]`: I, II, III), RGB colour sequence (`[77]`–`[85]`: colours in selection order; the pedal shows the change after leaving and re-entering its colour menu).

## Implemented, still to verify

| Feature | What to check |
|---|---|
| MIDI editor (Settings → MIDI: Learn / Save / Remove, `b3` `b5` `b7`) | Learn one function with an external controller, check that the right row changes (the function number may be off by one), Save, then Remove it |
| MIDI assignments (`b1`, "Read assignments" in Settings) | Compare each function's value with what the official app shows for that function (channel and CC number) |

## Unknown system-state bytes

`[40]`, `[93]`, `[86]`–`[87]`, `[98]`.

## To do

- Samples (Drive, Pre-Amp, Entire Amp, Cab): the pedal transfers them with the same file commands, other file types; not implemented.
