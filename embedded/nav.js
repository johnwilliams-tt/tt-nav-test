(function () {
  var shelf = document.querySelector('.jobs__shelf');
  var nav = document.querySelector('.jobs__nav');
  if (!shelf || !nav) return;

  var thumb = nav.querySelector('.jobs__nav-thumb');
  var items = Array.prototype.slice.call(nav.querySelectorAll('.jobs__nav-item'));
  var more = nav.querySelector('.jobs__nav-item--more');
  var askTab = nav.querySelector('.jobs__nav-item--ask');
  var menu = document.getElementById('jobs-more-menu');
  var dim = document.querySelector('.jobs__dim');
  var menuItems = Array.prototype.slice.call(menu.querySelectorAll('.jobs__menu-item'));
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

  var MENU_STEP = 34;
  var MENU_LEAD = 130;
  var MENU_IN = 320;
  var MENU_OUT = 140;
  var GLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)';

  // The anticipation before the menu opens: the shelf recoils to 80% while
  // the tabs fade, then bounces back to size as the panel grows. SQUASH is
  // the delay app.css puts on the panel's growth (--pp-duration-3); PANEL is
  // the open's pace there, 0.9 of --jobs-duration-panel, so the bounce and
  // the growth settle together. The collapse keeps the full duration.
  var SQUASH = 200;
  var PANEL = 396;
  var SQUASH_SCALE = 0.8;
  var BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  var squash = null;

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
  var inner = 'calc(100% - 2 * var(--jobs-nav-inset))';
  function place(index) {
    thumb.style.left = 'calc(var(--jobs-nav-inset) + ' + index + ' * ' + inner + ' / ' + count + ')';
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

  function showPage(name) {
    if (!name) return;
    pages.forEach(function (page) {
      page.hidden = page.dataset.page !== name;
    });
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

    syncRow();
    menu.hidden = false;
    // The open height is measured rather than written down, so adding a row to
    // the markup needs no second edit here.
    shelf.style.setProperty('--jobs-shelf-open', menu.offsetHeight + 'px');
    shelf.dataset.state = 'menu';
    if (dim) dim.dataset.state = 'open';
    more.setAttribute('aria-expanded', 'true');

    if (squash) squash.cancel();
    if (!reduced.matches) {
      // Two segments on one timeline: an eased-in recoil that bottoms out as
      // the panel's growth begins, then a back-out that overshoots full size
      // a little and settles with the panel's own spring.
      squash = shelf.animate(
        [
          { scale: '1', easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
          { scale: String(SQUASH_SCALE), offset: SQUASH / (SQUASH + PANEL), easing: BOUNCE },
          { scale: '1' },
        ],
        { duration: ms(SQUASH + PANEL) }
      );
    }

    clearSteps();
    stepping = menuItems.map(function (item, index) {
      return item.animate(
        { opacity: [0, 1], translate: ['0 -6px', '0 0'] },
        {
          duration: reduced.matches ? 1 : ms(MENU_IN),
          // Top to bottom, starting once the panel has most of its height, so
          // a row never fades in above the edge that is still travelling.
          delay: reduced.matches ? 0 : ms(SQUASH + MENU_LEAD + index * MENU_STEP),
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

    // A close during the bounce drops the shelf straight back to size; the
    // collapse has no anticipation of its own.
    if (squash) {
      squash.cancel();
      squash = null;
    }

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

  // The menu mirrors the tab bar, so the current tab's row is lit when it
  // opens. With More current, the row that put it there is already marked.
  function syncRow() {
    if (current === moreIndex) return;
    var row = null;
    menuItems.forEach(function (item) {
      if (Number(item.dataset.tab) === current) row = item;
    });
    markRow(row);
  }

  items.forEach(function (item, index) {
    item.addEventListener('click', function (event) {
      event.preventDefault();
      if (item === more) {
        if (open) closeMenu();
        else openMenu();
        return;
      }
      // Ask Tack AI is the assistant, not a page, so the tab that was current
      // stays current underneath it.
      if (item === askTab) {
        openAssistant();
        return;
      }
      markRow(null);
      closeMenu();
      select(index, true);
      showPage(item.dataset.page);
    });
  });

  menuItems.forEach(function (item) {
    item.addEventListener('click', function () {
      // Not a destination: the row opens the assistant, which takes the menu
      // down itself, and the selection stays where it was.
      if (item.dataset.action === 'ask') {
        openAssistant();
        return;
      }
      var tab = item.dataset.tab;
      // A row that maps to a tab selects it; everything from Messages down lives
      // behind More, so More is what stays lit — and the row itself, since the
      // tab bar cannot show which of them is current.
      var index = tab === undefined ? moreIndex : Number(tab);
      markRow(tab === undefined ? item : null);
      // Placed rather than animated: the tab bar is still faded out, so a
      // travelling thumb would do its work where nobody can see it.
      select(index, false);
      showPage(item.dataset.page);
      closeMenu();
    });
  });

  // Dismissing without choosing leaves the selection alone, so the tab bar
  // comes back to whatever it showed before the menu opened.
  document.addEventListener('click', function (event) {
    if (open && !shelf.contains(event.target)) closeMenu();
  });

  // The assistant. The bar's motion is CSS off the bar's state; this flips
  // the state, fits the surface's clip and times the focus.
  var tabbar = document.querySelector('.jobs__tabbar');
  var ask = document.querySelector('.jobs__ask');
  var input = document.querySelector('.jobs__ask-input');
  var closeButton = document.querySelector('.jobs__close');
  var voice = document.querySelector('.jobs__ask-voice');
  var talk = document.querySelector('.jobs__talk');
  var talkClose = talk.querySelector('.jobs__talk-button--close');
  var mute = talk.querySelector('.jobs__talk-button--mic');
  var focusing = 0;

  // The assistant's clock lives in CSS; these read it rather than restate it,
  // and the speed devtool's scaling comes along for free.
  function token(name) {
    var value = getComputedStyle(tabbar).getPropertyValue(name).trim();
    var number = parseFloat(value) || 0;
    // A registered <time> comes back canonicalised in seconds.
    return /[\d.]s$/.test(value) ? number * 1000 : number;
  }

  // The surface's corner, written from the box rather than transitioned,
  // since a transition between two path() values snaps halfway in engines
  // that cannot interpolate them. The radius follows the height — a pill up
  // to the bar's 52, the phone's 54 at the panel's 180 — so the clip is right
  // at every size the box passes through, in whichever direction it is
  // travelling. At 52 square the pill is a circle.
  var surface = ask.querySelector('.jobs__ask-surface');
  // The shadow's caster under the surface, kept in step with it: same clip,
  // same colour scope.
  var shade = ask.querySelector('.jobs__ask-shade-fill');
  var skins = [surface, shade].filter(Boolean);
  var PILL_BOX = { height: 52, radius: 26 };
  var PANEL_BOX = { height: 180, radius: 54 };
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
    var box = ask.getBoundingClientRect();
    var width = box.width;
    var height = box.height;
    var share = Math.min(Math.max((height - PILL_BOX.height) / (PANEL_BOX.height - PILL_BOX.height), 0), 1);
    var radius = PILL_BOX.radius + share * (PANEL_BOX.radius - PILL_BOX.radius);
    var clip = 'path("' + squircle(width, height, radius) + '")';
    skins.forEach(function (skin) {
      skin.style.clipPath = clip;
    });
  }

  if (skins.length && 'ResizeObserver' in window) {
    new ResizeObserver(fitSurface).observe(ask);
    fitSurface();
  }

  // The shelf keeps the bar's 26 at every height. Its size comes from the
  // observer rather than the bounding box, which the squash scales.
  var shelfSurface = shelf.querySelector('.jobs__shelf-surface');
  var shelfSkins = [shelfSurface, shelf.querySelector('.jobs__shelf-shade-fill')].filter(Boolean);
  var SHELF_RADIUS = 26;

  if (shelfSurface && 'ResizeObserver' in window) {
    new ResizeObserver(function (entries) {
      var size = entries[entries.length - 1].contentRect;
      var clip = 'path("' + squircle(size.width, size.height, SHELF_RADIUS) + '")';
      shelfSkins.forEach(function (skin) {
        skin.style.clipPath = clip;
      });
    }).observe(shelfSurface);
  }

  // Lined up with the placeholder's arrival, since the caret rides the same
  // fade as the words it sits beside. From the tabs, the placeholder waits
  // for the shelf to narrow into the bar; from voice, the panel's clearing.
  function focusField(fromVoice) {
    window.clearTimeout(focusing);
    focusing = window.setTimeout(
      function () {
        if (tabbar.dataset.state === 'assistant') input.focus();
      },
      reduced.matches
        ? 0
        : token(fromVoice ? '--jobs-assistant-start' : '--jobs-nav-exit') + 0.7 * token('--jobs-duration-assistant')
    );
  }

  function openAssistant() {
    closeMenu();
    tabbar.dataset.state = 'assistant';
    focusField(false);
  }

  function closeAssistant() {
    if (tabbar.dataset.state !== 'assistant') return;
    window.clearTimeout(focusing);
    input.blur();
    input.value = '';
    delete tabbar.dataset.typed;
    delete tabbar.dataset.cleared;
    voice.setAttribute('aria-label', 'Speak instead');
    tabbar.dataset.state = 'nav';
    // Off the close button, which is leaving, and onto the tab it came from.
    askTab.focus();
  }

  closeButton.addEventListener('click', closeAssistant);

  // The suggestions step aside while the field holds words, and come back if
  // it is emptied; a tapped one becomes those words.
  function syncTyped() {
    if (input.value) {
      tabbar.dataset.typed = '';
    } else if ('typed' in tabbar.dataset) {
      delete tabbar.dataset.typed;
      tabbar.dataset.cleared = '';
    }
    voice.setAttribute('aria-label', input.value ? 'Send message' : 'Speak instead');
  }

  // Nothing is listening, so sending is the field clearing for the next one.
  function send() {
    input.value = '';
    syncTyped();
    input.focus();
  }

  input.addEventListener('input', syncTyped);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && input.value) {
      event.preventDefault();
      send();
    }
  });
  Array.prototype.slice
    .call(document.querySelectorAll('.jobs__prompt:not(.jobs__prompt--refresh)'))
    .forEach(function (prompt) {
      prompt.addEventListener('click', function () {
        input.value = prompt.textContent.trim();
        syncTyped();
        input.focus();
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
  // swap. Scoping the whole bar would recolour the controls that are still
  // fading out.
  function scopeDark(on) {
    skins.forEach(function (skin) {
      if (on) skin.dataset.ppTheme = 'dark';
      else delete skin.dataset.ppTheme;
    });
  }

  function setMuted(muted) {
    mute.setAttribute('aria-pressed', String(muted));
    mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }

  mute.addEventListener('click', function () {
    setMuted(mute.getAttribute('aria-pressed') !== 'true');
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

  var talking = 0;
  voice.addEventListener('click', function () {
    if (input.value) {
      send();
      return;
    }
    window.clearTimeout(talking);
    window.clearTimeout(focusing);
    talk.hidden = false;
    // A just-shown element has no prior style to transition from; the read
    // forces one to be computed before the state flips.
    void talk.offsetHeight;
    input.blur();
    scopeDark(true);
    leaveVoice(false);
    tabbar.dataset.state = 'voice';
  });

  // Back one step, to the bar. The panel's contents fade before it shrinks,
  // and leave the tree once they have; the mute is cleared then, out of
  // sight, so the next session opens live.
  function closeVoice() {
    if (tabbar.dataset.state !== 'voice') return;
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
    focusField(true);
  }

  talkClose.addEventListener('click', closeVoice);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (open) {
      closeMenu();
      more.focus();
    } else if (tabbar.dataset.state === 'voice') {
      closeVoice();
    } else if (tabbar.dataset.state === 'assistant') {
      closeAssistant();
    }
  });

  place(current);
  window.addEventListener('resize', function () {
    if (open) shelf.style.setProperty('--jobs-shelf-open', menu.offsetHeight + 'px');
  });
})();
