(function () {
  var shelf = document.querySelector('.jobs__shelf');
  var nav = document.querySelector('.jobs__nav');
  if (!shelf || !nav) return;

  var thumb = nav.querySelector('.jobs__nav-thumb');
  var items = Array.prototype.slice.call(nav.querySelectorAll('.jobs__nav-item'));
  var more = nav.querySelector('.jobs__nav-item--more');
  var menu = document.getElementById('jobs-more-menu');
  var dim = document.querySelector('.jobs__dim');
  var menuItems = Array.prototype.slice.call(menu.querySelectorAll('.jobs__menu-item'));
  var moreIndex = items.indexOf(more);

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var current = items.findIndex(function (item) {
    return item.getAttribute('aria-current') === 'page';
  });
  if (current < 0) current = 0;

  var TRAVEL = 460;
  // Overshoot, which none of the kit's three easings do: the thumb passes the
  // target by a little and settles back.
  var SPRING = 'cubic-bezier(0.34, 1.42, 0.52, 1)';

  var MENU_STEP = 34;
  var MENU_LEAD = 130;
  var MENU_IN = 320;
  var MENU_OUT = 140;
  var GLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)';

  // The CSS half of the motion scales through its duration tokens; these are
  // the timings that live here instead, so they read the same factor. Read at
  // call time so the devtool can change speed between taps.
  function ms(value) {
    return value / (window.__ppSpeed || 1);
  }

  var open = false;
  var stepping = [];

  function boxOf(item) {
    return { x: item.offsetLeft, width: item.offsetWidth };
  }

  // The resting geometry is a share of the bar, not a pixel offset, so the
  // thumb stays over its tab while the shelf is compressing or widening
  // around it. The bar's inner padding is subtracted because the items sit
  // inside it while the thumb is positioned against the padding box.
  var count = items.length;
  var inner = 'calc(100% - 2 * var(--pp-space-1))';
  function place(index) {
    thumb.style.left = 'calc(var(--pp-space-1) + ' + index + ' * ' + inner + ' / ' + count + ')';
    thumb.style.width = 'calc(' + inner + ' / ' + count + ')';
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

  function clearSteps() {
    stepping.forEach(function (animation) {
      animation.cancel();
    });
    stepping = [];
  }

  function openMenu() {
    if (open) return;
    open = true;

    menu.hidden = false;
    // The open height is measured rather than written down, so adding a row to
    // the markup needs no second edit here.
    shelf.style.setProperty('--jobs-shelf-open', menu.offsetHeight + 'px');
    shelf.dataset.state = 'menu';
    if (dim) dim.dataset.state = 'open';
    more.setAttribute('aria-expanded', 'true');

    clearSteps();
    stepping = menuItems.map(function (item, index) {
      return item.animate(
        { opacity: [0, 1], translate: ['0 -6px', '0 0'] },
        {
          duration: reduced.matches ? 1 : ms(MENU_IN),
          // Top to bottom, starting once the panel has most of its height, so
          // a row never fades in above the edge that is still travelling.
          delay: reduced.matches ? 0 : ms(MENU_LEAD + index * MENU_STEP),
          easing: GLIDE,
          fill: 'forwards',
        }
      );
    });
  }

  function closeMenu() {
    if (!open) return;
    open = false;

    shelf.dataset.state = 'tabs';
    if (dim) dim.dataset.state = 'closed';
    more.setAttribute('aria-expanded', 'false');

    clearSteps();
    var out = menuItems.map(function (item) {
      return item.animate(
        { opacity: [1, 0] },
        { duration: reduced.matches ? 1 : ms(MENU_OUT), easing: 'ease-out', fill: 'forwards' }
      );
    });

    // Leaving it in the tree until the fade is done keeps the rows from
    // vanishing a frame before the panel starts closing.
    out[out.length - 1].finished
      .then(function () {
        if (!open) menu.hidden = true;
      })
      .catch(function () {});
  }

  // Only one row can be lit, and selecting a tab anywhere clears the menu's.
  function markRow(row) {
    menuItems.forEach(function (item) {
      item.removeAttribute('aria-current');
    });
    if (row) row.setAttribute('aria-current', 'page');
  }

  items.forEach(function (item, index) {
    item.addEventListener('click', function (event) {
      event.preventDefault();
      if (item === more) {
        if (open) closeMenu();
        else openMenu();
        return;
      }
      markRow(null);
      closeMenu();
      select(index, true);
    });
  });

  menuItems.forEach(function (item) {
    item.addEventListener('click', function () {
      var tab = item.dataset.tab;
      // A row that maps to a tab selects it; everything from Quotes down lives
      // behind More, so More is what stays lit — and the row itself, since the
      // tab bar cannot show which of them is current.
      var index = tab === undefined ? moreIndex : Number(tab);
      markRow(tab === undefined ? item : null);
      // Placed rather than animated: the tab bar is still faded out, so a
      // travelling thumb would do its work where nobody can see it.
      select(index, false);
      closeMenu();
    });
  });

  // Dismissing without choosing leaves the selection alone, so the tab bar
  // comes back to whatever it showed before the menu opened.
  document.addEventListener('click', function (event) {
    if (open && !shelf.contains(event.target)) closeMenu();
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
    closeMenu();
    window.clearTimeout(returning);
    tabbar.dataset.state = 'assistant';
    focusField();
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
    tabbar.dataset.state = 'returning';
    field.blur();
    field.value = '';
    window.clearTimeout(returning);
    returning = window.setTimeout(
      function () {
        if (tabbar.dataset.state === 'returning') tabbar.dataset.state = 'nav';
      },
      reduced.matches ? 0 : token('--jobs-duration-assistant')
    );
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && open) {
      closeMenu();
      more.focus();
    }
  });

  place(current);
  window.addEventListener('resize', function () {
    if (open) shelf.style.setProperty('--jobs-shelf-open', menu.offsetHeight + 'px');
  });
})();
