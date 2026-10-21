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

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var current = items.findIndex(function (item) {
    return item.getAttribute('aria-current') === 'page';
  });
  if (current < 0) current = 0;

  var TRAVEL = 460;
  // Overshoot, which none of the kit's three easings do: the thumb passes the
  // target by a little and settles back.
  var SPRING = 'cubic-bezier(0.34, 1.42, 0.52, 1)';

  // The CSS half of the motion scales through its duration tokens; these are
  // the timings that live here instead, so they read the same factor. Read at
  // call time so the devtool can change speed between taps.
  function ms(value) {
    return value / (window.__ppSpeed || 1);
  }

  function boxOf(item) {
    return { x: item.offsetLeft, width: item.offsetWidth };
  }

  // The resting geometry is a share of the bar, not a pixel offset, so the
  // thumb stays over its tab while the shelf is compressing or widening
  // around it. The bar's inner padding is subtracted because the items sit
  // inside it while the thumb is positioned against the padding box. Tabs
  // overlap their neighbours, so each is wider than an even share by its part
  // of the overlaps, and each starts one tab width less the overlap along.
  var count = items.length;
  var inner = 'calc(100% - 2 * var(--jobs-nav-inset))';
  var tab = 'calc((' + inner + ' + ' + (count - 1) + ' * var(--jobs-nav-overlap)) / ' + count + ')';
  function place(index) {
    thumb.style.left = 'calc(var(--jobs-nav-inset) + ' + index + ' * (' + tab + ' - var(--jobs-nav-overlap)))';
    thumb.style.width = tab;
    thumb.style.translate = '0px';
  }

  function select(index, animate) {
    if (index === current) return;
    var from = boxOf(items[current]);
    var to = boxOf(items[index]);

    items[current].removeAttribute('aria-current');
    items[index].setAttribute('aria-current', 'page');
    current = index;

    // Rest on the new tab at once; the travel is played as an offset that
    // decays to zero, so the resting geometry stays proportional throughout.
    place(index);
    if (!animate || reduced.matches) return;

    // The travel is one keyframe pair on one curve. A midpoint keyframe would
    // end its own segment at zero velocity, which is the stall that reads as
    // two motions rather than one.
    thumb.animate({ translate: [from.x - to.x + 'px', '0px'] }, { duration: ms(TRAVEL), easing: SPRING });

    // The squish rides a separate property so it can peak mid-flight without
    // interrupting the travel. Stretching along x and thinning on y reads as
    // the shape being dragged rather than teleported — the liquid part,
    // without refraction. Further travel stretches more.
    var stretch = Math.abs(to.x - from.x) > from.width ? 1.12 : 1.07;
    thumb.animate(
      [
        { scale: '1 1', easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
        { scale: stretch + ' 0.9', offset: 0.4, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        { scale: '1 1' },
      ],
      { duration: ms(TRAVEL) }
    );
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
      select(index, true);
      showPage(item.dataset.page, again ? 'pop' : null);
    });
  });

  // A page from the More list sits under More, so More stays lit, and its
  // back button returns to the list.
  moreRows.forEach(function (row) {
    row.addEventListener('click', function (event) {
      event.preventDefault();
      select(moreIndex, true);
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
      if (settle || tabbar.dataset.state !== 'nav') return;
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

  fab.addEventListener('click', function () {
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
  Array.prototype.slice
    .call(document.querySelectorAll('.jobs__prompt:not(.jobs__prompt--refresh)'))
    .forEach(function (prompt) {
      prompt.addEventListener('click', function () {
        field.value = prompt.textContent.trim();
        syncTyped();
        field.focus();
      });
    });

  // Two sets, and a refresh advances to the next. The glyph turns once while
  // the suggestions drop out; the labels change while they are hidden.
  var prompts = Array.prototype.slice.call(
    document.querySelectorAll('.jobs__prompt:not(.jobs__prompt--refresh)')
  );
  var promptSets = [
    ['Create a quote', 'Start a job', 'Learn about Tack AI'],
    ['Post on social media', 'See pending quotes', 'Send a reminder'],
  ];
  var promptSet = 0;
  var refresh = document.querySelector('.jobs__prompt--refresh');
  var refreshIcon = refresh.querySelector('.jobs__prompt-icon');
  var refreshing = 0;
  refresh.addEventListener('click', function () {
    var pace = window.__ppSpeed || 1;
    if (!reduced.matches) {
      refreshIcon.animate({ rotate: ['0deg', '360deg'] }, { duration: 500 / pace, easing: 'cubic-bezier(0.45, 0, 0.4, 1)' });
    }
    window.clearTimeout(refreshing);
    tabbar.dataset.cleared = '';
    tabbar.dataset.refreshing = '';
    refreshing = window.setTimeout(
      function () {
        promptSet = (promptSet + 1) % promptSets.length;
        prompts.forEach(function (prompt, index) {
          prompt.textContent = promptSets[promptSet][index];
        });
        delete tabbar.dataset.refreshing;
      },
      reduced.matches ? 0 : 200 / pace
    );
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

  // The tabs' return has its own, later delay while the field collapses; the
  // state that carries it is released once the track has finished moving.
  close.addEventListener('click', function () {
    leaveVoice(false);
    // Opened from the docked bar, it closes back to the docked bar. Caught
    // halfway through undocking, it finishes on the full one.
    if (tabbar.dataset.dock !== 'in') clearDock();
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

  // Docking. Scrolling a list down folds the bar into two circles; reaching
  // the top of the list or tapping the left circle unfolds it. Scrolling back
  // up partway leaves it docked.
  var dockButton = shelf.querySelector('.jobs__dock');
  var undocking = 0;
  var tops = new WeakMap();
  var travel = 0;
  // Downward scroll, in px, that docks the bar, so a nudge does not.
  var DOCK_TRAVEL = 24;

  // The tabs keep the undocked shelf's width while it narrows over them: the
  // row less both gutters, the closed field and the gap in front of it, and
  // the margin the shelf carries.
  function sizeNav() {
    var width =
      tabbar.clientWidth -
      token('--jobs-gutter-left') -
      token('--jobs-gutter-right') -
      PILL.height -
      2 * token('--pp-space-2');
    nav.style.setProperty('--jobs-nav-width', width + 'px');
  }

  // From the current tab's icon to the docked circle's centre. The shelf's
  // left and bottom edges hold still while it docks, so this is measured in
  // the nav's own box, untranslated.
  function aimDock() {
    var item = items[current];
    var glyph = item.querySelector('.jobs__nav-glyph');
    var half = token('--jobs-dock') / 2;
    var x = item.offsetLeft + glyph.offsetLeft + glyph.offsetWidth / 2;
    var y = item.offsetTop + glyph.offsetTop + glyph.offsetHeight / 2;
    nav.style.setProperty('--jobs-dock-x', half - x + 'px');
    nav.style.setProperty('--jobs-dock-y', nav.offsetHeight - half - y + 'px');
  }

  function dock() {
    if (tabbar.dataset.dock === 'in' || tabbar.dataset.state !== 'nav') return;
    window.clearTimeout(undocking);
    aimDock();
    tabbar.dataset.dock = 'in';
    nav.inert = true;
  }

  function undock() {
    if (tabbar.dataset.dock !== 'in') return;
    tabbar.dataset.dock = 'out';
    nav.inert = false;
    travel = 0;
    if (document.activeElement === dockButton) items[current].focus({ preventScroll: true });
    window.clearTimeout(undocking);
    undocking = window.setTimeout(
      function () {
        if (tabbar.dataset.dock === 'out') delete tabbar.dataset.dock;
      },
      reduced.matches ? 0 : token('--jobs-duration-dock')
    );
  }

  function clearDock() {
    window.clearTimeout(undocking);
    delete tabbar.dataset.dock;
    nav.inert = false;
    travel = 0;
  }

  dockButton.addEventListener('click', undock);

  // Scroll does not bubble, so the lists are heard in the capture phase; the
  // week strip and the chip rows scroll sideways and are not lists.
  document.addEventListener(
    'scroll',
    function (event) {
      var body = event.target;
      if (!body.classList || !body.classList.contains('jobs__body')) return;
      var top = body.scrollTop;
      var previous = tops.has(body) ? tops.get(body) : top;
      tops.set(body, top);
      if (tabbar.dataset.state !== 'nav') return;
      if (top <= 0) {
        undock();
        travel = 0;
        return;
      }
      if (top > previous) {
        travel += top - previous;
        if (travel >= DOCK_TRAVEL) dock();
      } else {
        travel = 0;
      }
    },
    true
  );

  place(current);
  sizeNav();
  window.addEventListener('resize', function () {
    sizeNav();
  });
})();
