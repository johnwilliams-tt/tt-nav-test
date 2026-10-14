/* Devtool: the menu that switches between nav concepts. Each concept is a
   folder with its own page, and this script is shared, so a concept is added
   here and nowhere else. The pill sits where the kit's theme toggle used to,
   carries data-pp-devtool like it did, and is hidden on phones by the same
   rule. Any ?speed= setting travels with the switch. */
(function () {
  var CONCEPTS = [
    { slug: 'inline-action', name: 'Inline Action' },
    { slug: 'floating-chip', name: 'Floating Chip' },
    { slug: 'embedded', name: 'Embedded' },
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
    // [data-pp-devtool] still wins on order alone.
    '.pp-concepts{' +
    'position:fixed;right:var(--pp-space-3);bottom:var(--pp-space-3);z-index:var(--pp-z-modal);' +
    'font-family:var(--pp-font-family);font-size:var(--pp-font-size-body-3);' +
    'line-height:var(--pp-line-height-body-3);font-weight:var(--pp-font-weight-body-3);}' +
    '.pp-concepts__toggle{' +
    'margin:0;padding:var(--pp-space-2) var(--pp-space-3);' +
    'border:1px solid var(--pp-border-neutral-default);border-radius:var(--pp-radius-sides);' +
    'background:var(--pp-background-neutral-default);color:var(--pp-text-neutral-default);' +
    'box-shadow:var(--pp-shadow-300);font:inherit;' +
    'cursor:pointer;-webkit-appearance:none;appearance:none;}' +
    '.pp-concepts__toggle:hover{background:var(--pp-background-neutral-strong);}' +
    '.pp-concepts__toggle::after{content:" \\2195";}' +
    '.pp-concepts__list{' +
    'display:none;position:absolute;right:0;bottom:calc(100% + var(--pp-space-2));' +
    'min-width:max-content;margin:0;padding:var(--pp-space-1);list-style:none;' +
    'border:1px solid var(--pp-border-neutral-default);border-radius:var(--pp-radius-large);' +
    'background:var(--pp-background-neutral-default);box-shadow:var(--pp-shadow-300);}' +
    '.pp-concepts[data-open] .pp-concepts__list{display:grid;}' +
    '.pp-concepts__link{' +
    'display:block;padding:var(--pp-space-2) var(--pp-space-3);' +
    'border-radius:var(--pp-radius-medium);color:var(--pp-text-neutral-default);text-decoration:none;}' +
    '.pp-concepts__link:hover{background:var(--pp-background-neutral-strong);}' +
    '.pp-concepts__link[aria-current]{color:var(--pp-text-brand-medium);font-weight:var(--pp-font-weight-title-6);}';

  var root = document.createElement('nav');
  root.className = 'pp-concepts';
  root.setAttribute('data-pp-devtool', '');
  root.setAttribute('aria-label', 'Nav concept');

  var list = document.createElement('ul');
  list.className = 'pp-concepts__list';
  list.id = 'pp-concepts-list';
  CONCEPTS.forEach(function (concept) {
    var item = document.createElement('li');
    var link = document.createElement('a');
    link.className = 'pp-concepts__link';
    link.href = '../' + concept.slug + '/' + window.location.search;
    link.textContent = concept.name;
    if (concept === current) link.setAttribute('aria-current', 'page');
    item.appendChild(link);
    list.appendChild(item);
  });

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pp-concepts__toggle';
  toggle.textContent = current.name;
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', list.id);

  var setOpen = function (open) {
    if (open) root.setAttribute('data-open', '');
    else root.removeAttribute('data-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggle.addEventListener('click', function () {
    setOpen(!root.hasAttribute('data-open'));
  });
  document.addEventListener('click', function (event) {
    if (!root.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && root.hasAttribute('data-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  root.appendChild(list);
  root.appendChild(toggle);

  var mount = function () {
    document.head.appendChild(style);
    document.body.appendChild(root);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
