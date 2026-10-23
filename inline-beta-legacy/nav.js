(function () {
  var shelf = document.querySelector('.jobs__shelf');
  var nav = document.querySelector('.jobs__nav');
  if (!shelf || !nav) return;

  var thumb = nav.querySelector('.jobs__nav-thumb');
  var items = Array.prototype.slice.call(nav.querySelectorAll('.jobs__nav-item'));
  var more = nav.querySelector('.jobs__nav-item--more');
  var moreRows = Array.prototype.slice.call(document.querySelectorAll('.jobs__more-item'));
  var moreIndex = items.indexOf(more);
  var pages = Array.prototype.slice.call(document.querySelectorAll('.jobs__page'));
  var assistantPage = document.querySelector('.jobs__page[data-page="assistant"]');
  var assistantBack = assistantPage.querySelector('.jobs__back');

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var current = items.findIndex(function (item) {
    return item.getAttribute('aria-current') === 'page';
  });
  if (current < 0) current = 0;

  // The CSS half of the motion scales through its duration tokens; these are
  // the timings that live here instead, so they read the same factor. Read at
  // call time so the devtool can change speed between taps.
  function ms(value) {
    return value / (window.__ppSpeed || 1);
  }

  // The geometry is a share of the bar, not a pixel offset, so the thumb
  // stays over its tab at any width. The bar's inner padding is subtracted
  // because the items sit inside it while the thumb is positioned against
  // the padding box. Tabs
  // overlap their neighbours, so each is wider than an even share by its part
  // of the overlaps, and each starts one tab width less the overlap along.
  var count = items.length;
  var inner = 'calc(100% - 2 * var(--jobs-nav-inset))';
  var tab = 'calc((' + inner + ' + ' + (count - 1) + ' * var(--jobs-nav-overlap)) / ' + count + ')';
  function place(index) {
    thumb.style.left = 'calc(var(--jobs-nav-inset) + ' + index + ' * (' + tab + ' - var(--jobs-nav-overlap)))';
    thumb.style.width = tab;
  }

  function select(index) {
    if (index === current) return;
    items[current].removeAttribute('aria-current');
    items[index].setAttribute('aria-current', 'page');
    current = index;
    place(index);
  }

  // A child page pushes in from the right over its parent, as an iOS
  // navigation stack does, and pops back off the same way. The parent drifts
  // under it by a third of its width and dims, which is what makes the two
  // read as stacked rather than side by side.
  var PUSH = 450;
  var PUSH_EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)';
  var PARENT_SHIFT = '-30%';
  var PARENT_DIM = 'brightness(0.92)';
  var settle = null;

  function pageNamed(name) {
    return pages.find(function (page) {
      return page.dataset.page === name;
    });
  }

  function shownPage() {
    return pages.find(function (page) {
      return !page.hidden;
    });
  }

  // how is 'push' for a child arriving, 'pop' for going back to its parent,
  // or nothing for a switch between tabs, which iOS does not animate.
  function showPage(name, how) {
    if (settle) settle();
    var to = pageNamed(name);
    var from = shownPage();
    if (!to || to === from) return;
    if (to === assistantPage) openAssistant();
    else if (from === assistantPage) closeAssistant();
    if (!how || !from || reduced.matches) {
      pages.forEach(function (page) {
        page.hidden = page !== to;
      });
      return;
    }

    to.hidden = false;
    var push = how === 'push';
    var top = push ? to : from;
    var under = push ? from : to;
    top.dataset.moving = 'over';
    var timing = { duration: ms(PUSH), easing: PUSH_EASE, fill: 'forwards' };
    var off = ['100% 0', '0 0'];
    var shifted = ['0 0', PARENT_SHIFT + ' 0'];
    var dimmed = ['brightness(1)', PARENT_DIM];
    if (!push) {
      off.reverse();
      shifted.reverse();
      dimmed.reverse();
    }
    var moves = [
      top.animate({ translate: off }, timing),
      under.animate({ translate: shifted, filter: dimmed }, timing),
    ];

    // Run once, whether the move finishes or a new one cuts it short.
    var done = false;
    settle = function () {
      if (done) return;
      done = true;
      settle = null;
      from.hidden = true;
      delete top.dataset.moving;
      moves.forEach(function (move) {
        move.cancel();
      });
    };
    moves[0].finished.then(settle).catch(function () {});
  }

  // Tapping the tab you are already under, from one of its child pages, pops
  // back to the tab's own page; tapping another tab switches straight to it.
  items.forEach(function (item, index) {
    item.addEventListener('click', function (event) {
      event.preventDefault();
      var again = index === current;
      select(index);
      showPage(item.dataset.page, again ? 'pop' : null);
    });
  });

  // A page from the More list sits under More, so More stays lit, and its
  // back button returns to the list.
  moreRows.forEach(function (row) {
    row.addEventListener('click', function (event) {
      event.preventDefault();
      select(moreIndex);
      showPage(row.dataset.page, 'push');
    });
  });

  Array.prototype.slice.call(document.querySelectorAll('.jobs__back')).forEach(function (back) {
    back.addEventListener('click', function () {
      showPage(back.dataset.back, 'pop');
    });
  });

  // Swiping in from the left edge of a child page drags it back off its
  // parent, as on iOS. The page follows the finger; letting go past
  // SWIPE_COMMIT of the width, or with a flick, finishes the pop, and short of
  // that it springs back. The edge is a strip of its own rather than the whole
  // page, so the page's sideways rows keep their own scrolling.
  var SWIPE_COMMIT = 0.4;
  var SWIPE_FLICK = 0.5;
  var SWIPE_START = 6;
  var screen = document.querySelector('.jobs');

  function lean(top, under, progress) {
    top.style.translate = progress * 100 + '% 0';
    under.style.translate = 'calc(' + PARENT_SHIFT + ' * ' + (1 - progress) + ') 0';
    under.style.filter = 'brightness(' + (0.92 + 0.08 * progress) + ')';
  }

  function unlean(top, under) {
    [top, under].forEach(function (page) {
      page.style.translate = '';
      page.style.filter = '';
    });
  }

  Array.prototype.slice.call(document.querySelectorAll('.jobs__back')).forEach(function (back) {
    var page = back.closest('.jobs__page');
    var edge = document.createElement('div');
    edge.className = 'jobs__edge';
    edge.setAttribute('aria-hidden', 'true');
    page.appendChild(edge);

    var swipe = null;

    edge.addEventListener('pointerdown', function (event) {
      if (settle || tabbar.dataset.state === 'voice') return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      swipe = {
        x: event.clientX,
        y: event.clientY,
        width: screen.clientWidth,
        parent: pageNamed(back.dataset.back),
        started: false,
        progress: 0,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
      };
      edge.setPointerCapture(event.pointerId);
    });

    edge.addEventListener('pointermove', function (event) {
      if (!swipe) return;
      var dx = event.clientX - swipe.x;
      if (!swipe.started) {
        if (Math.abs(event.clientY - swipe.y) > Math.abs(dx) + SWIPE_START) {
          swipe = null;
          return;
        }
        if (dx < SWIPE_START) return;
        swipe.started = true;
        swipe.parent.hidden = false;
        page.dataset.moving = 'over';
      }
      swipe.progress = Math.min(Math.max(dx / swipe.width, 0), 1);
      lean(page, swipe.parent, swipe.progress);
      var dt = event.timeStamp - swipe.lastTime;
      if (dt > 0) swipe.velocity = (event.clientX - swipe.lastX) / dt;
      swipe.lastX = event.clientX;
      swipe.lastTime = event.timeStamp;
    });

    function release(event) {
      var ended = swipe;
      swipe = null;
      if (!ended || !ended.started) return;
      var parent = ended.parent;
      var commit =
        event.type !== 'pointercancel' &&
        (ended.progress > SWIPE_COMMIT || ended.velocity > SWIPE_FLICK);
      var target = commit ? 1 : 0;
      if (commit && page === assistantPage) closeAssistant();
      var duration = reduced.matches ? 1 : Math.max(ms(PUSH) * Math.abs(target - ended.progress), 120);
      var timing = { duration: duration, easing: PUSH_EASE, fill: 'forwards' };
      var moves = [
        page.animate({ translate: [page.style.translate, target * 100 + '% 0'] }, timing),
        parent.animate(
          {
            translate: [parent.style.translate, 'calc(' + PARENT_SHIFT + ' * ' + (1 - target) + ') 0'],
            filter: [parent.style.filter, 'brightness(' + (0.92 + 0.08 * target) + ')'],
          },
          timing
        ),
      ];
      var done = false;
      settle = function () {
        if (done) return;
        done = true;
        settle = null;
        if (commit) page.hidden = true;
        else parent.hidden = true;
        delete page.dataset.moving;
        unlean(page, parent);
        moves.forEach(function (move) {
          move.cancel();
        });
      };
      moves[0].finished.then(settle).catch(function () {});
    }

    edge.addEventListener('pointerup', release);
    edge.addEventListener('pointercancel', release);
  });

  // A page opened from inside a tab's page stays under that tab.
  Array.prototype.slice.call(document.querySelectorAll('[data-goto]')).forEach(function (link) {
    link.addEventListener('click', function () {
      showPage(link.dataset.goto, 'push');
    });
  });

  // Segmented controls: one panel per segment, arrow keys move between them.
  Array.prototype.slice.call(document.querySelectorAll('[role="tablist"]')).forEach(function (list) {
    var segments = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function choose(chosen) {
      segments.forEach(function (segment) {
        var on = segment === chosen;
        segment.setAttribute('aria-selected', String(on));
        segment.tabIndex = on ? 0 : -1;
        document.getElementById(segment.getAttribute('aria-controls')).hidden = !on;
      });
    }
    segments.forEach(function (segment, index) {
      segment.addEventListener('click', function () {
        choose(segment);
      });
      segment.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        var next = segments[(index + step + segments.length) % segments.length];
        choose(next);
        next.focus();
      });
    });
  });

  var tabbar = document.querySelector('.jobs__tabbar');
  var fab = document.querySelector('.jobs__fab');
  var fieldBox = document.querySelector('.jobs__field');
  var field = document.querySelector('.jobs__input');
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

  var talking = 0;

  // The surface's corner, written from the box rather than transitioned,
  // since a transition between two path() values snaps halfway in engines
  // that cannot interpolate them. The radius follows the height — the pill's
  // 28 at 56px high, the phone's 54 at 180 — so the clip is right at every
  // size the box passes through, in whichever direction it is travelling.
  var surface = fieldBox.querySelector('.jobs__surface');
  // The shadow's caster under the surface, kept in step with it: same clip,
  // same colour scope.
  var shade = fieldBox.querySelector('.jobs__shade-fill');
  var skins = [surface, shade].filter(Boolean);
  var PILL = { height: 56, radius: 28 };
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

  // The assistant is a page of its own, pushed over whichever page is showing
  // and popped back to it. While it is up the bar is its composer: the tabs
  // and the fab give way to the open field at once. The bar's transitions are
  // finished on the spot rather than played, since they remain for voice
  // mode's way in and out.
  function snapBar(state) {
    tabbar.dataset.state = state;
    tabbar.getAnimations({ subtree: true }).forEach(function (animation) {
      if (animation instanceof CSSTransition) animation.finish();
    });
  }

  function openAssistant() {
    snapBar('assistant');
    field.focus({ preventScroll: true });
  }

  // Leaving from voice mode takes the panel down with the page, and the mute
  // is cleared so the next session opens live.
  function closeAssistant() {
    window.clearTimeout(talking);
    leaveVoice(false);
    scopeDark(false);
    talk.hidden = true;
    setMuted(false);
    field.blur();
    field.value = '';
    syncTyped();
    snapBar('nav');
  }

  fab.addEventListener('click', function () {
    assistantBack.dataset.back = shownPage().dataset.page;
    showPage('assistant', 'push');
  });

  // The voice button turns into send for as long as there is something to
  // send.
  function syncTyped() {
    if (field.value) tabbar.dataset.typed = '';
    else delete tabbar.dataset.typed;
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

  place(current);
})();
