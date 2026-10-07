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

## Controls

| Action | Keyboard | Default gamepad input |
| --- | --- | --- |
| Move / choose an answer | Left / Right or A / D | axis 0 or D-pad 14 / 15 |
| Jump | Z / Space | button 0 |
| Protect a collected photo | Hold X for 0.7 seconds | hold button 1 |
| Confirm | Enter | button 2 |
| Pause | P / Escape | button 3 |
| Compare original at ending | C | button 4 |
| Controls and remapping | H | button 5 |

Displayed BTN 1–6 correspond to API indices 0–5, not guaranteed physical cabinet positions. Use Controls to bind the six physical buttons. Physical arcade hardware has not been verified. The retained legacy pressure-sensor bridge has not been migrated; see [hardware notes](docs/HARDWARE-INTEGRATION.md).

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
