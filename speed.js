/* Devtool: ?speed=0.25 runs every transition and animation at a quarter pace
   for inspection. The page's motion lives in duration tokens and in nav.js,
   so this scales the tokens on the root element and publishes the factor for
   nav.js to apply to its own timings. ppSpeed() does the same thing live,
   without a reload. */
(function () {
  var TOKENS = [
    '--pp-duration-1',
    '--pp-duration-2',
    '--pp-duration-3',
    '--pp-duration-4',
    '--pp-duration-5',
    '--pp-duration-6',
    '--jobs-duration-panel',
    '--jobs-duration-assistant',
    '--jobs-prompts-delay',
    '--jobs-duration-prompts',
  ];

  var root = document.documentElement;
  var base = null;

  // An override has to land on the element that declares the token, or the
  // original declaration still wins for its own subtree: the kit's durations
  // are on the root, the screen's are on .jobs.
  function scopeFor(token) {
    return token.indexOf('--jobs-') === 0 ? document.querySelector('.jobs') || root : root;
  }

  function readBase() {
    // Read from the cascade rather than restating the numbers, so the tokens
    // stay the single source of truth.
    base = [];
    TOKENS.forEach(function (token) {
      var scope = scopeFor(token);
      var raw = getComputedStyle(scope).getPropertyValue(token).trim();
      var value = parseFloat(raw);
      if (!raw || isNaN(value)) return;
      base.push({
        token: token,
        scope: scope,
        ms: raw.indexOf('ms') === -1 && raw.indexOf('s') !== -1 ? value * 1000 : value,
      });
    });
  }

  function apply(speed) {
    if (!base) readBase();
    window.__ppSpeed = speed;
    base.forEach(function (entry) {
      if (speed === 1) entry.scope.style.removeProperty(entry.token);
      else entry.scope.style.setProperty(entry.token, Math.round(entry.ms / speed) + 'ms');
    });
    root.dataset.ppSpeed = speed === 1 ? '' : String(speed);
    return speed;
  }

  function parse(value) {
    var speed = parseFloat(value);
    if (isNaN(speed) || speed <= 0) return 1;
    return Math.min(Math.max(speed, 0.05), 5);
  }

  window.ppSpeed = function (value) {
    return apply(parse(value));
  };

  var param = new URLSearchParams(window.location.search).get('speed');
  if (param !== null) apply(parse(param));
  else window.__ppSpeed = 1;
})();
