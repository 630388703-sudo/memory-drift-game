# Landscape pixel artwork

Generated and revised in the project session dated **2026-10-07** using OpenAI image generation. This is the session date, not an asserted exact generation timestamp. These are generated project assets, not extracted Mario artwork.

| Runtime file | Generated source | Size | SHA-256 |
| --- | --- | --- | --- |
| `background.png` | `exec-f81a00a3-43f4-4eae-b410-978b8ac2423f.png` | 1672 × 941, RGB | `a58e39f0d73d5566e868b38be7ae0f8fd81e480cc0d6280adb23532218115803` |
| `atlas.png` | `exec-d885296c-026c-449f-ae2e-4d885fb8a23c.png` | 1774 × 887, RGBA | `1caffd9e86bd3b39cc28d9c69c5c9ae144afd42bf7cbfe4e0781b2e1dd8244c8` |

Source files belong to generated-image session `019ff961-02d0-7523-8e49-4c53a2318d11`. The final atlas revision uses asymmetric dark-brown short hair and a blank, light warm ivory-peach face, with no drawn facial features; orange clothing and cyan backpack remain.

Final edit prompt summary: Only replace all four heads with smaller faceless warm ivory-peach head, asymmetric dark brown short hair; keep orange clothing, cyan backpack, poses and props.

## Atlas and renderer

Four columns × two rows. Indices 0–3: idle, run 1, run 2, jump. Indices 4–7: photo, interference orb, platform tile, glitch hazard.

The renderer rounds cell boundaries, trims within each cell at alpha ≥128, and uses one shared character scale with a bottom-center foot anchor. The four character crops measure **148×318, 203×318, 208×318, 173×280** source pixels. All eight trimmed subjects remain inside their cells; no thresholded content touches a cell edge.

Rendering uses a **480×270 backing canvas**, 960×540 logical coordinates, nearest-neighbor sampling and rounded pixel positions. At the ground baseline, all four character poses anchor at logical **y=430** / native **y=215**. Their ground-position draw heights are 42, 42, 42 and 38 logical pixels; the jump pose retains its bent-leg proportions rather than stretching.

The source images contain more than 65,535 colors. They are generated pixel-style artwork, not strict limited-palette native sprites. The low-resolution game canvas supplies the coarse pixel presentation. The observation image shows the complete background; result images reconstruct only the number of people, while sky and carousel answers remain text records.

## Verification

- Final atlas: 781,183 bytes; alpha range 0–255; **1,029,514 fully transparent pixels**. Asset alpha validation and crop/foot-anchor checks passed for the final hair revision.
- `node --experimental-strip-types --test tests/pixel-world.test.mjs tests/pixel-input.test.mjs`: **23 passed, 0 failed** on 2026-10-07. These unchanged world/input modules were checked before the final artwork-only revision; the tests were not rerun for this document update.
- Foot anchoring above was checked against the renderer's crop/scale/rounding formulas. It is not a claim of physical arcade-controller testing.
