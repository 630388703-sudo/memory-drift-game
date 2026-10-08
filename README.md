# What Was I Again? / 忘了自己是什么

A non-commercial memory installation game. The current edition is a landscape 2D pixel game: study a photograph, collect its scattered fragments, answer repeated recall questions, then inspect the parts you kept before revealing the original and comparing it with the story you heard.

[Play the current web edition](https://630388703-sudo.github.io/memory-drift-game/)

## Current edition

- 16:9 landscape presentation; a 480 × 270 game canvas scaled without smoothing.
- Brown-haired, faceless traveler; orange clothing and cyan backpack.
- Three count-only recall rounds with 3 / 4 / 5 / Not sure choices. The first answer is recorded before any scripted suggestions. No carousel-position or sky-color follow-up questions.
- Five fixed, numbered fragment slots represent five complementary vertical strips of the unchanged opening photograph, arranged left to right. Pickups 1–5, 6–10 and 11–15 offer three sets of these strips. A matching pickup fills its empty position or repairs that position if obscured; a duplicate of a clear fragment does nothing and does not refresh its collection time. It never displaces another fragment. A/B/C in storage marks the pickup stage, not a different source or truth value.
- Collisions remove the newest retained fragment. Interference obscures the oldest fragment that is still clear; empty or fully obscured collections do not gain invented pieces. Collecting preserves visible parts for the final review; protection blocks one hit or signal so those parts remain available. Title, practice, pickup feedback, HUD and pause help explain this purpose without adding a new key or recall question.
- English on launch; Chinese is available from the header.
- No advertising, payments, lives or game-over punishment.
- Start with a short, optional hands-on practice: move, jump, collect a fragment, and protect it. Practice does not carry over into the main game.
- Twelve small route objects: ticket stubs, pinwheels, cassette radios, mailboxes and paper boats. They mark sections without adding collection goals; nearby movement briefly animates pinwheels and radio displays.
- Amber photo frames, coral hazards, pink interference and mint protection cues share their silhouettes with the pause guide. The blue background and original character assets are unchanged.
- Two named fictional characters, Lin and Rowan, respond to each other rather than supplying unrelated comments. Their second exchange accurately quotes the visitor's second answer: five strengthens agreement; four challenges it; three introduces doubt; Not sure is not counted as agreement. No live player messages or group statistics are used.
- Two five-person prints repeat the fictional account against the same blue sky. They are never the original evidence. Both conversation areas are safe to stop in, with nearby hazards and the spring moved outside them. Practice still has its own signal-blocking lesson.
- The ending first reviews the actual retained fragments in their fixed positions. Missing and obscured strips remain unavailable: there is no original-image tab or Compare shortcut at this stage. Confirm explicitly reveals the original; only then are Original, Fragments and Your count available. After revealing, hold C (or the bound Compare button) to see the original temporarily and release to return. Obscured fragments never invent a fifth person. An empty collection can still finish and reveal the original through the same review step.
- The ending preserves all three answers and traces the conversations displayed during this visit. Reviewing or revealing adds no fourth count question and does not change a recorded answer. The game does not assert why an answer changed or diagnose a false memory. Local result snapshots use `memory-drift.pixel-record.v4`; they are not shared player statistics.
- Hard collisions use short layered impacts and a dedicated music duck; collection and successful protection retain different timbres. Actual exhibition speakers still need listening calibration.

## Controls

| Action | Keyboard | Default gamepad input |
| --- | --- | --- |
| Move | Left / Right or A / D | axis 0 or D-pad 14 / 15 |
| Choose in menus | Arrow keys or W / A / S / D | horizontal / vertical stick or D-pad |
| Jump | Z / Space | button 0 |
| Protect collected fragments | Hold X for 0.7 seconds | hold button 1 |
| Confirm | Enter | button 2 |
| Pause / menu | P / Escape | button 3 |
| Compare original after revealing it | Hold C | hold button 4 |
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
- [Audio sources](docs/AUDIO-SOURCES.md): PYNCHON by James Gargette (cinameng); Impact Sounds and Digital Audio by Kenney. CC0 sources, prepared loop, alternating short impacts and memory-signal interruptions. Earlier Pixabay sources remain documented for rollback.
- [Language voice](docs/LANGUAGE-VOICE.md): Chinese and English are authored independently, with the same gameplay facts and English retained as the default language.
- [Shared recall design](docs/SHARED-RECALL-DESIGN.md): teacher feedback, branching conversation, evidence boundaries and research references.
- [Cleanup record](docs/PIXEL-RELEASE-20261007.md): removed paths and rollback information.
- [User testing](docs/USER_TEST_PROTOCOL.md): current validation scope and remaining hardware checks.

The previous vertical implementation and obsolete images/styles are removed from the current branch, not erased from Git history. Original hardware/vendor documentation is retained as historical integration material. No claim of physical-device compatibility or pressure-sensor validation is implied by publication.
