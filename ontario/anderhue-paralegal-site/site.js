/* AnderHue Paralegal public site: mobile menu, accordions and the N4 date
   calculator. Plain JavaScript, no dependencies, loaded with defer. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var slice = Array.prototype.slice;
  root.classList.add('js');

  /* Mobile menu
     ------------------------------------------------------------------ */
  var toggle = doc.querySelector('.menu-toggle');
  var menu = doc.getElementById('site-menu');

  if (toggle && menu) {
    var label = toggle.querySelector('.menu-toggle__label');
    var desktop = window.matchMedia('(min-width: 62.5em)');

    var isOpen = function () {
      return toggle.getAttribute('aria-expanded') === 'true';
    };

    /* While the menu covers the page, the content behind it is inert */
    var behind = slice.call(doc.querySelectorAll('main, .site-footer, .skip-link'));

    var setOpen = function (open, returnFocus) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (label) label.textContent = open ? 'Close' : 'Menu';
      root.classList.toggle('menu-open', open);
      behind.forEach(function (el) {
        if (open) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
      });
      if (open) {
        var first = menu.querySelector('a[href], button');
        if (first) first.focus({ preventScroll: true });
      } else if (returnFocus) {
        toggle.focus();
      }
    };

    toggle.addEventListener('click', function () {
      setOpen(!isOpen(), true);
    });

    doc.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        setOpen(false, true);
        return;
      }
      if (event.key !== 'Tab') return;
      /* Keep keyboard focus inside the open menu and its toggle */
      var items = [toggle].concat(slice.call(menu.querySelectorAll('a[href], button')));
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    menu.addEventListener('click', function (event) {
      if (isOpen() && event.target.closest('a')) setOpen(false);
    });

    var onViewport = function (event) {
      if (event.matches && isOpen()) setOpen(false);
    };
    if (desktop.addEventListener) desktop.addEventListener('change', onViewport);
    else if (desktop.addListener) desktop.addListener(onViewport);
  }

  /* Accordions: one open answer per group, and open an answer by its link
     ------------------------------------------------------------------ */
  var groups = slice.call(doc.querySelectorAll('details[name]'));
  var nativeGroups = 'HTMLDetailsElement' in window && 'name' in HTMLDetailsElement.prototype;

  if (!nativeGroups) {
    groups.forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) return;
        groups.forEach(function (other) {
          if (other !== item && other.open && other.getAttribute('name') === item.getAttribute('name')) {
            other.open = false;
          }
        });
      });
    });
  }

  var openFromHash = function () {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var target = doc.getElementById(id);
    if (target && target.tagName === 'DETAILS') target.open = true;
  };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  /* N4 date calculator (landlords page)
     Rules: on or after Sept 21, 2026 the N4 runs 7 days. Served before
     then, monthly and yearly tenancies keep 14 days. Mail adds 5 days
     before the count starts. The L1 can be filed the day after.
     ------------------------------------------------------------------ */
  var dateEl = doc.getElementById('svc-date');
  if (!dateEl) return;

  var DAY = 86400000;
  var CUTOVER = Date.UTC(2026, 8, 21);
  var periodEl = doc.getElementById('period');
  var cal = doc.getElementById('cal');

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayIso() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function parse(value) {
    var p = (value || '').split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }

  function fmt(t) {
    return new Date(t).toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  }

  function dow(t) { return new Date(t).getUTCDay(); }

  function method() {
    var checked = doc.querySelector('input[name="method"]:checked');
    return checked ? checked.value : 'hand';
  }

  function monthName(t) {
    return new Date(t).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long' });
  }

  function render() {
    var svc = parse(dateEl.value);
    if (svc === null) {
      svc = parse(todayIso());
      dateEl.value = todayIso();
    }
    var mailDays = method() === 'mail' ? 5 : 0;
    var deemed = svc + mailDays * DAY;
    var oldRule = svc < CUTOVER;
    var minDays = (oldRule && periodEl.value === 'month') ? 14 : 7;
    var term = deemed + minDays * DAY;
    var file = term + DAY;

    doc.getElementById('o-deem').textContent = fmt(deemed) + (mailDays ? '  (+5, mail)' : '');
    doc.getElementById('o-term').textContent = fmt(term) + '  (' + minDays + ' days)';
    doc.getElementById('o-file').textContent = fmt(file);
    doc.getElementById('cal-foot').textContent = oldRule
      ? 'Served before Sept 21, 2026: old rules apply, including 14 days for monthly and yearly tenancies.'
      : 'Estimate. If the tenant pays all arrears before you file, the N4 is void.';

    var start = svc - dow(svc) * DAY;
    var end = file + (6 - dow(file)) * DAY;
    var html = '';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (d) {
      html += '<div class="cal-dow">' + d + '</div>';
    });
    for (var t = start; t <= end; t += DAY) {
      var cls = 'cell';
      var tag = '';
      if (t === svc) { cls += ' svc'; tag = 'Srv'; }
      else if (t > svc && t <= deemed) { cls += ' mail'; tag = t === deemed ? '+5' : ''; }
      else if (t > deemed && t < term) { cls += ' count'; tag = String(Math.round((t - deemed) / DAY)); }
      else if (t === term) { cls += ' term'; tag = 'End'; }
      else if (t === file) { cls += ' file'; tag = 'L1'; }
      html += '<div class="' + cls + '"><span>' + new Date(t).getUTCDate() + '</span><span class="t">' + tag + '</span></div>';
    }
    cal.innerHTML = html;

    doc.getElementById('cal-cap').textContent =
      (monthName(start) === monthName(end) ? monthName(start) : monthName(start) + ' – ' + monthName(end)) +
      ' ' + new Date(end).getUTCFullYear();
  }

  dateEl.value = todayIso();
  dateEl.addEventListener('change', render);
  dateEl.addEventListener('input', render);
  periodEl.addEventListener('change', render);
  slice.call(doc.querySelectorAll('input[name="method"]')).forEach(function (radio) {
    radio.addEventListener('change', render);
  });
  render();
})();
