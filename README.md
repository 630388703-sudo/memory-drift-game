# What Was I Again? / 忘了自己是什么

A non-commercial memory installation game. The current edition is a landscape 2D pixel game: study a photograph, collect its fragments along the route, answer repeated recall questions, then compare your answers with the original.

[Play the current web edition](https://630388703-sudo.github.io/memory-drift-game/)

## Current edition

- 16:9 landscape presentation; a 480 × 270 game canvas scaled without smoothing.
- Brown-haired, faceless traveler; orange clothing and cyan backpack.
- Three recall rounds with 3 / 4 / 5 / Not sure choices. Comments are explicitly fictional, not real player submissions.
- Five photo slots: a sixth replaces the oldest; collisions remove the newest; interference alters a stored photo.
- English on launch; Chinese is available from the header.
- No advertising, payments, lives or game-over punishment.
- Start with a short, optional hands-on practice: move, jump, collect a photo, and protect it. Practice does not carry over into the main game.

## Controls

| Action | Keyboard | Default gamepad input |
| --- | --- | --- |
| Move | Left / Right or A / D | axis 0 or D-pad 14 / 15 |
| Choose in menus | Arrow keys or W / A / S / D | horizontal / vertical stick or D-pad |
| Jump | Z / Space | button 0 |
| Protect a collected photo | Hold X for 0.7 seconds | hold button 1 |
| Confirm | Enter | button 2 |
| Pause / menu | P / Escape | button 3 |
| Compare original at ending | C | button 4 |
| Controls and remapping | H | button 5 |

The installation uses one joystick and **six buttons in two rows of three**. The on-screen function arrangement is:

| Row | Left | Middle | Right |
| --- | --- | --- | --- |
| Upper | Jump | Protect | Confirm |
| Lower | Pause / menu | Compare | Controls / help |

This is a suggested function arrangement, not a claim about the device's raw button numbering. Calibrate each physical button; bindings are saved locally. Recenter the stick between menu choices.

Open **Check controller / remap** to see browser-detected controller status and live button feedback. Select a binding, then press the desired physical button; conflicting assignments swap. Displayed BTN numbers are API indices plus one, **not physical cabinet positions**.

Gamepad detection depends on the device's input mode and the browser. A keyboard-mode controller works only when its output matches the listed keyboard controls; the in-game button remapper does not remap keyboard output. Manufacturer platform lists and a USB connector do not guarantee Gamepad API support. Physical hardware has not been verified. The retained legacy pressure-sensor bridge has not been migrated; see [hardware notes](docs/HARDWARE-INTEGRATION.md).

## Develop and verify

Node 22.13 or later; Node 22 is used in GitHub Actions.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build:static
```

The static output is `gh-pages/`. GitHub Actions builds from source and deploys this directory; old checked-in root bundles are removed so they cannot be mistaken for the current game. Existing optional Sites/Next hosting scaffolding is preserved, but it is not the Pages deployment path.

## Sources and cleanup

- [Artwork provenance](game/assets/pixel/README.md): generated project artwork, not extracted Mario assets.
- [Audio sources](docs/AUDIO-SOURCES.md): Glitch Light by BerryDeep; Impact Thud by Universfield.
- [Cleanup record](docs/PIXEL-RELEASE-20261007.md): removed paths and rollback information.
- [User testing](docs/USER_TEST_PROTOCOL.md): current validation scope and remaining hardware checks.

The previous vertical implementation and obsolete images/styles are removed from the current branch, not erased from Git history. Original hardware/vendor documentation is retained as historical integration material. No claim of physical-device compatibility or pressure-sensor validation is implied by publication.
