/* The composer has three states on data-state: none (idle), voice (listening,
   the waveform up) and transcribing (stopped, the words on their way). Idle,
   it is also open (data-open, two rows) while the field has focus or words. */
(function () {
  var screen = document.querySelector('.transcribe');
  var form = screen.querySelector('.transcribe__composer');
  var input = screen.querySelector('.transcribe__input');
  var fresh = screen.querySelector('.transcribe__new');
  var add = screen.querySelector('.transcribe__add');
  var mic = screen.querySelector('.transcribe__mic');
  var send = screen.querySelector('.transcribe__send');
  var field = screen.querySelector('.transcribe__field');
  var body = screen.querySelector('.pp-screen__body');
  var latest = screen.querySelector('.transcribe__latest');
  var agent = screen.querySelector('.transcribe__agent');
  var thread = screen.querySelector('.transcribe__thread');
  var header = screen.querySelector('.transcribe__header');
  var device = screen.closest('.pp-device');
  var root = document.documentElement;

  // "Transcribing" holds at least this long, so it reads as a step rather
  // than a flicker when the recogniser answers at once.
  var TRANSCRIBING_MIN_MS = 1400;
  // The open field grows with its words to this many lines, then scrolls.
  var MAX_LINES = 4;
  var FIELD_MIN = 40;

  var take = 0;

  function state() {
    return form.dataset.state || 'idle';
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms / (window.__ppSpeed || 1));
    });
  }

  function token(name) {
    var raw = getComputedStyle(root).getPropertyValue(name).trim();
    return raw.indexOf('ms') !== -1 ? parseFloat(raw) : parseFloat(raw) * 1000;
  }

  // The grid moves each control to its new cell in one frame; this plays the
  // move back from where it was, on the same timing as the composer's growth.
  function slide(change) {
    var moving = [add, field, mic, send];
    var before = moving.map(function (el) { return el.getBoundingClientRect(); });
    change();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var duration = token('--pp-duration-5');
    var easing = getComputedStyle(root).getPropertyValue('--pp-ease-in-out').trim();
    moving.forEach(function (el, i) {
      var after = el.getBoundingClientRect();
      var dx = before[i].left - after.left;
      var dy = before[i].top - after.top;
      if (!dx && !dy) return;
      el.animate(
        [{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }],
        { duration: duration, easing: easing }
      );
    });
  }

  // Words in the field turn the mic into send; whichever is hidden is inert,
  // so it is out of the tab order and away from screen readers.
  function syncTyped() {
    var typed = state() === 'idle' && input.value.trim() !== '';
    form.toggleAttribute('data-typed', typed);
    mic.inert = typed;
    send.inert = !typed;
  }

  // Measured at the open field's width, so it runs after data-open is set.
  // Collapsed to nothing first, or scrollHeight reports the height it already
  // has rather than the height its words need.
  function sizeField() {
    var line = parseFloat(getComputedStyle(input).lineHeight);
    form.style.setProperty('--transcribe-input', '0px');
    var shown = Math.min(input.scrollHeight, line * MAX_LINES);
    form.style.setProperty('--transcribe-input', shown + 'px');
    form.style.setProperty('--transcribe-field', Math.max(FIELD_MIN, shown) + 'px');
  }

  function syncOpen() {
    var typing = state() === 'idle' && document.activeElement === input;
    var open = typing || (state() === 'idle' && input.value !== '');
    device.toggleAttribute('data-keyboard', typing);
    syncTyped();
    if (open === form.hasAttribute('data-open')) {
      sizeField();
      return;
    }
    slide(function () {
      form.toggleAttribute('data-open', open);
      sizeField();
    });
  }

  function toIdle() {
    delete form.dataset.state;
    add.setAttribute('aria-label', 'Add');
    mic.setAttribute('aria-label', 'Transcribe');
    mic.setAttribute('aria-pressed', 'false');
    mic.disabled = false;
    syncOpen();
  }

  function startVoice() {
    take++;
    slide(function () {
      form.removeAttribute('data-open');
      form.dataset.state = 'voice';
    });
    device.removeAttribute('data-keyboard');
    input.blur();
    add.setAttribute('aria-label', 'Cancel transcription');
    mic.setAttribute('aria-label', 'Stop transcribing');
    mic.setAttribute('aria-pressed', 'true');
    window.transcribeWave.start();
    window.transcribeSpeech.start();
  }

  function stopVoice() {
    var mine = take;
    form.dataset.state = 'transcribing';
    mic.setAttribute('aria-label', 'Transcribe');
    mic.setAttribute('aria-pressed', 'false');
    mic.disabled = true;
    window.transcribeWave.stop();
    Promise.all([window.transcribeSpeech.finish(), wait(TRANSCRIBING_MIN_MS)]).then(function (results) {
      if (mine !== take) return;
      var text = results[0];
      if (text) input.value = input.value ? input.value.replace(/\s*$/, ' ') + text : text;
      toIdle();
      input.scrollTop = input.scrollHeight;
    });
  }

  function cancel() {
    if (state() === 'idle') return;
    take++;
    window.transcribeWave.stop();
    window.transcribeSpeech.cancel();
    toIdle();
  }

  // There is no conversation to post into yet, so sending clears the field
  // and leaves it focused for the next message, the mic back in place.
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (state() !== 'idle' || input.value.trim() === '') return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  input.addEventListener('focus', syncOpen);
  input.addEventListener('blur', syncOpen);
  input.addEventListener('input', syncOpen);

  // Return sends, as the drawn keyboard's does; Shift-Return breaks a line.
  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });

  // A press on a control would otherwise take focus from the field first,
  // closing the composer under the finger before the tap lands.
  function keepFocus(event) {
    if (event.target.closest('button')) event.preventDefault();
  }

  form.addEventListener('pointerdown', keepFocus);
  latest.addEventListener('pointerdown', keepFocus);

  // The conversation opens on its latest message and stays stuck there while
  // the composer and keyboard take room from it, until the pro scrolls up.
  // Only a scroll upward unsticks it: re-sticking only ever scrolls down, and
  // its own scroll events land after the room has shrunk further, so judging
  // them by distance from the bottom would unstick it mid-animation. The
  // down arrow is for when it runs on below the fold.
  var stuck = true;
  var lastTop = 0;

  function below() {
    return body.scrollHeight - body.scrollTop - body.clientHeight;
  }

  // A message is behind the composer when the thread's last line of content
  // runs past the composer area's top edge, wherever the keyboard has put it,
  // and behind the header when its first line runs above the header's foot.
  function syncLatest() {
    latest.hidden = below() < 1;
    var box = thread.getBoundingClientRect();
    var style = getComputedStyle(thread);
    var bottom = box.bottom - parseFloat(style.paddingBottom);
    var top = box.top + parseFloat(style.paddingTop);
    agent.toggleAttribute('data-overlap', bottom > agent.getBoundingClientRect().top + 1);
    header.toggleAttribute('data-overlap', top < header.getBoundingClientRect().bottom - 1);
  }

  function settle() {
    if (stuck) body.scrollTop = body.scrollHeight;
    syncLatest();
  }

  latest.addEventListener('click', function () {
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
  });

  body.addEventListener('scroll', function () {
    if (body.scrollTop < lastTop) stuck = false;
    else if (below() < 1) stuck = true;
    lastTop = body.scrollTop;
    syncLatest();
  }, { passive: true });
  new ResizeObserver(settle).observe(body);
  new MutationObserver(settle).observe(body, { childList: true, subtree: true });

  // The composer area floats over the conversation, so the conversation pads
  // by its height, followed frame by frame as it opens and closes.
  new ResizeObserver(function () {
    screen.style.setProperty('--transcribe-agent', agent.offsetHeight + 'px');
  }).observe(agent);
  agent.addEventListener('transitionend', syncLatest);
  screen.style.setProperty('--transcribe-agent', agent.offsetHeight + 'px');
  settle();
  syncTyped();

  mic.addEventListener('click', function () {
    if (state() === 'idle') startVoice();
    else if (state() === 'voice') stopVoice();
  });

  add.addEventListener('click', cancel);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || screen.hidden) return;
    if (state() === 'idle') input.blur();
    else cancel();
  });

  fresh.addEventListener('click', function () {
    cancel();
    input.value = '';
    input.focus();
  });

  // Where the screen is one page of several, leaving it ends a take and puts
  // the keyboard away.
  new MutationObserver(function () {
    if (!screen.hidden) return;
    cancel();
    input.blur();
  }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
})();
