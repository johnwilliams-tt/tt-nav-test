/* Today: the day's appointments as a route across Salt Lake City, out of
   Sugar House. A live map of the stops, the drive time, distance and gas for the
   whole day, a suggested order set against the booked one, and the stops in
   the order they will be driven, which the pro reorders by dragging a stop's
   handle, long-pressing the row, or with the handle's arrow keys. Everything
   is worked out again from the order on each change, so the figures, the
   arrival times, the pins and the line follow the drag.

   Each appointment was booked for an arrival window. The pro leaves home in
   time to reach the first stop as its window opens, waits when a stop comes
   up before its window, and is late when it comes up after; a late stop is
   flagged on the row, the pin and the suggestion.

   Driving comes from the public OSRM server: one request for every ordered
   pair of places, so any order is priced from legs that are already in hand
   and the line on the map is the road those numbers were measured along.
   Without it, each leg is the straight line between the two places with a
   road factor, at a city speed, drawn dashed and labelled as such.

   The customers, their addresses and the costs are placeholders; the
   coordinates are real points on those streets, geocoded once and written
   here so the page never geocodes. `?stops=0` to `3` trims the day, to
   see those states. */
(function () {
  var page = document.querySelector('.today');
  if (!page) return;

  var figureEl = page.querySelector('.today__map');
  var canvas = page.querySelector('.today__map-canvas');
  var recenter = page.querySelector('.today__recenter');
  var list = page.querySelector('.today__stops');
  var note = page.querySelector('.today__note');
  var verdict = page.querySelector('.today__verdict');
  var verdictTitle = verdict.querySelector('.today__verdict-title');
  var verdictDetail = verdict.querySelector('.today__verdict-detail');
  var apply = verdict.querySelector('.today__apply');
  var totals = {
    time: page.querySelector('[data-total="time"]'),
    miles: page.querySelector('[data-total="miles"]'),
    gas: page.querySelector('[data-total="gas"]'),
  };

  var METERS_PER_MILE = 1609.344;
  var MPG = 22;
  var GAS_PRICE = 3.6;
  // The straight-line estimate: streets add about a third to the crow's
  // distance, driven at an average city 25 mph.
  var ROAD_FACTOR = 1.35;
  var CITY_SPEED = (25 * METERS_PER_MILE) / 3600;
  var OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  var OSRM_TIMEOUT = 6000;

  function at(h, m) {
    return h * 60 + (m || 0);
  }

  var HOME = { id: 'home', address: '842 E Wilmington Ave', lat: 40.72331, lng: -111.8668 };
  // Home and the four stops sit round a rough pentagon across the city:
  // home in Sugar House to the southeast, then the Avenues, Capitol Hill,
  // Glendale and South Salt Lake. In the order they were booked the day is
  // a star, every leg crossing town to the far side; the loop round the
  // outside, Priya first, shares none of its roads. The windows are set so
  // both orders keep every one, which makes the difference all driving.
  var BOOKED = [
    { id: 'dana', name: 'Dana Whitfield', short: 'Dana', address: '333 Ouray Ave', lat: 40.77895, lng: -111.90083, minutes: 120, window: [at(8, 30), at(10)] },
    { id: 'marcus', name: 'Marcus Lee', short: 'Marcus', address: '68 W Whitlock Ave', lat: 40.71595, lng: -111.89302, minutes: 60, window: [at(10, 30), at(16)] },
    { id: 'priya', name: 'Priya Shah', short: 'Priya', address: '373 J St', lat: 40.77797, lng: -111.8704, minutes: 45, window: [at(8, 30), at(13)] },
    { id: 'okafor', name: 'Okafor family', short: 'Okafor family', address: '1432 W Harris Ave', lat: 40.73485, lng: -111.93192, minutes: 180, window: [at(11, 30), at(14)] },
  ];
  var trim = new URLSearchParams(location.search).get('stops');
  if (trim !== null) BOOKED = BOOKED.slice(0, Number(trim) || 0);
  var STOPS = BOOKED;
  var PLACES = [HOME].concat(STOPS);
  PLACES.forEach(function (place, index) {
    place.index = index;
  });

  // The day opens on the smart route, the fastest order that keeps the
  // windows, with the booked order as the alternative. It is picked again
  // when road times replace the estimates, until the pro reorders anything.
  var order = STOPS.slice();
  var touched = false;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = window.matchMedia('(pointer: coarse)');
  var MOVE_MS = 200;
  var MOVE_EASE = 'cubic-bezier(0.45, 0, 0.4, 1)';
  // A short spring for the drop: it overshoots a few pixels and settles.
  var SETTLE_MS = 320;
  var SETTLE_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  function ms(value) {
    return value / (window.__ppSpeed || 1);
  }

  // Legs between every ordered pair of places: metres, seconds and the path.

  function crow(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  function estimates() {
    return PLACES.map(function (a) {
      return PLACES.map(function (b) {
        var meters = crow(a, b) * ROAD_FACTOR;
        return { meters: meters, seconds: meters / CITY_SPEED, path: [[a.lat, a.lng], [b.lat, b.lng]] };
      });
    });
  }

  var legs = estimates();
  var source = 'estimate';
  var pending = PLACES.length > 1;

  // One walk through every ordered pair exactly once, which a complete
  // directed graph always has, so a single request returns all of them.
  function circuit(n) {
    var left = [];
    for (var a = 0; a < n; a++) {
      left.push([]);
      for (var b = 0; b < n; b++) if (a !== b) left[a].push(b);
    }
    var stack = [0];
    var path = [];
    while (stack.length) {
      var top = stack[stack.length - 1];
      if (left[top].length) stack.push(left[top].shift());
      else path.push(stack.pop());
    }
    return path.reverse();
  }

  function cacheKey() {
    return 'today-osrm-1:' + PLACES.map(function (place) {
      return place.lng + ',' + place.lat;
    }).join(';');
  }

  function road() {
    var key = cacheKey();
    try {
      var kept = JSON.parse(localStorage.getItem(key));
      if (kept) return Promise.resolve(kept);
    } catch (error) {
      // No storage; ask the server.
    }
    var walk = circuit(PLACES.length);
    var url = OSRM + walk.map(function (index) {
      return PLACES[index].lng + ',' + PLACES[index].lat;
    }).join(';') + '?overview=false&steps=true&geometries=geojson&continue_straight=false';
    var abort = new AbortController();
    var timer = setTimeout(function () {
      abort.abort();
    }, OSRM_TIMEOUT);
    return fetch(url, { signal: abort.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('OSRM ' + response.status);
        return response.json();
      })
      .then(function (body) {
        clearTimeout(timer);
        if (body.code !== 'Ok' || !body.routes || !body.routes[0]) throw new Error('OSRM ' + body.code);
        var matrix = estimates();
        body.routes[0].legs.forEach(function (step, index) {
          var path = [];
          step.steps.forEach(function (part) {
            part.geometry.coordinates.forEach(function (point) {
              path.push([point[1], point[0]]);
            });
          });
          matrix[walk[index]][walk[index + 1]] = { meters: step.distance, seconds: step.duration, path: path };
        });
        try {
          localStorage.setItem(key, JSON.stringify(matrix));
        } catch (error) {
          // Not kept; the next visit asks again.
        }
        return matrix;
      });
  }

  // The plan.

  function cents(meters) {
    return Math.round((meters / METERS_PER_MILE / MPG) * GAS_PRICE * 100);
  }

  function legMinutes(seconds) {
    return Math.max(1, Math.round(seconds / 60));
  }

  // Home, each stop in order, and home again.
  function plan(stops) {
    var points = [HOME].concat(stops, [HOME]);
    var steps = [];
    for (var i = 1; i < points.length; i++) {
      var leg = legs[points[i - 1].index][points[i].index];
      steps.push({ meters: leg.meters, minutes: legMinutes(leg.seconds), path: leg.path });
    }
    if (!stops.length) return { legs: [], visits: [], leave: null, back: null, minutes: 0, meters: 0, cents: 0, late: [], lateness: 0 };

    var leave = stops[0].window[0] - steps[0].minutes;
    var clock = leave;
    var visits = [];
    var late = [];
    var lateness = 0;
    stops.forEach(function (stop, index) {
      clock += steps[index].minutes;
      var arrive = Math.max(clock, stop.window[0]);
      var visit = { arrive: arrive, wait: arrive - clock, late: Math.max(0, arrive - stop.window[1]), done: arrive + stop.minutes };
      if (visit.late) late.push(stop);
      lateness += visit.late;
      visits.push(visit);
      clock = visit.done;
    });
    clock += steps[steps.length - 1].minutes;

    // Minutes sum the legs so the total matches the clock; gas is priced on
    // the whole distance, since cents rounded per leg drift from the total.
    var minutes = 0;
    var meters = 0;
    steps.forEach(function (step) {
      minutes += step.minutes;
      meters += step.meters;
    });
    return { legs: steps, visits: visits, leave: leave, back: clock, minutes: minutes, meters: meters, cents: cents(meters), late: late, lateness: lateness };
  }

  function permutations(items) {
    if (items.length < 2) return [items.slice()];
    var out = [];
    items.forEach(function (item, index) {
      var rest = items.slice(0, index).concat(items.slice(index + 1));
      permutations(rest).forEach(function (tail) {
        out.push([item].concat(tail));
      });
    });
    return out;
  }

  // The suggestion: the least driving among the orders that keep every
  // window. When none does, the one that is least late, so the conflict is
  // named rather than hidden.
  function best() {
    var found = null;
    permutations(STOPS).forEach(function (candidate) {
      var result = plan(candidate);
      var a = [result.lateness, result.minutes, result.meters];
      var b = found && [found.result.lateness, found.result.minutes, found.result.meters];
      var better = !b || a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
      if (better) found = { order: candidate, result: result };
    });
    return found;
  }

  function same(a, b) {
    return a.length === b.length && a.every(function (stop, index) {
      return stop === b[index];
    });
  }

  // Words.

  function clockTime(minutes, short) {
    var h = Math.floor(minutes / 60) % 24;
    var m = minutes % 60;
    var time = (h % 12 || 12) + (short && !m ? '' : ':' + (m < 10 ? '0' : '') + m);
    return time + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  function span(window) {
    var from = clockTime(window[0], true);
    var to = clockTime(window[1], true);
    if (from.slice(-2) === to.slice(-2)) from = from.slice(0, -3);
    return from + '–' + to;
  }

  function length(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (!h) return m + ' min';
    return h + ' hr' + (m ? ' ' + m + ' min' : '');
  }

  function miles(meters) {
    return (Math.round((meters / METERS_PER_MILE) * 10) / 10).toFixed(1);
  }

  function dollars(value) {
    return '$' + (value / 100).toFixed(2);
  }

  function sequence(stops) {
    var words = stops.map(function (stop) {
      return stop.short;
    });
    if (words.length < 2) return words.join('');
    return words.slice(0, -1).join(', ') + ', then ' + words[words.length - 1];
  }

  // A value with its unit set smaller, so the number carries the figure.
  function figure(node, number, unit) {
    node.textContent = '';
    node.appendChild(document.createTextNode(number));
    if (unit) {
      var small = document.createElement('span');
      small.className = 'today__unit';
      small.textContent = ' ' + unit;
      node.appendChild(small);
    }
  }

  // The map. Esri's light gray canvas with its labels on top, or the dark
  // gray one under the dark theme, with OpenStreetMap's own tiles if Esri
  // cannot be reached. Pins and lines are the stylesheet's, by class. On a
  // touch screen one finger scrolls the page and two pinch the map; with a
  // mouse the map drags.

  var map = null;
  var markers = {};
  var casings = [];
  var lines = [];
  // The other order worth driving, drawn faint under the current route as a
  // map app shows an alternative: the suggestion while the pro is on
  // another order, the booked order once they take the suggestion. A wide
  // clear stroke over it takes the tap, since the line itself is thin.
  var alternate = null;
  var fitting = false;

  function tiles(part) {
    var dark = document.documentElement.dataset.ppTheme === 'dark';
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_' + (dark ? 'Dark' : 'Light') + '_Gray_' + part + '/MapServer/tile/{z}/{y}/{x}';
  }

  function fit(animate) {
    if (!map) return;
    fitting = true;
    var bounds = L.latLngBounds(PLACES.map(function (place) {
      return [place.lat, place.lng];
    }));
    if (PLACES.length < 2) map.setView([HOME.lat, HOME.lng], 15, { animate: false });
    // More room above than below: callouts stand above their roads.
    else map.fitBounds(bounds, { paddingTopLeft: [32, 44], paddingBottomRight: [32, 36], animate: animate && !reduced.matches });
    recenter.hidden = true;
  }

  // Stops are small, so the route reads between them; home is a size up,
  // where the day starts and ends.
  var PIN = 22;
  var HOME_PIN = 26;

  function pinIcon(className, size) {
    return L.divIcon({
      className: 'today__marker',
      html: '<span class="today__pin ' + className + '"></span>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  if (window.L) {
    map = L.map(canvas, {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: !coarse.matches,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      zoomSnap: 0.25,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    var osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    var esri = { maxNativeZoom: 16, maxZoom: 18 };
    var base = L.tileLayer(tiles('Base'), Object.assign({ attribution: 'Tiles &copy; Esri, HERE, Garmin, ' + osm }, esri)).addTo(map);
    var labels = L.tileLayer(tiles('Reference'), Object.assign({ className: 'today__tiles--labels' }, esri)).addTo(map);
    var misses = 0;
    var loaded = false;
    base.on('tileload', function () {
      loaded = true;
    });
    base.on('tileerror', function () {
      if (loaded || ++misses < 4) return;
      base.off('tileerror');
      map.removeLayer(base);
      map.removeLayer(labels);
      base = labels = null;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: osm, className: 'today__tiles--osm' }).addTo(map);
    });
    new MutationObserver(function () {
      if (!base) return;
      base.setUrl(tiles('Base'));
      labels.setUrl(tiles('Reference'));
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pp-theme'] });

    // Road geometry comes back with every kink in the kerb; simplifying it
    // at screen scale keeps the lines calm without moving them off the road.
    var SMOOTH = 2.5;
    for (var l = 0; l <= STOPS.length; l++) {
      casings.push(L.polyline([], { className: 'today__route-casing', interactive: false, smoothFactor: SMOOTH }).addTo(map));
    }
    for (var k = 0; k <= STOPS.length; k++) {
      lines.push(L.polyline([], { className: 'today__route-line', interactive: false, smoothFactor: SMOOTH }).addTo(map));
    }

    // Each route carries a callout with its drive time, the quicker one
    // marked Fastest: the current route's in the brand colour, the
    // alternative's dark, and only the alternative's takes a tap.
    var callout = { permanent: true, direction: 'top', offset: [0, -4] };
    alternate = {
      line: L.polyline([], { className: 'today__route-line today__route-line--alternate', interactive: false, smoothFactor: SMOOTH }).addTo(map),
      hit: L.polyline([], { className: 'today__route-hit', bubblingMouseEvents: false, smoothFactor: SMOOTH }).addTo(map),
      tag: L.tooltip(Object.assign({ interactive: true, className: 'today__route-tag' }, callout)),
      currentTag: L.tooltip(Object.assign({ className: 'today__route-tag today__route-tag--current' }, callout)),
    };
    alternate.hit.on('click', function (event) {
      L.DomEvent.stop(event);
      useSuggestion();
    });
    [alternate.tag, alternate.currentTag].forEach(function (tag) {
      tag.on('add', function () {
        var node = tag.getElement();
        // A pointer shortcut; the suggestion card's button is the way in
        // for keyboards and screen readers.
        node.setAttribute('aria-hidden', 'true');
        if (tag !== alternate.tag || node.dataset.wired) return;
        node.dataset.wired = '';
        L.DomEvent.on(node, 'click', function (event) {
          L.DomEvent.stop(event);
          useSuggestion();
        });
      });
    });

    L.marker([HOME.lat, HOME.lng], { icon: pinIcon('today__pin--home', HOME_PIN), interactive: false, keyboard: false }).addTo(map);
    STOPS.forEach(function (stop) {
      var marker = L.marker([stop.lat, stop.lng], { icon: pinIcon('pp-title-8 today__pin--stop', PIN), keyboard: true, riseOnHover: true }).addTo(map);
      marker.on('click', function () {
        pick(lit.picked === stop.id ? null : stop.id, 'map');
      });
      markers[stop.id] = marker;
    });
    map.on('click', function () {
      pick(null);
    });

    map.on('zoomstart movestart', function () {
      if (!fitting) recenter.hidden = false;
    });
    map.on('moveend', function () {
      fitting = false;
    });
    recenter.addEventListener('click', function () {
      fit(true);
    });

    new ResizeObserver(function () {
      map.invalidateSize({ pan: false });
    }).observe(canvas);
    fit(false);
  } else {
    figureEl.dataset.offline = '';
    canvas.appendChild(Object.assign(document.createElement('p'), { className: 'pp-body-3 today__offline', textContent: 'The map needs a connection. The route below still adds up.' }));
  }

  // The list. Every row is made once and moved, never rebuilt, so a row
  // being dragged keeps its place under the finger.

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function endpoint(text, modifier) {
    var item = el('li', 'today__endpoint today__endpoint--' + modifier);
    item.appendChild(el('span', 'today__node today__node--home')).setAttribute('aria-hidden', 'true');
    item.appendChild(el('span', 'pp-title-6 today__endpoint-label', text));
    var time = item.appendChild(el('span', 'pp-title-6 today__time'));
    return { item: item, time: time };
  }

  var start = endpoint('Leave home', 'start');
  var end = endpoint('Back home', 'end');

  var legRows = [];
  for (var r = 0; r <= STOPS.length; r++) {
    var legItem = el('li', 'today__leg');
    legItem.dataset.leg = String(r);
    legRows.push({ item: legItem, text: legItem.appendChild(el('span', 'pp-body-3 today__leg-text')) });
  }

  var help = el('p', 'today__status', 'Drag to reorder, or press the up and down arrow keys.');
  help.id = 'today-reorder-help';
  page.appendChild(help);

  var rows = {};
  STOPS.forEach(function (stop) {
    var item = el('li', 'today__stop');
    item.dataset.id = stop.id;
    var badge = item.appendChild(el('span', 'pp-title-7 today__node today__badge'));
    badge.setAttribute('aria-hidden', 'true');
    var text = item.appendChild(el('div', 'today__stop-text'));
    var head = text.appendChild(el('div', 'today__stop-head'));
    var name = head.appendChild(el('p', 'pp-title-6 today__stop-name', stop.name));
    name.dataset.ppContent = 'pro';
    // One time per stop: the window the customer booked, set small beside
    // the name. It turns red when the order being driven misses it.
    var time = head.appendChild(el('p', 'pp-body-3 today__window', span(stop.window)));
    time.setAttribute('aria-label', 'Arrival window ' + span(stop.window));
    text.appendChild(el('p', 'pp-body-3 today__stop-detail', stop.address));
    var flag = text.appendChild(el('span', 'pp-body-3 today__flag'));
    flag.dataset.ppComponent = 'Pill';
    flag.dataset.ppVariant = 'theme=alert';
    var handle = item.appendChild(el('button', 'today__handle'));
    handle.type = 'button';
    handle.setAttribute('aria-label', 'Move ' + stop.name);
    handle.setAttribute('aria-describedby', help.id);
    handle.dataset.ppProposed = 'Pro / Drag handle';
    rows[stop.id] = { item: item, badge: badge, time: time, flag: flag, handle: handle, stop: stop };
  });

  var empty = el('li', 'pp-body-2 today__empty', 'No appointments today.');

  var status = el('p', 'today__status');
  status.setAttribute('role', 'status');
  page.appendChild(status);

  var suggestion = null;

  function render() {
    var result = plan(order);

    if (!order.length) {
      list.replaceChildren(empty);
    } else {
      var rowsInOrder = [start.item, legRows[0].item];
      order.forEach(function (stop, index) {
        rowsInOrder.push(rows[stop.id].item, legRows[index + 1].item);
      });
      rowsInOrder.push(end.item);
      rowsInOrder.forEach(function (node) {
        list.appendChild(node);
      });
    }

    order.forEach(function (stop, index) {
      var row = rows[stop.id];
      var visit = result.visits[index];
      row.badge.textContent = String(index + 1);
      row.flag.textContent = visit.late ? length(visit.late) + ' late' : '';
      row.flag.hidden = !visit.late;
      if (visit.late) row.item.dataset.late = '';
      else delete row.item.dataset.late;
      row.handle.hidden = order.length < 2;

      var marker = markers[stop.id];
      if (marker) {
        var node = marker.getElement();
        var pinNode = node.querySelector('.today__pin');
        pinNode.textContent = String(index + 1);
        node.setAttribute('aria-label', 'Stop ' + (index + 1) + ', ' + stop.name + (visit.late ? ', late' : ''));
        node.removeAttribute('title');
        if (visit.late) pinNode.dataset.late = '';
        else delete pinNode.dataset.late;
      }
    });

    result.legs.forEach(function (step, index) {
      var words = length(step.minutes) + ' · ' + miles(step.meters) + ' mi';
      var visit = result.visits[index];
      if (visit && visit.wait) words += ' · ' + length(visit.wait) + ' wait';
      legRows[index].text.textContent = words;
    });
    lines.forEach(function (line, index) {
      var path = index < result.legs.length ? result.legs[index].path : [];
      line.setLatLngs(path);
      casings[index].setLatLngs(path);
    });
    page.dataset.source = source;
    if (pending) page.setAttribute('aria-busy', 'true');
    else page.removeAttribute('aria-busy');

    if (order.length) {
      start.time.textContent = clockTime(result.leave);
      end.time.textContent = clockTime(result.back);
    }

    figure(totals.time, String(result.minutes), 'min');
    figure(totals.miles, miles(result.meters), 'mi');
    figure(totals.gas, dollars(result.cents));
    note.textContent =
      (source === 'road' ? 'Road estimates' : 'Straight-line estimates') +
      ', ' + MPG + ' mpg, ' + dollars(GAS_PRICE * 100) + ' a gallon.';

    renderVerdict(result);
    renderAlternate(result);
    renderHeadline(result);
    highlight();
    return result;
  }

  // Every point of one route against every point of the other is too much to
  // redo on each step of a drag, and there are only a few orders to place.
  var tagSpots = {};

  function ids(stops) {
    return stops.map(function (stop) {
      return stop.id;
    }).join(',');
  }

  function pathsOf(result) {
    return result.legs.map(function (step) {
      return step.path;
    });
  }

  function flat(paths, step) {
    var points = [].concat.apply([], paths);
    return points.filter(function (point, index) {
      return index % (step || 1) === 0;
    }).map(L.latLng);
  }

  function nearest(here, points) {
    var gap = Infinity;
    points.forEach(function (point) {
      gap = Math.min(gap, here.distanceTo(point));
    });
    return gap;
  }

  // Where a route's callout goes, in metres of preference: on a stretch of
  // road the other route does not share, which is where a map app labels a
  // route; clear of the pins; and well apart from the callout already
  // placed, so the two never stack. Paths are thinned, since this runs for
  // every new pair of orders.
  var CLEAR_OF_PIN = 450;

  function spotFor(paths, otherPaths, avoid) {
    var others = flat(otherPaths, 2);
    var pins = PLACES.map(function (place) {
      return L.latLng(place.lat, place.lng);
    });
    var candidates = flat(paths, 2);
    var best = null;
    var bestScore = -Infinity;
    candidates.forEach(function (here) {
      var pin = nearest(here, pins);
      if (pin < CLEAR_OF_PIN) return;
      var score = Math.min(nearest(here, others), 1200) + 0.3 * Math.min(pin, 1500);
      if (avoid) score += 0.6 * Math.min(here.distanceTo(avoid), 4000);
      if (score > bestScore) {
        bestScore = score;
        best = here;
      }
    });
    return best || candidates[Math.floor(candidates.length / 2)];
  }

  // A callout hangs below its point in the top half of the map and stands
  // above it in the bottom half, so the frame's edge never cuts it off.
  function sideFor(spot) {
    var middle = PLACES.reduce(function (sum, place) {
      return sum + place.lat;
    }, 0) / PLACES.length;
    return spot.lat > middle ? 'bottom' : 'top';
  }

  function calloutText(minutes, fastest) {
    return '<span class="pp-title-7 today__route-tag-time">' + length(minutes) + '</span>' +
      (fastest ? '<span class="pp-body-3 today__route-tag-note">Fastest</span>' : '');
  }

  function place(tag, spot, html) {
    var side = sideFor(spot);
    tag.options.direction = side;
    tag.options.offset = side === 'top' ? [0, -4] : [0, 4];
    tag.setLatLng(spot).setContent(html);
    if (!map.hasLayer(tag)) tag.addTo(map);
    else tag.update();
  }

  // Two routes when there is a choice to make, as a map app offers one: the
  // order being driven, and the other worth driving, faint beneath it. With
  // the booked order already the best there is no choice and no callouts.
  function renderAlternate(current) {
    if (!alternate) return;
    var found = order.length > 1 ? best() : null;
    var other = null;
    if (found && !same(order, found.order)) other = found.order;
    else if (found && !same(found.order, BOOKED)) other = BOOKED;
    var otherPlan = other ? plan(other) : null;
    var paths = otherPlan ? pathsOf(otherPlan) : [];
    alternate.line.setLatLngs(paths);
    alternate.hit.setLatLngs(paths);
    if (!otherPlan) {
      alternate.tag.remove();
      alternate.currentTag.remove();
      return;
    }
    alternate.line.bringToBack();
    alternate.hit.bringToFront();
    // Placed once per pair of routes, whichever is selected, and kept per
    // route: switching swaps the callouts' colours, not their places.
    var mineKey = ids(order);
    var otherKey = ids(other);
    var pair = [mineKey, otherKey].sort();
    var key = pair.join('|') + '>' + source;
    if (!tagSpots[key]) {
      var routes = {};
      routes[mineKey] = pathsOf(current);
      routes[otherKey] = paths;
      var first = spotFor(routes[pair[0]], routes[pair[1]]);
      tagSpots[key] = {};
      tagSpots[key][pair[0]] = first;
      tagSpots[key][pair[1]] = spotFor(routes[pair[1]], routes[pair[0]], first);
    }
    place(alternate.tag, tagSpots[key][otherKey], calloutText(otherPlan.minutes, otherPlan.minutes < current.minutes));
    place(alternate.currentTag, tagSpots[key][mineKey], calloutText(current.minutes, current.minutes < otherPlan.minutes));
  }

  function savings(from, to) {
    return length(from.minutes - to.minutes) + ', ' + miles(from.meters - to.meters) + ' mi and ' + dollars(from.cents - to.cents);
  }

  function lateFor(result) {
    return result.late.length === 1 ? 'Late for ' + result.late[0].name : 'Late for ' + result.late.length + ' stops';
  }

  function renderVerdict(result) {
    suggestion = null;
    verdict.hidden = order.length < 2;
    if (verdict.hidden) return;
    var found = best();
    var booked = plan(BOOKED);
    var onBest = same(order, found.order);
    var tone;
    var title;
    var detail;

    if (onBest && same(found.order, BOOKED)) {
      tone = found.result.late.length ? 'alert' : 'good';
      title = found.result.late.length ? lateFor(found.result) : 'The booked order is the shortest';
      detail = found.result.late.length ? 'No order keeps every window. Ask the customer for a new time.' : 'Home by ' + clockTime(result.back) + '.';
    } else if (onBest) {
      tone = found.result.late.length ? 'alert' : 'good';
      title = found.result.late.length ? lateFor(found.result) : 'On the suggested order';
      detail = 'Saves ' + savings(booked, found.result) + ' against the booked order.';
      suggestion = BOOKED;
    } else {
      suggestion = found.order;
      var gain = result.minutes - found.result.minutes;
      if (result.late.length) {
        tone = 'alert';
        title = lateFor(result);
        detail = found.result.late.length
          ? 'The suggested order is still late for ' + found.result.late.map(function (stop) { return stop.name; }).join(' and ') + '.'
          : 'The suggested order, ' + sequence(found.order) + ', keeps every window.';
      } else {
        tone = 'save';
        title = gain > 0 ? 'Save ' + length(gain) + ' of driving' : 'A suggested order fits better';
        detail = sequence(found.order) + '. ' + miles(result.meters - found.result.meters) + ' mi and ' + dollars(result.cents - found.result.cents) + ' less, every window kept.';
        if (found.result.late.length) detail = sequence(found.order) + ' saves ' + miles(result.meters - found.result.meters) + ' mi but is late for ' + found.result.late[0].name + '.';
      }
    }

    verdict.dataset.tone = tone;
    verdictTitle.textContent = title;
    verdictDetail.textContent = detail;
    apply.hidden = !suggestion;
    var back = suggestion === BOOKED;
    apply.textContent = back ? 'Use booked order' : 'Use suggested order';
    apply.dataset.ppVariant = back ? 'theme=secondary, size=small' : 'theme=primary, size=small';
    if (back) apply.dataset.quiet = '';
    else delete apply.dataset.quiet;
  }

  function announce(text) {
    status.textContent = '';
    requestAnimationFrame(function () {
      status.textContent = text;
    });
  }

  function summary(result) {
    var words = 'Drive time ' + length(result.minutes) + ', ' + dollars(result.cents) + ' gas.';
    if (result.late.length) words += ' ' + lateFor(result) + '.';
    return words;
  }

  // Slides every row from where it was, so the list reads as rows making room
  // rather than jumping. `keep` is left where it is: the row under the finger.
  function reorder(next, keep) {
    var moving = Array.prototype.slice.call(list.children).filter(function (node) {
      return node !== keep;
    });
    var before = moving.map(function (node) {
      return node.offsetTop;
    });
    order = next;
    touched = true;
    var result = render();
    if (!reduced.matches) {
      moving.forEach(function (node, index) {
        var delta = before[index] - node.offsetTop;
        if (delta) node.animate({ translate: ['0 ' + delta + 'px', '0 0'] }, { duration: ms(keep ? MOVE_MS : SETTLE_MS), easing: keep ? MOVE_EASE : SETTLE_EASE });
      });
    }
    return result;
  }

  function move(stop, to, keep) {
    var from = order.indexOf(stop);
    if (to === from || to < 0 || to >= order.length) return null;
    var next = order.slice();
    next.splice(from, 1);
    next.splice(to, 0, stop);
    return reorder(next, keep);
  }

  function buzz() {
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // Linking the list and the map. A stop is lit while it is dragged, hovered
  // or focused, or after a tap on its row or its pin; a leg is lit while its
  // row is hovered. A lit stop lights its pin and the legs in and out of it.

  var lit = { drag: null, hover: null, focus: null, picked: null, leg: null };

  function mark(node, on) {
    if (!node) return;
    if (on) node.dataset.lit = '';
    else delete node.dataset.lit;
  }

  function highlight() {
    var id = lit.drag || lit.hover || lit.focus || lit.picked;
    var legsLit = [];
    var index = id ? order.findIndex(function (stop) { return stop.id === id; }) : -1;
    if (index !== -1) legsLit = [index, index + 1];
    else if (lit.leg !== null) legsLit = [lit.leg];
    else id = null;
    if (legsLit.length) canvas.dataset.focus = '';
    else delete canvas.dataset.focus;
    lines.forEach(function (line, n) {
      mark(line.getElement(), legsLit.indexOf(n) !== -1);
      if (legsLit.indexOf(n) !== -1) line.bringToFront();
    });
    legRows.forEach(function (row, n) {
      mark(row.item, legsLit.indexOf(n) !== -1);
    });
    Object.keys(rows).forEach(function (key) {
      mark(rows[key].item, key === id);
      var marker = markers[key];
      if (marker) {
        mark(marker.getElement().querySelector('.today__pin'), key === id);
        marker.setZIndexOffset(key === id ? 1000 : 0);
        marker.getElement().setAttribute('aria-pressed', String(key === lit.picked));
      }
    });
  }

  function pick(id, from) {
    lit.picked = id;
    highlight();
    if (!id) return;
    var behavior = reduced.matches ? 'auto' : 'smooth';
    if (from === 'map') rows[id].item.scrollIntoView({ block: 'nearest', behavior: behavior });
    else if (map) map.panInside([rows[id].stop.lat, rows[id].stop.lng], { padding: [40, 40], animate: !reduced.matches });
  }

  list.addEventListener('pointerover', function (event) {
    if (event.pointerType !== 'mouse' || drag) return;
    var stopRow = event.target.closest('.today__stop');
    var legRow = event.target.closest('.today__leg');
    lit.hover = stopRow ? stopRow.dataset.id : null;
    lit.leg = legRow ? Number(legRow.dataset.leg) : null;
    highlight();
  });

  list.addEventListener('pointerleave', function () {
    lit.hover = null;
    lit.leg = null;
    highlight();
  });

  list.addEventListener('focusin', function (event) {
    var stopRow = event.target.closest('.today__stop');
    lit.focus = stopRow ? stopRow.dataset.id : null;
    highlight();
  });

  list.addEventListener('focusout', function () {
    lit.focus = null;
    highlight();
  });

  var suppressClick = false;

  list.addEventListener('click', function (event) {
    if (suppressClick || event.target.closest('.today__handle')) return;
    var stopRow = event.target.closest('.today__stop');
    if (stopRow) pick(lit.picked === stopRow.dataset.id ? null : stopRow.dataset.id, 'list');
  });

  function useSuggestion() {
    if (!suggestion) return;
    var result = reorder(suggestion.slice());
    verdict.focus({ preventScroll: true });
    announce('Order changed to ' + sequence(order) + '. ' + summary(result));
  }

  apply.addEventListener('click', useSuggestion);

  // The summary names and tints what it is summing: the smart route while
  // the pro is on it, just the route once they have changed it, and the
  // route in alert when the order they chose misses a booked window.
  var headline = page.querySelector('.today__headline');
  var summaryBox = page.querySelector('.today__summary');

  function renderHeadline(result) {
    var smart = order.length > 1 && same(order, best().order);
    headline.textContent = smart ? 'Smart route' : 'Route';
    summaryBox.dataset.state = result.late.length ? 'late' : smart ? 'smart' : 'custom';
  }

  // Keyboard: the handle's arrow keys move its stop one place, Home and End
  // to the ends.
  Object.keys(rows).forEach(function (id) {
    var row = rows[id];
    row.handle.addEventListener('keydown', function (event) {
      var index = order.indexOf(row.stop);
      var to = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: order.length - 1 }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      var result = move(row.stop, to);
      row.handle.focus({ preventScroll: true });
      if (result) announce(row.stop.name + ' is stop ' + (order.indexOf(row.stop) + 1) + '. ' + summary(result));
    });
  });

  // Dragging. The list holds the pointer, since it never moves while its
  // rows are reordered under it. A handle lifts its row at once; a touch
  // anywhere else on the row lifts it after a long press that has not moved,
  // which leaves an ordinary swipe to scroll. The row follows the finger
  // between the first and last places a stop can take, and passing a
  // neighbour's middle swaps the two at once, so the route is priced and
  // drawn again mid-drag. Escape puts the order back.
  var drag = null;
  var press = null;
  var LONG_PRESS = 350;
  var SLOP = 8;

  function lift(row, event) {
    drag = {
      row: row,
      pointerId: event.pointerId,
      grab: event.clientY - list.getBoundingClientRect().top - row.item.offsetTop,
      y: event.clientY,
      from: order.slice(),
      moved: false,
    };
    try {
      list.setPointerCapture(event.pointerId);
    } catch (error) {
      // The pointer may already be gone; pointerup ends the drag either way.
    }
    row.item.dataset.dragging = '';
    lit.drag = row.stop.id;
    highlight();
    buzz();
    scroll();
  }

  list.addEventListener('pointerdown', function (event) {
    if (drag || order.length < 2) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var stopRow = event.target.closest('.today__stop');
    if (!stopRow) return;
    var row = rows[stopRow.dataset.id];
    if (event.target.closest('.today__handle')) {
      event.preventDefault();
      lift(row, event);
      return;
    }
    if (event.pointerType === 'mouse') return;
    press = {
      row: row,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(function () {
        var held = press;
        press = null;
        lift(held.row, { pointerId: held.pointerId, clientY: held.y });
      }, LONG_PRESS),
    };
  });

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  }

  // Once a row is lifted, the finger drags it instead of scrolling the page.
  list.addEventListener(
    'touchmove',
    function (event) {
      if (drag) event.preventDefault();
    },
    { passive: false }
  );

  function follow() {
    var item = drag.row.item;
    var top = drag.y - list.getBoundingClientRect().top - drag.grab;
    var min = start.item.offsetTop + start.item.offsetHeight;
    var max = end.item.offsetTop - item.offsetHeight;
    top = Math.min(Math.max(top, min), max);
    item.style.translate = '0 ' + (top - item.offsetTop) + 'px';
    return top + item.offsetHeight / 2;
  }

  function track() {
    var middle = follow();
    var index = order.indexOf(drag.row.stop);
    var prev = order[index - 1] && rows[order[index - 1].id].item;
    var next = order[index + 1] && rows[order[index + 1].id].item;
    var to = index;
    if (prev && middle < prev.offsetTop + prev.offsetHeight / 2) to = index - 1;
    else if (next && middle > next.offsetTop + next.offsetHeight / 2) to = index + 1;
    if (to !== index) {
      drag.moved = true;
      move(drag.row.stop, to, drag.row.item);
      follow();
      buzz();
    }
  }

  // Near the top of the body, or near the tab bar floating over its foot,
  // the body scrolls under a held row.
  var EDGE = 64;
  var BAR = 112;

  function scroll() {
    if (!drag) return;
    var box = page.getBoundingClientRect();
    var speed = 0;
    if (drag.y < box.top + EDGE) speed = -Math.ceil((box.top + EDGE - drag.y) / 6);
    else if (drag.y > box.bottom - BAR) speed = Math.ceil((drag.y - (box.bottom - BAR)) / 6);
    if (speed) {
      var was = page.scrollTop;
      page.scrollTop += speed;
      if (page.scrollTop !== was) track();
    }
    drag.frame = requestAnimationFrame(scroll);
  }

  list.addEventListener('pointermove', function (event) {
    if (press && event.pointerId === press.pointerId) {
      if (Math.abs(event.clientX - press.x) > SLOP || Math.abs(event.clientY - press.y) > SLOP) cancelPress();
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.y = event.clientY;
    track();
  });

  function drop(cancelled) {
    var row = drag.row;
    var moved = drag.moved;
    var from = drag.from;
    cancelAnimationFrame(drag.frame);
    drag = null;
    lit.drag = null;
    delete row.item.dataset.dragging;
    var offset = row.item.style.translate || '0 0';
    row.item.style.translate = '';
    var undo = cancelled && moved;
    var result = undo ? reorder(from) : render();
    if (!reduced.matches && !undo) {
      row.item.animate({ translate: [offset, '0 0'] }, { duration: ms(SETTLE_MS), easing: SETTLE_EASE });
    }
    if (undo) announce('Move cancelled. ' + summary(result));
    else if (moved) announce(row.stop.name + ' is stop ' + (order.indexOf(row.stop) + 1) + '. ' + summary(result));
  }

  function release(event) {
    if (press && event.pointerId === press.pointerId) cancelPress();
    if (!drag || event.pointerId !== drag.pointerId) return;
    // The click that follows a drag is not a tap on the row.
    suppressClick = true;
    setTimeout(function () {
      suppressClick = false;
    });
    drop(event.type === 'pointercancel');
  }

  list.addEventListener('pointerup', release);
  list.addEventListener('pointercancel', release);
  list.addEventListener('contextmenu', function (event) {
    if (drag || press) event.preventDefault();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && drag) drop(true);
  });

  function smartRoute() {
    if (!touched && STOPS.length > 1) order = best().order.slice();
  }

  smartRoute();
  render();

  if (pending) {
    road()
      .then(function (matrix) {
        legs = matrix;
        source = 'road';
      })
      .catch(function () {
        source = 'estimate';
      })
      .then(function () {
        pending = false;
        smartRoute();
        render();
      });
  }
})();
