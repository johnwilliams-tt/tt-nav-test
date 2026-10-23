/* Drag to scroll for the sideways rows: the chip filters and the week strip.
   Touch already scrolls them natively; this is for a mouse or trackpad
   click-and-drag, which browsers do not turn into scrolling. */
(function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll('.jobs__filters, .jobs__week'));
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Movement under this is a click on the chip or day beneath the pointer.
  var SLOP = 4;
  // Per-frame decay of the release velocity, for the glide after letting go.
  var FRICTION = 0.92;

  rows.forEach(function (row) {
    var startX = 0;
    var startLeft = 0;
    var dragging = false;
    var dragged = false;
    var lastX = 0;
    var lastTime = 0;
    var velocity = 0;
    var gliding = 0;

    function stopGlide() {
      window.cancelAnimationFrame(gliding);
      gliding = 0;
    }

    // Snap is held off while the pointer owns the row, or it would fight
    // every move; handing it back lets the week strip settle on a day.
    function release() {
      delete row.dataset.dragging;
    }

    function glide() {
      velocity *= FRICTION;
      if (Math.abs(velocity) < 0.05) {
        gliding = 0;
        release();
        return;
      }
      var before = row.scrollLeft;
      row.scrollLeft -= velocity * 16;
      if (row.scrollLeft === before) {
        gliding = 0;
        release();
        return;
      }
      gliding = window.requestAnimationFrame(glide);
    }

    row.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      stopGlide();
      startX = lastX = event.clientX;
      startLeft = row.scrollLeft;
      lastTime = event.timeStamp;
      velocity = 0;
      dragging = true;
      dragged = false;
    });

    row.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var dx = event.clientX - startX;
      if (!dragged) {
        if (Math.abs(dx) < SLOP) return;
        dragged = true;
        row.dataset.dragging = '';
        row.setPointerCapture(event.pointerId);
      }
      row.scrollLeft = startLeft - dx;
      var dt = event.timeStamp - lastTime;
      if (dt > 0) velocity = (event.clientX - lastX) / dt;
      lastX = event.clientX;
      lastTime = event.timeStamp;
    });

    function end(event) {
      if (!dragging) return;
      dragging = false;
      if (!dragged) return;
      if (row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
      // A pause before letting go means the row should stay where it is.
      if (reduced.matches || event.timeStamp - lastTime > 80) {
        release();
        return;
      }
      gliding = window.requestAnimationFrame(glide);
    }

    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);

    // The click that ends a drag lands on whichever chip or day is under the
    // pointer; it is swallowed so dragging never selects.
    row.addEventListener(
      'click',
      function (event) {
        if (!dragged) return;
        dragged = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    // A wheel or trackpad scroll takes over from a glide in progress.
    row.addEventListener(
      'wheel',
      function () {
        if (!gliding) return;
        stopGlide();
        release();
      },
      { passive: true }
    );
  });
})();
