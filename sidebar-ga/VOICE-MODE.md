# Voice mode (Sidebar GA)

The voice panel in the Sidebar GA prototype: the "Ask AI" bar grows into a dark panel with three glowing waves that follow the microphone. This doc covers what a React Native build needs to match it.

## See it

```sh
python3 -m http.server 8131
```

Open http://localhost:8131/sidebar-ga/ in Chrome or Safari 26+. Then:

1. Tap the **Ask AI** bar at the bottom. It opens into a text field.
2. Tap the round voice button at the field's right end. The panel opens.
3. Allow the microphone and speak. Try **Mute**, then **Stop listening**.

Add `?speed=0.25` to the URL to run every transition at quarter speed. That is the easiest way to study the choreography below.

The waves need WebGPU. Without it the panel opens and works, but no waves are drawn (the console says so). Without microphone permission, the waves run on a simulated speech envelope instead of going still.

## Where the code is

| File | What it holds |
| --- | --- |
| `sidebar-ga/waves.js` | The waves: shader, tuning constants, mic metering, mute, start/stop timing. Self-contained. |
| `sidebar-ga/nav.js` lines 1–130, 262–346 | Opening and closing voice mode, mute toggle, the smoothed-corner clip. |
| `sidebar-ga/app.css` lines 330–350 | Timing tokens and easing curves. |
| `sidebar-ga/app.css` lines 615–691 | The bar's grid; voice mode widens the field to the full row. |
| `sidebar-ga/app.css` lines 840–971 | Panel size, shadow, surface color, waves layer. |
| `sidebar-ga/app.css` lines 1288–1423 | Panel contents: caption and the four buttons. |
| `sidebar-ga/index.html` lines 943–1037 | The bar and panel markup. |
| `inline-beta/waves.js` lines 305–430 | The same shader ported to GLSL. Start here for Skia, not from the WGSL. |

The tuning constants at the top of `inline-beta/waves.js` and `sidebar-ga/waves.js` are identical.

## States

The bar has one state at a time, on `.jobs__tabbar[data-state]`:

| State | What is on screen |
| --- | --- |
| `nav` | Resting pill bar labelled "Ask AI", menu button to its left. |
| `assistant` | Text field across the row, close button to its right, suggested prompts above. |
| `voice` | The dark panel. |
| `returning` | The field collapsing back to `nav`. |

Voice mode is entered from `assistant` (voice button) and leaves back to `assistant` (Stop listening). Mute is a separate on/off flag on the mute button (`aria-pressed`), and resets to unmuted after the panel closes.

## Choreography

All times are from the tap. `start` is 133ms (`--pp-duration-3` / 1.5) and the panel's move is 400ms.

**Opening** (tap the voice button):

| Starts | Lasts | What happens | Curve |
| --- | --- | --- | --- |
| 0ms | 133ms | Field contents and the close button fade out. | ease-in `(0.5, 0, 1, 1)` |
| 133ms | 400ms | Panel grows from 52 to 180 tall, and from field width to 8px from each screen edge. | overshoot `(0.22, 1.5, 0.5, 1)` |
| 133ms | 400ms | Surface fades from white to dark gray; the soft panel shadow fades in. | settle `(0.34, 1, 0.64, 1)` |
| 533ms | 250ms | Waves fade in and rise 24px into place. Wave drawing and mic metering start here. | settle |
| 683ms | 200ms | Caption and buttons fade in. | ease-out `(0, 0, 0.4, 1)` |

**Closing** (Stop listening):

| Starts | Lasts | What happens | Curve |
| --- | --- | --- | --- |
| 0ms | 133ms | Caption and buttons fade out. | ease-in |
| 0ms | 200ms | Waves fade out and drop 24px. Drawing stops at 200ms. | ease-out |
| 133ms | 400ms | Panel shrinks back to the field, on the same overshoot curve. | overshoot |
| 133ms | 400ms | Surface returns to white; the panel shadow hands back to the bar's. | settle |
| 733ms | | Microphone released. | |

The overshoot curve is a cubic-bezier, not a physical spring. In Reanimated, `withTiming(value, { duration: 400, easing: Easing.bezier(0.22, 1.5, 0.5, 1) })` reproduces it exactly. It overshoots about 24px and is meant to read as a second small move, not a wobble.

Two rules the timing depends on:

- Nothing heavy starts while the panel is moving. The first shader draw, the canvas resize and the audio session all wait until 533ms, because any of them stutters the spring on a phone.
- The panel grows empty. Its contents arrive only after the waves are mostly in.

## Panel

- 377 × 180 inside the 393-wide frame: 8px from the left, right and bottom edges.
- Corner radius 54 with 60% Figma corner smoothing, so it is concentric with the phone's own corners. iOS `borderCurve: 'continuous'` is a close match; for an exact one, draw the path. `squircle()` in `nav.js` generates it.
- The radius tracks the height while the panel animates: 26 at 52 tall (exactly the pill), 54 at 180, linear in between.
- Always dark, whatever the app theme.
- Content padding 24. Top row: Expand, right-aligned. Middle: caption, centred. Bottom row: Mute and Type instead on the left, Stop listening on the right.
- Buttons are 40 × 40 pills with 18px glyphs. Mute turns red when muted, with the mic glyph crossfading to mic-off.
- Shadow while open: `0 20 20` at 15% and `0 2 2` at 12%, both gray-950.
- Waves sit in a layer 110 tall across the panel's full width, flush with its bottom.

Colors, as resolved in dark mode (`styles/pushpin.css`):

| Token | Value | Used for |
| --- | --- | --- |
| `--pp-background-neutral-default` | `#1f2022` | Panel surface |
| `--pp-background-neutral-low` | `#2b2d2f` | Mute, Type instead, Expand buttons |
| `--pp-background-brand-strong` | `#36ccfa` | Stop listening button |
| `--pp-background-alert-medium` | `#dc2626` | Mute button while muted |
| `--pp-heading-neutral-default` | `#f5f6f6` | Caption |
| `--pp-icon-neutral-default` | `#f5f6f6` | Glyphs on the gray buttons |
| `--pp-icon-on-brand-strong` | `#1f2022` | Glyph on Stop listening |

Wave colors come from the blue ramp: 300 `#7cdcfd`, 400 `#36ccfa`, 600 `#009fd9`, 700 `#0175a3`, 950 `#07344a`.

## Waves

One full-screen fragment shader draws all of it. Each frame it gets two live numbers: **level** (0–1, how loud) and **phase** (how far the motion has flowed). Everything else is constant.

### Shape

Five layer slots are configured and slots 2 and 4 (counting from 1) are hidden, so three waves draw. The hidden slots still count toward spacing, which puts the three visible waves at evenly spread vertical offsets. Keep five slots with two empty, or recompute the offsets, or the waves will bunch together.

Each wave is a sum of three sine waves under a bell-shaped envelope, so it is flat at both ends and moves most in the middle. It is filled downward to a shared baseline, blurred slightly, and given a soft glow along its crest. Louder input makes the crests taller and adds the two smaller harmonics, which is why speech looks more complex rather than just bigger.

Constants that set the look (`SHAPE` and `LAYERS` in `waves.js`): frequency 1.6, separation 0.14, opacity 0.72, centre at 50% across and 56% down, width 108% of the layer. Each layer has its own blur, glow strength, glow softness and a three-stop color gradient.

### Level

```text
rms      = root mean square of the latest 1024 mic samples
lifted   = max(0, rms - 0.008) * 5.5
target   = 0.2 + 0.8 * min(1, lifted ^ 0.7)
level   += (target - level) * (1 - exp(-dt / tau))
           tau = 0.05s when rising, 0.28s when falling
```

- 0.008 is the noise floor; room noise below it reads as silence.
- 0.2 is the idle level, so a silent room still moves gently.
- The fast attack and slower release make the waves jump on syllables and ease down between them. Getting this wrong is the most visible difference between a port that feels alive and one that looks like a meter.

### Phase

```text
phase += dt * (0.05 + 0.2 * level)
```

The flow speeds up with speech. With Reduce Motion on, the speed is a constant 0.008 instead.

### Mute

Muting does more than silence the input. The waves glide (exponential, 0.35s time constant) to a state where they:

- sit at a level of 0.08, below idle
- flow at half speed
- sit 25% of the layer's height lower
- are blurred by 6px

The mic track is disabled rather than stopped, so the permission and the system's recording indicator stay on.

### No microphone

`simulatedLevel()` produces a fake speech rhythm (phrases, pauses, syllables) from a few sine waves. It runs when the mic is unavailable or denied.

## Porting to React Native

**Waves.** Use [React Native Skia](https://shopify.github.io/react-native-skia/) with a runtime shader (`Skia.RuntimeEffect.Make`). Start from the GLSL in `inline-beta/waves.js`, because SkSL is close to GLSL.

- The layer settings never change, so write them into the shader as constants. Then the only uniforms are size, level, phase, the mute blur, and the centre's vertical offset for the mute drop.
- Skia passes pixel coordinates into `main`, not 0–1 UVs. Divide by the canvas size to get the shader's `uv`. Both have y pointing down.
- Sizes in the shader (blur radius, glow softness) are tuned in points. Pass the size in points, not physical pixels.
- The shader outputs premultiplied color, which is what Skia expects.
- Loops need constant bounds in SkSL. The shader already uses fixed bounds with `break`.
- Drive level and phase from a Reanimated frame callback and feed them to the shader as uniforms, so the JS thread is not involved per frame.

**Microphone level.** You need about 20 RMS readings a second. [`react-native-audio-api`](https://docs.swmansion.com/react-native-audio-api/) implements the Web Audio `AnalyserNode` this code uses, so `micLevel()` ports almost unchanged. A recorder that reports metering in decibels also works: convert with `rms = 10 ^ (dB / 20)` and then apply the same floor, gain and curve.

**Permission.** Ask before the panel opens the first time, not partway through its animation. Start metering at 533ms, and release the audio session after the close finishes.

**Panel motion.** Animate height, horizontal inset and corner radius together from one 0–1 progress value, so the corner always matches the height.

## Not built in the prototype

- No speech recognition. Nothing is transcribed or sent.
- Expand and Type instead do nothing when tapped.
- The caption is static text.
