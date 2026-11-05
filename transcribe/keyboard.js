/* The drawn keyboard types into the field that has focus: the composer's, or
   any other marked data-keyboard-target. Shift is one letter's worth, and
   comes on by itself at the start of the field and after a sentence ends, as
   on iOS. Return is the field's own Enter, which sends. Keys never take
   focus, so the field keeps it. */
(function () {
  var keyboard = document.querySelector('.transcribe__keyboard');
  var fields = [document.querySelector('.transcribe__input')].concat(
    Array.prototype.slice.call(document.querySelectorAll('[data-keyboard-target]'))
  );
  var shiftKey = keyboard.querySelector('[data-key="shift"]');
  var letters = [];
  var shifted = false;

  Array.prototype.slice.call(keyboard.querySelectorAll('[data-keys]')).forEach(function (row) {
    row.dataset.keys.split('').forEach(function (letter) {
      var key = document.createElement('button');
      key.type = 'button';
      key.className = 'transcribe__key';
      key.tabIndex = -1;
      key.dataset.key = letter;
      key.textContent = letter;
      row.appendChild(key);
      letters.push(key);
    });
  });

  function setShift(on) {
    shifted = on;
    shiftKey.setAttribute('aria-pressed', on ? 'true' : 'false');
    letters.forEach(function (key) {
      key.textContent = on ? key.dataset.key.toUpperCase() : key.dataset.key;
    });
  }

  function target() {
    return fields.indexOf(document.activeElement) !== -1 ? document.activeElement : fields[0];
  }

  function autoShift() {
    var input = target();
    var before = input.value.slice(0, input.selectionStart);
    setShift(before === '' || /[.!?]\s$/.test(before));
  }

  function insert(text) {
    var input = target();
    var start = input.selectionStart;
    input.setRangeText(text, start, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function backspace() {
    var input = target();
    var start = input.selectionStart;
    var end = input.selectionEnd;
    if (start === end) {
      if (start === 0) return;
      start -= 1;
    }
    input.setRangeText('', start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  keyboard.addEventListener('pointerdown', function (event) {
    event.preventDefault();
  });

  keyboard.addEventListener('click', function (event) {
    var key = event.target.closest('.transcribe__key');
    if (!key) return;
    var name = key.dataset.key;
    if (name === 'shift') {
      setShift(!shifted);
      return;
    }
    if (name === 'delete') backspace();
    else if (name === 'space') insert(' ');
    else if (name === 'return') {
      target().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    } else if (name === 'mode') return;
    else insert(shifted ? name.toUpperCase() : name);
    autoShift();
  });

  fields.forEach(function (field) {
    field.addEventListener('focus', autoShift);
    field.addEventListener('input', autoShift);
  });
})();
