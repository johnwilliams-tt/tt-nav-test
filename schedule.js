/* Schedule: the week strip and the month in its header. Days are written
   from today's date, so the strip is live rather than pinned to a date in
   the frame. It opens on the current week; the today button scrolls today
   into the first position and selects it. Shared by every nav concept. */
(function () {
  var strip = document.querySelector('.jobs__week');
  var title = document.getElementById('page-schedule-title');
  var todayButton = document.querySelector('.jobs__action--today');
  if (!strip || !title) return;

  // The frame abbreviates the month AP-style: "Sept 2026", not "Sep".
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEKS_BACK = 8;
  var WEEKS_AHEAD = 16;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  var first = new Date(weekStart);
  first.setDate(weekStart.getDate() - 7 * WEEKS_BACK);
  var count = 7 * (WEEKS_BACK + WEEKS_AHEAD + 1);

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function key(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function span(className, text) {
    var node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  }

  var days = [];
  var cells = [];
  var todayIndex = 0;
  var weekIndex = 0;
  for (var i = 0; i < count; i++) {
    var date = new Date(first);
    date.setDate(first.getDate() + i);
    days.push(date);

    var cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'jobs__day';
    cell.dataset.date = key(date);
    cell.setAttribute('aria-pressed', 'false');
    cell.setAttribute(
      'aria-label',
      date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    );
    if (date.getTime() === today.getTime()) {
      cell.setAttribute('aria-current', 'date');
      todayIndex = i;
    }
    if (date.getTime() === weekStart.getTime()) weekIndex = i;

    cell.appendChild(span('pp-body-4 jobs__day-name', DAYS[date.getDay()]));
    cell.appendChild(span('pp-title-8 jobs__day-num', String(date.getDate())));
    var dot = span('jobs__day-dot', '');
    dot.setAttribute('aria-hidden', 'true');
    cell.appendChild(dot);

    strip.appendChild(cell);
    cells.push(cell);
  }

  var selected = null;
  function select(index) {
    if (selected) selected.setAttribute('aria-pressed', 'false');
    selected = cells[index];
    selected.setAttribute('aria-pressed', 'true');
  }

  cells.forEach(function (cell, index) {
    cell.addEventListener('click', function () {
      select(index);
    });
  });

  // The header reads the month of whichever day is at the left edge.
  function leftOf(index) {
    return cells[index].offsetLeft - cells[0].offsetLeft;
  }

  function firstVisible() {
    var pitch = leftOf(1) || 1;
    return Math.min(cells.length - 1, Math.max(0, Math.round(strip.scrollLeft / pitch)));
  }

  function setTitle(date) {
    title.textContent = MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  function scrollTo(index, animate) {
    strip.scrollTo({ left: leftOf(index), behavior: animate && !reduced.matches ? 'smooth' : 'auto' });
  }

  // A hidden page has no layout, so its scroll offset is lost each time the
  // page is left and nothing can be measured until it is back. The strip is
  // placed when it first has a width, and put back where it was on return.
  var placed = false;
  var lastLeft = 0;
  function place() {
    if (!strip.clientWidth) return;
    if (!placed) {
      placed = true;
      lastLeft = leftOf(weekIndex);
    }
    strip.scrollLeft = lastLeft;
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(place).observe(strip);
  }
  place();

  var ticking = false;
  strip.addEventListener('scroll', function () {
    lastLeft = strip.scrollLeft;
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      setTitle(days[firstVisible()]);
    });
  });

  if (todayButton) {
    todayButton.addEventListener('click', function () {
      select(todayIndex);
      scrollTo(todayIndex, true);
    });
  }

  select(todayIndex);
  setTitle(weekStart);
})();
