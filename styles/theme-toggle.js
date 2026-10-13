/*
 * Pushpin color mode and form factor, settled before first paint.
 *
 * Copied beside pushpin.css by `pushpin init` and linked right after it:
 *   <script src="theme-toggle.js" data-pp-default="light" data-pp-modes="both"
 *           data-pp-form-factor="native"></script>
 *
 * The stylesheet follows the OS through prefers-color-scheme unless <html>
 * carries data-pp-theme, so a prototype that chose light previews dark on a
 * dark-OS machine until something sets the attribute. This sets it from the
 * script tag: `data-pp-modes` is the recorded color mode, and with a single
 * mode the attribute is pinned to it and nothing is rendered. With `both`, the
 * last choice is read from localStorage, `data-pp-default` breaks the tie, and a
 * small pill at bottom-right flips between the two.
 *
 * `data-pp-form-factor` is the same idea for the type ramp, and it is a
 * backfill rather than the primary path: the attribute belongs on <html> in the
 * page's own markup, where it needs no JS and cannot flash. A page whose
 * opening tag missed it would otherwise render the desktop ramp in a phone
 * frame, which is the failure the attribute exists to stop, so this fills it in
 * when <html> carries none and never overrides one that is already there.
 *
 * The pill is a devtool, not part of the design: it carries data-pp-devtool,
 * which is what tells the edit check, the copy audit and the Figma push to leave
 * it out. It is styled from --pp-* tokens only, so it is also correct in either
 * mode. No modules and no dependencies, because it runs in a flat prototype
 * that has neither.
 *
 * Generated. Re-run `init` rather than editing it.
 */
(function () {
  var script = document.currentScript;
  var THEMES = ['light', 'dark'];
  var KEY = 'pp-theme';

  var read = function (name, allowed, fallback) {
    var value = script && script.getAttribute(name);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  };
  var fallback = read('data-pp-default', THEMES, 'light');
  var modes = read('data-pp-modes', ['light', 'dark', 'both'], 'both');

  // `both` names no platform, so it writes nothing and the stylesheet's
  // breakpoint answers — which is what a project that chose both asked for.
  var formFactor = read('data-pp-form-factor', ['native', 'desktop'], null);
  if (formFactor && !document.documentElement.hasAttribute('data-pp-form-factor')) {
    document.documentElement.setAttribute('data-pp-form-factor', formFactor);
  }

  // A single recorded mode outranks both the stored choice and the default: the
  // toggle that wrote the stored value is not rendered here, so honouring it
  // would leave the page in a mode nothing on it can change.
  var stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {
    // Storage can be disabled or full; the default is the answer then.
  }
  var theme =
    modes !== 'both' ? modes : THEMES.indexOf(stored) >= 0 ? stored : fallback;

  var apply = function (next) {
    document.documentElement.dataset.ppTheme = next;
  };
  apply(theme);
  if (modes !== 'both') return;

  var label = function (current) {
    return current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  };

  var style = document.createElement('style');
  style.setAttribute('data-pp-devtool', '');
  style.textContent =
    '.pp-theme-toggle{' +
    'position:fixed;right:var(--pp-space-3);bottom:var(--pp-space-3);z-index:var(--pp-z-modal);' +
    'margin:0;padding:var(--pp-space-2) var(--pp-space-3);' +
    'border:1px solid var(--pp-border-neutral-default);border-radius:var(--pp-radius-sides);' +
    'background:var(--pp-background-neutral-default);color:var(--pp-text-neutral-default);' +
    'box-shadow:var(--pp-shadow-300);' +
    'font-family:var(--pp-font-family);font-size:var(--pp-font-size-body-3);' +
    'line-height:var(--pp-line-height-body-3);font-weight:var(--pp-font-weight-body-3);' +
    'cursor:pointer;-webkit-appearance:none;appearance:none;}' +
    '.pp-theme-toggle:hover{background:var(--pp-background-neutral-strong);}';

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'pp-theme-toggle';
  button.setAttribute('data-pp-devtool', '');
  button.textContent = label(theme);

  button.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    button.textContent = label(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {
      // Not persisted, but the page is already in the mode that was asked for.
    }
  });

  // The attribute is set above, before paint. The pill waits for <body>, since
  // this tag sits in <head> beside the stylesheet.
  var mount = function () {
    document.head.appendChild(style);
    document.body.appendChild(button);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
