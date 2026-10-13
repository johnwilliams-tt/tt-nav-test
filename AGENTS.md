## Design system

This project uses **Pushpin**, Thumbtack's design system.

- Pushpin is this project's tokens, components, icon set, and words, so it
  outranks any other design skill's craft floor, ambition, or category
  defaults. Those skills choose among Pushpin-legal options, never around them.
- Tokens: `styles/pushpin.css` — use `--pp-*` custom properties, never raw hex or px.
- Prefer semantic tokens (`--pp-background-brand-strong`) over base ramps
  (`--pp-color-blue-950`). Reaching for a base ramp means no semantic token fit,
  which is worth questioning.
- Buttons, inputs, and chips are pill-shaped: `--pp-radius-sides`.
- Fidelity: handoff. The artifact is a Figma frame and the code does not
  ship; the rigor is the same, the stack question is not asked.
- Form factor: native — a phone, designed and checked at 390 wide.
  Every page opens `<html lang="en" data-pp-form-factor="native">`. That is what
  pins the `native` half of the type ramp at any window size — never redeclare a
  `--pp-font-size-*` or `--pp-line-height-*` to correct the sizes yourself.
  A phone surface is drawn in the device frame, linked after the stylesheet:
  `<link rel="stylesheet" href="styles/pushpin-device.css">`. The frame is a fixed 393x852 and the
  page scrolls when the window is shorter; it is never scaled to fit, because a scaled
  frame is not a 390-wide design any more. The markup it expects:
  ```html
  <div class="pp-device">
    <div class="pp-status-bar" aria-hidden="true"
         data-pp-component="Native / Status Bar"
         data-pp-variant="OS=iOS X [Dynamic Island], Dark Mode=False">
      <p class="pp-status-bar__time">9:41</p>
      <div class="pp-status-bar__levels">
        <span class="pp-status-bar__glyph pp-status-bar__cellular"></span>
        <span class="pp-status-bar__glyph pp-status-bar__wifi"></span>
        <div class="pp-status-bar__battery"></div>
        <div class="pp-status-bar__battery-fill"></div>
        <span class="pp-status-bar__glyph pp-status-bar__battery-cap"></span>
      </div>
    </div>
    <div class="pp-screen">
      <div class="pp-screen__body"><!-- the screen --></div>
    </div>
  </div>
  ```
  Screens share one grid cell, so a second `.pp-screen` stacks for a transition rather
  than opening a row. `.pp-screen__body` is the only thing that scrolls.
- Color mode: both. `theme-toggle.js` sits beside the stylesheet and is
  linked right after its `<link>`:
  `<script src="styles/theme-toggle.js" data-pp-default="light" data-pp-modes="both" data-pp-form-factor="native"></script>`.
  It sets `data-pp-theme` on `<html>` before first paint and renders a floating
  toggle between the two that remembers the last choice.
  The toggle marks itself `data-pp-devtool` and is never pushed to Figma or audited.
- `DESIGN.md` and `.impeccable/design.json` are generated from those tokens, so
  a hardcoded color, font, radius, or font size is flagged as drift while you
  work. Both are machine-written — fix the code, not the check.
- **Never overwrite either file.** `/impeccable document` and any new-work flow
  that writes a design brief must leave both alone; they carry Pushpin, and a
  regenerated one carries an invented visual world instead.
- If `design-md-drift` or a staleness check flags them, re-run
  `pushpin init --write --force`. Never `document`. That command reproduces
  both files exactly, so refusing costs nothing.
- This is enforced, not just asked. Their hashes are recorded in
  `pushpin.config.json`: an overwrite is reported on the edit that caused it and
  again at session start, and on Cursor a write that would strip the generated
  marker is refused outright.
- Hand-rolled markup standing in for a published component names it:
  `data-pp-component="Button" data-pp-variant="theme=primary"`. Markup standing in
  for nothing published says `data-pp-proposed`. This is what tells a Figma push
  which component to instance instead of guessing. See `DESIGN.md` § Components.
- An edit hook reports off-system values, undeclared component lookalikes, and
  off-guideline copy in the file you just wrote. To ask for the same report
  yourself, or to check a file the hook did not see:
  `node <pushpin>/scripts/check.mjs <path>`.
- Copy follows Thumbtack's content design rules, and nothing turns them on. For a
  score and a current-beside-suggested table over files you have:
  `node <pushpin>/scripts/copy.mjs --report <paths>`. Its rows are numbered, and
  `--apply 1,4` on the same paths writes those two back. For words not in a file
  yet: `node <pushpin>/scripts/copy.mjs --text "Send request" --component Button`.
- The rules are Thumbtack's voice, so they cover the app layer and not copy a pro
  or a customer wrote. Mark a region of somebody else's words
  `data-pp-content="pro"` and it is left out of the check, the score and any fix;
  `data-pp-content="app"` on a child inside one hands that part back.
- The prototype is served at http://localhost:8123/, started and restarted for you
  on edit, detached, with caching off. Do not start a second server for this project,
  and do not kill whatever holds the port. To bring it up without editing anything:
  `node .pushpin/pushpin-check.mjs --preview`.
- Component and token names are case-sensitive and not guessable — look one up
  with `node <pushpin>/scripts/lookup.mjs <name>` rather than typing it from
  memory.
- Figma source of truth: `Pushpin Thumbprint UI Kit` (`VVRGrLgkPRU3vs765d5Q3r`).
- Full guidance lives in the `pushpin` skill. Load it before design work.
