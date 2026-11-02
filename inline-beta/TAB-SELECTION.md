# Tab selection (Inline Beta)

The selected tab in the Inline Beta bottom bar is marked by a gray pill (the thumb) that slides to the tapped tab. While it slides it stretches wide and thin, then settles back to its normal shape, slightly past its target and back. This doc covers what a React Native build needs to match it.

## See it

```sh
python3 -m http.server 8131
```

Open http://localhost:8131/inline-beta/ and tap between the tabs. Compare a tap on the next tab with a jump from Jobs to More: the longer jump stretches further.

Add `?speed=0.25` to the URL to slow the motion to quarter speed.

## Where the code is

| Where | What it holds |
| --- | --- |
| `inline-beta/nav.js`: `select()` | The whole animation: slide, stretch, timings and curves. |
| `inline-beta/nav.js`: `place()` | Where the thumb rests on each tab. |
| `inline-beta/app.css`: `.jobs__nav`, `.jobs__nav-thumb`, `.jobs__nav-item` | Bar, thumb and tab sizing and colors. |
| `inline-beta/index.html`: `.jobs__nav` | Markup: the thumb is one element behind the four tabs. |

## Layout

- One thumb element sits behind the tabs and moves between them. Tabs do not have their own selected background.
- The bar is 56 tall. The thumb is inset 4 from the bar's top, bottom and left, so it is 48 tall, and fully rounded.
- Four tabs (Jobs, Schedule, Marketing, More) fill the bar. Each overlaps the next by 8, which makes each tab, and the thumb, a little wider than a quarter of the bar:

  ```text
  inner     = barWidth - 2 * 4
  tabWidth  = (inner + 3 * 8) / 4
  thumbLeft = 4 + index * (tabWidth - 8)
  ```

Colors:

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--pp-background-neutral-medium` | `#eeeff2` | `#383a3d` | Thumb |
| `--pp-text-neutral-default` | `#1f2022` | `#f5f6f6` | Selected tab's icon and label |
| `--pp-text-neutral-medium` | `#595c61` | `#b9bbbf` | Other tabs |

The tab's icon and label change color over 200ms with ease-out `(0, 0, 0.4, 1)`, starting on tap.

## Motion

Two animations start together on tap and run for the same 460ms. Run them as separate values so the stretch can peak mid-slide without interrupting the slide.

**Slide.** Horizontal position, from the old tab to the new one, in a single move:

| Duration | Curve |
| --- | --- |
| 460ms | `cubic-bezier(0.34, 1.42, 0.52, 1)` |

The curve overshoots: the thumb passes the target slightly and settles back. Don't add a midpoint keyframe. It would stop the thumb for an instant in the middle and read as two moves.

**Stretch.** Width and height scale about the thumb's centre:

| Time | Scale (width × height) | Curve into the next point |
| --- | --- | --- |
| 0ms | 1 × 1 | `cubic-bezier(0.3, 0, 0.5, 1)` |
| 184ms (40%) | `stretch` × 0.9 | `cubic-bezier(0.3, 0, 0.3, 1)` |
| 460ms | 1 × 1 | |

`stretch` is 1.07 when moving to the next tab over, and 1.12 when skipping one or more tabs. The longer jump has to look like more effort.

**Reduce Motion.** No animation. The thumb appears on the new tab at once.

## React Native

Build it with [Reanimated](https://docs.swmansion.com/react-native-reanimated/). Every curve here is a cubic-bezier, and `Easing.bezier` accepts values above 1, so the overshoot comes through exactly. Use a fixed-duration `withTiming`, not `withSpring`, or the timing will drift from the design.

```tsx
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const TRAVEL = 460;
const SLIDE = Easing.bezier(0.34, 1.42, 0.52, 1);
const INTO_STRETCH = Easing.bezier(0.3, 0, 0.5, 1);
const OUT_OF_STRETCH = Easing.bezier(0.3, 0, 0.3, 1);

function useThumb(tabStep: number) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);

  function select(from: number, to: number) {
    const target = to * tabStep;
    if (reduceMotion) {
      x.value = target;
      return;
    }
    const stretch = Math.abs(to - from) > 1 ? 1.12 : 1.07;
    x.value = withTiming(target, { duration: TRAVEL, easing: SLIDE });
    scaleX.value = withSequence(
      withTiming(stretch, { duration: TRAVEL * 0.4, easing: INTO_STRETCH }),
      withTiming(1, { duration: TRAVEL * 0.6, easing: OUT_OF_STRETCH }),
    );
    scaleY.value = withSequence(
      withTiming(0.9, { duration: TRAVEL * 0.4, easing: INTO_STRETCH }),
      withTiming(1, { duration: TRAVEL * 0.6, easing: OUT_OF_STRETCH }),
    );
  }

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));

  return { select, style };
}
```

`tabStep` is `tabWidth - 8` from the layout above. Render the thumb as an absolutely positioned `Animated.View` at `left: 4`, behind the tab buttons.

Scaling in React Native transforms is about the view's centre, matching the prototype. Keep `translateX` first in the array so the scale doesn't change the distance moved.

**Interrupted taps.** `withTiming` starts from the thumb's current position, so tapping a second tab mid-slide redirects the thumb smoothly. The web prototype snaps instead; follow the React Native behavior.

**Navigation.** With React Navigation, draw this as a custom bar through the bottom tab navigator's `tabBar` prop. The default tab bar has no moving indicator to customise.

### Libraries

- **Reanimated** is the only library this needs. Run the animation on the UI thread, as in the sketch, so a busy JS thread doesn't stutter it.
- **[Moti](https://moti.fyi/)** wraps Reanimated with a declarative API. It works, but doesn't do anything here that the sketch doesn't.
- **Native iOS 26 tab bars**, via [`react-native-bottom-tabs`](https://github.com/callstackincubator/react-native-bottom-tabs) or Expo Router's native tabs, get Apple's own Liquid Glass selection animation, which this design imitates. They render the system bar, though, not this layout with the AI button beside it. Use them only if the design moves to the system bar.
