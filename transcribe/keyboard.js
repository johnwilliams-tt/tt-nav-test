/* The drawn keyboard types into the field. Shift is one letter's worth, and
   comes on by itself at the start of the field and after a sentence ends, as
   on iOS. Return sends. Keys never take focus, so the field keeps it. */
(function () {
  var keyboard = document.querySelector('.transcribe__keyboard');
  var input = document.querySelector('.transcribe__input');
  var form = document.querySelector('.transcribe__composer');
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

  function autoShift() {
    var before = input.value.slice(0, input.selectionStart);
    setShift(before === '' || /[.!?]\s$/.test(before));
  }

  function insert(text) {
    var start = input.selectionStart;
    input.setRangeText(text, start, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function backspace() {
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
    else if (name === 'return') form.requestSubmit();
    else if (name === 'mode') return;
    else insert(shifted ? name.toUpperCase() : name);
    autoShift();
  });

  input.addEventListener('focus', autoShift);
  input.addEventListener('input', autoShift);
})();
