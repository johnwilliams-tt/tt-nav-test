(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var tabbar = document.querySelector('.jobs__tabbar');
  var fab = document.querySelector('.jobs__fab');
  var fieldBox = document.querySelector('.jobs__field');
  var field = document.querySelector('.jobs__input');
  var close = document.querySelector('.jobs__close');
  var voice = document.querySelector('.jobs__voice');
  var talk = document.querySelector('.jobs__talk');
  var talkClose = talk.querySelector('.jobs__talk-button--close');
  var mute = talk.querySelector('.jobs__talk-button--mic');

  function setMuted(muted) {
    mute.setAttribute('aria-pressed', String(muted));
    mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }

  mute.addEventListener('click', function () {
    setMuted(mute.getAttribute('aria-pressed') !== 'true');
  });

  // The assistant's clock lives in CSS; these read it rather than restate it,
  // and the speed devtool's scaling comes along for free.
  function token(name) {
    var value = getComputedStyle(tabbar).getPropertyValue(name).trim();
    var number = parseFloat(value) || 0;
    // A registered <time> comes back canonicalised in seconds.
    return /[\d.]s$/.test(value) ? number * 1000 : number;
  }

  var returning = 0;
  var talking = 0;

  // The surface's corner, written from the box rather than transitioned,
  // since a transition between two path() values snaps halfway in engines
  // that cannot interpolate them. The radius follows the height — the pill's
  // 26 at 52px high, the phone's 54 at 180 — so the clip is right at every
  // size the box passes through, in whichever direction it is travelling.
  var surface = fieldBox.querySelector('.jobs__surface');
  // The shadow's caster under the surface, kept in step with it: same clip,
  // same colour scope.
  var shade = fieldBox.querySelector('.jobs__shade-fill');
  var skins = [surface, shade].filter(Boolean);
  var PILL = { height: 52, radius: 26 };
  var PANEL = { height: 180, radius: 54 };
  var SMOOTHING = 0.6;

  function rad(deg) {
    return (deg * Math.PI) / 180;
  }

  function n(value) {
    return String(Math.round(value * 100) / 100);
  }

  // Figma's corner smoothing: a cubic eases out of each edge into a shorter
  // arc than a plain radius would draw. At a radius of half the height the
  // cubics shrink to nothing and the arcs meet, which is exactly the pill.
  function squircle(width, height, radius) {
    var limit = Math.min(width, height) / 2;
    var r = Math.min(radius, limit);
    var p = Math.min((1 + SMOOTHING) * r, limit);
    var beta;
    var alpha;
    if (r <= limit / 2) {
      beta = 90 * (1 - SMOOTHING);
      alpha = 45 * SMOOTHING;
    } else {
      var k = (r - limit / 2) / (limit / 2);
      beta = 90 * (1 - SMOOTHING * (1 - k));
      alpha = 45 * SMOOTHING * (1 - k);
    }
    var theta = (90 - beta) / 2;
    var p34 = r * Math.tan(rad(theta / 2));
    var c = p34 * Math.cos(rad(alpha));
    var d = c * Math.tan(rad(alpha));
    var arc = Math.sin(rad(beta / 2)) * r * Math.SQRT2;
    var b = (p - arc - c - d) / 3;
    var a = 2 * b;
    var A = n(a), AB = n(a + b), ABC = n(a + b + c), BC = n(b + c), C = n(c), D = n(d), R = n(r), ARC = n(arc);
    return (
      'M ' + n(width - p) + ' 0 ' +
      'c ' + A + ' 0 ' + AB + ' 0 ' + ABC + ' ' + D + ' ' +
      'a ' + R + ' ' + R + ' 0 0 1 ' + ARC + ' ' + ARC + ' ' +
      'c ' + D + ' ' + C + ' ' + D + ' ' + BC + ' ' + D + ' ' + ABC + ' ' +
      'L ' + n(width) + ' ' + n(height - p) + ' ' +
      'c 0 ' + A + ' 0 ' + AB + ' -' + D + ' ' + ABC + ' ' +
      'a ' + R + ' ' + R + ' 0 0 1 -' + ARC + ' ' + ARC + ' ' +
      'c -' + C + ' ' + D + ' -' + BC + ' ' + D + ' -' + ABC + ' ' + D + ' ' +
      'L ' + n(p) + ' ' + n(height) + ' ' +
      'c -' + A + ' 0 -' + AB + ' 0 -' + ABC + ' -' + D + ' ' +
      'a ' + R + ' ' + R + ' 0 0 1 -' + ARC + ' -' + ARC + ' ' +
      'c -' + D + ' -' + C + ' -' + D + ' -' + BC + ' -' + D + ' -' + ABC + ' ' +
      'L 0 ' + n(p) + ' ' +
      'c 0 -' + A + ' 0 -' + AB + ' ' + D + ' -' + ABC + ' ' +
      'a ' + R + ' ' + R + ' 0 0 1 ' + ARC + ' -' + ARC + ' ' +
      'c ' + C + ' -' + D + ' ' + BC + ' -' + D + ' ' + ABC + ' -' + D + ' Z'
    );
  }

  function fitSurface() {
    var box = fieldBox.getBoundingClientRect();
    var width = box.width;
    var height = box.height;
    var share = Math.min(Math.max((height - PILL.height) / (PANEL.height - PILL.height), 0), 1);
    var radius = PILL.radius + share * (PANEL.radius - PILL.radius);
    var clip = 'path("' + squircle(width, height, radius) + '")';
    skins.forEach(function (skin) {
      skin.style.clipPath = clip;
    });
  }

  if (skins.length && 'ResizeObserver' in window) {
    new ResizeObserver(fitSurface).observe(fieldBox);
    fitSurface();
  }

  // Lined up with the placeholder's arrival, since the caret rides the same
  // fade as the words it sits beside.
  function focusField() {
    window.setTimeout(
      function () {
        if (tabbar.dataset.state === 'assistant') field.focus();
      },
      reduced.matches ? 0 : token('--jobs-assistant-start') + 0.7 * token('--jobs-duration-assistant')
    );
  }

  fab.addEventListener('click', function () {
    stopHint();
    fillPrompts();
    window.clearTimeout(returning);
    tabbar.dataset.state = 'assistant';
    focusField();
  });

  // The suggestions step aside while the field holds words, and come back if
  // it is emptied; a tapped one becomes those words. The voice button turns
  // into send for as long as there is something to send.
  function syncTyped() {
    if (field.value) {
      tabbar.dataset.typed = '';
    } else if ('typed' in tabbar.dataset) {
      delete tabbar.dataset.typed;
      tabbar.dataset.cleared = '';
    }
    voice.setAttribute('aria-label', field.value ? 'Send message' : 'Speak instead');
  }

  // Nothing is listening, so sending is the field clearing for the next one.
  function send() {
    field.value = '';
    syncTyped();
    field.focus();
  }

  field.addEventListener('input', syncTyped);
  field.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && field.value) {
      event.preventDefault();
      send();
    }
  });
  // Each page's suggestions, listed top to bottom, so the last sits nearest
  // the field. Searching is offered everywhere; a page with nothing of its own
  // gets only that.
  var SEARCH = 'Search for anything';
  var PROMPTS = {
    jobs: ['Create a job', SEARCH],
    schedule: ['See next appointment', 'Schedule an appointment', SEARCH],
    'get-paid': ['Create an invoice', 'Create a quote', SEARCH],
    marketing: ['Post on social media', SEARCH],
    customers: ['Create a customer', SEARCH],
  };
  var promptGroup = document.querySelector('.jobs__prompts');

  function fillPrompts() {
    var page = document.querySelector('.jobs__page:not([hidden])');
    var labels = PROMPTS[page && page.dataset.page] || [SEARCH];
    promptGroup.replaceChildren.apply(
      promptGroup,
      labels.map(function (label) {
        var prompt = document.createElement('button');
        prompt.type = 'button';
        prompt.className = 'pp-title-6 jobs__prompt';
        prompt.dataset.ppComponent = 'Button';
        prompt.dataset.ppVariant = 'theme=tertiary, size=small';
        prompt.textContent = label;
        return prompt;
      })
    );
    // Just-added buttons have no prior style to transition from; the read
    // computes their hidden one before the assistant state flips.
    void promptGroup.offsetHeight;
  }

  promptGroup.addEventListener('click', function (event) {
    var prompt = event.target.closest('.jobs__prompt');
    if (!prompt) return;
    field.value = prompt.textContent;
    syncTyped();
    field.focus();
  });

  // At rest the bar's label opens on Ask Theo, then cycles every page's
  // suggestions, each once however many pages offer it, with searching last;
  // Ask Theo is not part of the loop. Each is held a while and faded into the
  // next. The swap waits out the fade's own duration, read from the
  // cascade, so the text only ever changes while it is invisible.
  var hint = document.querySelector('.jobs__hint');
  var HINT_HOLD = 3000;
  var hints = ['Ask Theo'];
  Object.keys(PROMPTS).forEach(function (page) {
    PROMPTS[page].forEach(function (label) {
      if (label !== SEARCH && hints.indexOf(label) < 0) hints.push(label);
    });
  });
  hints.push(SEARCH);
  var hintIndex = 0;
  var hintTimer = 0;

  function fadeMs() {
    return parseFloat(getComputedStyle(hint).transitionDuration) * 1000 || 0;
  }

  function holdHint() {
    window.clearTimeout(hintTimer);
    if (reduced.matches) return;
    hintTimer = window.setTimeout(function () {
      if (tabbar.dataset.state !== 'nav') {
        holdHint();
        return;
      }
      hint.dataset.fading = '';
      hintTimer = window.setTimeout(function () {
        hintIndex = hintIndex + 1 < hints.length ? hintIndex + 1 : 1;
        hint.textContent = hints[hintIndex];
        delete hint.dataset.fading;
        holdHint();
      }, fadeMs());
    }, HINT_HOLD / (window.__ppSpeed || 1));
  }

  function stopHint() {
    window.clearTimeout(hintTimer);
  }

  // Back to Ask Theo, out of sight, for when the bar comes home.
  function resetHint() {
    stopHint();
    delete hint.dataset.fading;
    hintIndex = 0;
    hint.textContent = hints[0];
    holdHint();
  }

  holdHint();

  // Voice mode. The panel is always dark, whatever the app's theme. Its
  // contents carry the dark scope in the markup; only the surface and its
  // shadow caster are re-scoped here, and their colour transition carries the
  // swap. Scoping the whole field would recolour the controls that are still
  // fading out.
  function scopeDark(on) {
    skins.forEach(function (skin) {
      if (on) skin.dataset.ppTheme = 'dark';
      else delete skin.dataset.ppTheme;
    });
  }

  voice.addEventListener('click', function () {
    if (field.value) {
      send();
      return;
    }
    window.clearTimeout(talking);
    talk.hidden = false;
    // A just-shown element has no prior style to transition from; the read
    // forces one to be computed before the state flips.
    void talk.offsetHeight;
    field.blur();
    scopeDark(true);
    leaveVoice(false);
    tabbar.dataset.state = 'voice';
  });

  // The return's spring is tied to a mark that lasts as long as the panel is
  // shrinking, so the assistant's own curves are back in place for whatever
  // comes next.
  var leaving = 0;
  function leaveVoice(on) {
    window.clearTimeout(leaving);
    if (!on) {
      delete tabbar.dataset.from;
      return;
    }
    tabbar.dataset.from = 'voice';
    leaving = window.setTimeout(
      function () {
        delete tabbar.dataset.from;
      },
      reduced.matches ? 0 : token('--jobs-assistant-start') + token('--jobs-duration-assistant')
    );
  }

  // Back one step, to the field. The panel's contents fade before it shrinks,
  // and leave the tree once they have; the mute is cleared then, out of
  // sight, so the next session opens live.
  talkClose.addEventListener('click', function () {
    leaveVoice(true);
    tabbar.dataset.state = 'assistant';
    scopeDark(false);
    window.clearTimeout(talking);
    talking = window.setTimeout(
      function () {
        if (tabbar.dataset.state !== 'voice') {
          talk.hidden = true;
          setMuted(false);
        }
      },
      reduced.matches ? 0 : token('--jobs-assistant-start')
    );
    focusField();
  });

  // The way back is held in its own state while the field collapses, and
  // released to rest once the track has finished moving.
  close.addEventListener('click', function () {
    leaveVoice(false);
    resetHint();
    tabbar.dataset.state = 'returning';
    field.blur();
    field.value = '';
    delete tabbar.dataset.typed;
    delete tabbar.dataset.cleared;
    voice.setAttribute('aria-label', 'Speak instead');
    window.clearTimeout(returning);
    returning = window.setTimeout(
      function () {
        if (tabbar.dataset.state === 'returning') tabbar.dataset.state = 'nav';
      },
      reduced.matches ? 0 : token('--jobs-duration-assistant')
    );
  });

  // The side menu. The screen slides right to uncover it, from the menu
  // button or from a horizontal drag. The slide is one number, the CSS's
  // --side-progress: the open and closed states set it and transition it,
  // and a drag writes it directly with the transition off.
  var device = document.querySelector('.pp-device');
  var screen = document.querySelector('.pp-screen.jobs');
  var sideMenu = document.getElementById('side-menu');
  var cover = document.querySelector('.side-cover');
  var menuButton = document.querySelector('.jobs__menu-button');
  var sideRows = Array.prototype.slice.call(sideMenu.querySelectorAll('.side-menu__item'));
  var pages = Array.prototype.slice.call(document.querySelectorAll('.jobs__page'));

  // Travel before a press commits to being a drag or is left as a tap or a
  // scroll, and the release speed, in px/ms, that counts as a flick: a flick
  // goes the way it was thrown however short it was.
  var SLOP = 8;
  var FLICK = 0.4;
  var FLICK_WINDOW = 100;

  function isOpen() {
    return device.dataset.side === 'open';
  }

  // The screen is inert while it is pushed aside, so focus and taps stay in
  // the menu; the cover over it is outside it and takes the closing tap.
  function setSide(open) {
    device.dataset.side = open ? 'open' : 'closed';
    sideMenu.inert = !open;
    screen.inert = open;
    menuButton.setAttribute('aria-expanded', String(open));
  }

  function openSide() {
    setSide(true);
    var row = sideMenu.querySelector('[aria-current="page"]') || sideRows[0];
    row.focus({ preventScroll: true });
  }

  function closeSide() {
    setSide(false);
    menuButton.focus({ preventScroll: true });
  }

  menuButton.addEventListener('click', openSide);
  cover.addEventListener('click', closeSide);

  sideRows.forEach(function (row) {
    row.addEventListener('click', function () {
      // A row with no page behind it yet opens nothing.
      if (!row.dataset.page) return;
      sideRows.forEach(function (other) {
        other.removeAttribute('aria-current');
      });
      row.setAttribute('aria-current', 'page');
      pages.forEach(function (page) {
        page.hidden = page.dataset.page !== row.dataset.page;
      });
      // A new section starts the bar's label over from Ask Theo.
      resetHint();
      closeSide();
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) closeSide();
  });

  // A press inside a row that scrolls sideways belongs to the row.
  function scrollsSideways(element) {
    for (; element && element !== screen; element = element.parentElement) {
      var overflow = getComputedStyle(element).overflowX;
      if ((overflow === 'auto' || overflow === 'scroll') && element.scrollWidth > element.clientWidth) return true;
    }
    return false;
  }

  var drag = null;
  var dragged = false;

  device.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    var from = isOpen() ? 1 : 0;
    if (from === 0) {
      // From the resting screen only: with the assistant open the bar owns
      // the screen's foot, and the field owns its own drags.
      if (!screen.contains(event.target) || tabbar.dataset.state !== 'nav') return;
      if (event.target.closest('input') || scrollsSideways(event.target)) return;
    } else if (!cover.contains(event.target) && !sideMenu.contains(event.target)) {
      return;
    }
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: from,
      progress: from,
      active: false,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    };
  });

  device.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Only a mostly horizontal move the way the menu can go becomes a drag;
      // anything else is left to the scroll or the tap it started as.
      var toward = drag.from === 0 ? dx > 0 : dx < 0;
      if (Math.abs(dx) <= Math.abs(dy) || !toward) {
        drag = null;
        return;
      }
      drag.active = true;
      device.setAttribute('data-side-dragging', '');
      device.setPointerCapture(drag.id);
    }
    event.preventDefault();
    drag.progress = Math.min(Math.max(drag.from + dx / sideMenu.offsetWidth, 0), 1);
    device.style.setProperty('--side-progress', String(drag.progress));
    drag.samples.push({ x: event.clientX, t: event.timeStamp });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > FLICK_WINDOW) drag.samples.shift();
  });

  // Dropping the inline progress and the dragging mark together lets the
  // transition carry the screen from where the finger left it.
  function release(event, cancelled) {
    if (!drag || event.pointerId !== drag.id) return;
    var ended = drag;
    drag = null;
    if (!ended.active) return;
    var first = ended.samples[0];
    var last = ended.samples[ended.samples.length - 1];
    var velocity = (last.x - first.x) / Math.max(last.t - first.t, 1);
    var open;
    if (cancelled) open = ended.from === 1;
    else if (Math.abs(velocity) > FLICK) open = velocity > 0;
    else open = ended.progress >= 0.5;
    device.removeAttribute('data-side-dragging');
    device.style.removeProperty('--side-progress');
    dragged = true;
    if (open === isOpen()) setSide(open);
    else if (open) openSide();
    else closeSide();
  }

  device.addEventListener('pointerup', function (event) {
    release(event, false);
  });
  device.addEventListener('pointercancel', function (event) {
    release(event, true);
  });

  // The click a drag ends on is not a tap on whatever is under the finger.
  device.addEventListener(
    'click',
    function (event) {
      if (!dragged) return;
      dragged = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true
  );
  device.addEventListener(
    'pointerdown',
    function () {
      dragged = false;
    },
    true
  );

  setSide(false);
})();
