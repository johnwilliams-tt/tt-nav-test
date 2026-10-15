/* Devtool: the segmented control that switches between nav concepts. Each
   concept is a folder with its own page, and this script is shared, so a
   concept is added here and nowhere else. It sits centred under the device
   frame, carries data-pp-devtool, and is hidden on phones by the page's rule
   for that attribute. Any ?speed= setting travels with the switch. */
(function () {
  var CONCEPTS = [
    { slug: 'inline-action', name: 'Inline Action' },
    { slug: 'floating-chip', name: 'Floating Chip' },
    { slug: 'floating-action-button', name: 'Floating Action Button' },
    { slug: 'embedded', name: 'Embedded' },
    { slug: 'side-navigation', name: 'Side Navigation' },
  ];

  var match = window.location.pathname.match(/\/([^/]+)\/(?:index\.html)?$/);
  var currentSlug = match ? match[1] : null;
  var current = null;
  CONCEPTS.forEach(function (concept) {
    if (concept.slug === currentSlug) current = concept;
  });
  if (!current) return;

  var style = document.createElement('style');
  style.setAttribute('data-pp-devtool', '');
  style.textContent =
    // The root sets no display of its own, so the page's phone rule hiding
    // [data-pp-devtool] still wins on order alone; the track carries the flex.
    '.pp-concepts{margin-top:var(--pp-space-6);' +
    'font-family:var(--pp-font-family);font-size:var(--pp-font-size-body-3);' +
    'line-height:var(--pp-line-height-body-3);font-weight:var(--pp-font-weight-body-3);}' +
    '.pp-concepts__track{' +
    'display:flex;gap:var(--pp-space-1);width:fit-content;margin:0 auto;padding:var(--pp-space-1);list-style:none;' +
    'border:1px solid var(--pp-border-neutral-default);border-radius:var(--pp-radius-sides);' +
    'background:var(--pp-background-neutral-default);}' +
    '.pp-concepts__link{' +
    'display:block;padding:var(--pp-space-2) var(--pp-space-4);white-space:nowrap;' +
    'border-radius:var(--pp-radius-sides);color:var(--pp-text-neutral-medium);text-decoration:none;' +
    'transition:background-color var(--pp-duration-2) var(--pp-ease-out),color var(--pp-duration-2) var(--pp-ease-out);}' +
    '.pp-concepts__link:hover{color:var(--pp-text-neutral-default);background:var(--pp-background-neutral-low);}' +
    '.pp-concepts__link[aria-current]{' +
    'background:var(--pp-background-neutral-medium);color:var(--pp-text-neutral-default);' +
    'font-weight:var(--pp-font-weight-title-6);}';

  var root = document.createElement('nav');
  root.className = 'pp-concepts';
  root.setAttribute('data-pp-devtool', '');
  root.setAttribute('aria-label', 'Nav concept');

  var track = document.createElement('ul');
  track.className = 'pp-concepts__track';
  CONCEPTS.forEach(function (concept) {
    var item = document.createElement('li');
    var link = document.createElement('a');
    link.className = 'pp-concepts__link';
    link.href = '../' + concept.slug + '/' + window.location.search;
    link.textContent = concept.name;
    if (concept === current) link.setAttribute('aria-current', 'page');
    item.appendChild(link);
    track.appendChild(item);
  });
  root.appendChild(track);

  // After the body's child that holds the frame, so it lands below the device
  // whatever wrapper the page puts around it.
  var mount = function () {
    document.head.appendChild(style);
    var frame = document.querySelector('.pp-device');
    var anchor = frame;
    while (anchor && anchor.parentElement !== document.body) anchor = anchor.parentElement;
    if (anchor) anchor.after(root);
    else document.body.appendChild(root);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
