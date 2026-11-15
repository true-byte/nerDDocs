// The 'Restore a file' wizard of the backup app: pick a file, pick a day with a copy, confirm, done.
(function () {
  var TODAY = new Date(2026, 10, 14);
  var OLDEST = new Date(2026, 9, 19);
  var MONTHS = [new Date(2026, 9, 1), new Date(2026, 10, 1)];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var PCS = [
    {
      name: 'Office-PC', icon: 'desktop', path: ['Documents', 'Reports'],
      files: [
        ['doc', 'Annual report 2026.docx', '2.4 MB', '11 Nov 2026'],
        ['deck', 'Board meeting Q4.pptx', '18.6 MB', '10 Nov 2026'],
        ['sheet', 'Budget 2027.xlsx', '864 KB', '13 Nov 2026'],
        ['pdf', 'Client contract.pdf', '1.1 MB', '2 Nov 2026'],
        ['text', 'Meeting notes.txt', '12 KB', '13 Nov 2026'],
        ['data', 'Sales by region.csv', '340 KB', '6 Nov 2026'],
        ['video', 'Team offsite.mp4', '248 MB', '22 Oct 2026'],
      ],
      // The office is closed at the weekend, so the PC has a copy on each weekday.
      copy: function (d) { var w = d.getDay(); return w !== 0 && w !== 6; },
    },
    {
      name: 'Home-PC', icon: 'desktop', path: ['Documents', 'Family'],
      files: [
        ['img', 'Beach day.jpg', '4.2 MB', '1 Nov 2026'],
        ['video', 'Birthday party.mp4', '182 MB', '25 Oct 2026'],
        ['pdf', 'Car insurance.pdf', '780 KB', '3 Nov 2026'],
        ['pdf', 'Family tree.pdf', '2.9 MB', '8 Nov 2026'],
        ['img', 'Garden plan.jpg', '3.1 MB', '9 Nov 2026'],
        ['sheet', 'Holiday budget.xlsx', '512 KB', '12 Nov 2026'],
        ['doc', 'Recipes.docx', '310 KB', '14 Nov 2026'],
      ],
      copy: function (d) {
        var away = d.getMonth() === 9 ? [28] : [4, 5, 6];
        return away.indexOf(d.getDate()) < 0;
      },
    },
    {
      name: 'Studio laptop', icon: 'laptop', path: ['Projects', 'Album'],
      files: [
        ['data', 'Album budget.csv', '18 KB', '6 Nov 2026'],
        ['img', 'Cover art.jpg', '7.6 MB', '12 Nov 2026'],
        ['text', 'Lyrics.txt', '8 KB', '13 Nov 2026'],
        ['doc', 'Mix notes.docx', '120 KB', '10 Nov 2026'],
        ['pdf', 'Studio booking.pdf', '620 KB', '29 Oct 2026'],
        ['video', 'Studio session.mp4', '412 MB', '12 Nov 2026'],
        ['sheet', 'Track list.xlsx', '44 KB', '5 Nov 2026'],
      ],
      copy: function (d) {
        var days = d.getMonth() === 9 ? [20, 22, 27, 29] : [3, 5, 10, 12, 13];
        return days.indexOf(d.getDate()) >= 0;
      },
    },
  ];

  var ICONS = {
    check: ['0 0 16 16', '<path d="m3.5 8.3 2.9 2.9 6-6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'],
    chev: ['0 0 16 16', '<path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'],
    'chev-l': ['0 0 16 16', '<path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'],
    desktop: ['0 0 18 18', '<rect x="1.75" y="2.75" width="14.5" height="9.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 15.25h6M9 12.5v2.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'],
    laptop: ['0 0 18 18', '<rect x="3.25" y="3.75" width="11.5" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.25 14.25h15.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'],
    search: ['0 0 16 16', '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'],
    restore: ['0 0 16 16', '<path d="M3.3 9.4a5 5 0 1 0 1.3-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3.6 1.8v3.4H7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'],
  };
  var PAGE = '<path style="fill: color-mix(in srgb, currentColor 13%, transparent); stroke: currentColor" d="M5 1.75h6.6L16 6.15V17a1.25 1.25 0 0 1-1.25 1.25h-9.5A1.25 1.25 0 0 1 4 17V3a1.25 1.25 0 0 1 1-1.25Z" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M11.5 1.9v3.4c0 .5.4.9.9.9h3.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>';
  var GLYPHS = {
    doc: '<path d="M7 10h6M7 12.5h6M7 15h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    sheet: '<path d="M6.8 9.5h6.4v6H6.8zM6.8 12.5h6.4M10 9.5v6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    deck: '<path d="M7.2 15.5v-3M10 15.5V9.5M12.8 15.5v-4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    pdf: '<path d="M7 10.5c2.2 0 4-1.2 4.6-1.9.5-.6-.4-1.3-.8-.5-.7 1.4-1.5 4.2-3.3 6.2-.6.7.2 1.4.9.8 1.5-1.2 3.6-1.6 5.1-1.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
    img: '<path d="m6.6 15.4 2.6-3.3 1.8 2 1.4-1.4 1.6 2.7Z" fill="currentColor"/><circle cx="12.4" cy="9.6" r="1.1" fill="currentColor"/>',
    text: '<path d="M7 10h6M7 12.5h6M7 15h6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>',
    data: '<path d="M7 10h1.6M10.2 10H13M7 12.5h1.6M10.2 12.5H13M7 15h1.6M10.2 15H13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    video: '<path d="M8.6 9.6v5.2l4.3-2.6Z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/>',
  };

  var icon = function (name) { return '<svg viewBox="' + ICONS[name][0] + '" aria-hidden="true">' + ICONS[name][1] + '</svg>'; };
  var fileIcon = function (kind) {
    return '<svg class="ft" viewBox="0 0 20 20" style="--c: var(--t-' + kind + ')" aria-hidden="true">' + PAGE + GLYPHS[kind] + '</svg>';
  };
  var crumbs = function (parts) {
    return '<span class="path">' + parts.map(function (part, at) { return (at ? icon('chev') : '') + '<span>' + part + '</span>'; }).join('') + '</span>';
  };
  var sameDay = function (a, b) { return a && b && a.getTime() === b.getTime(); };
  var dayName = function (d) { return DAY_NAMES[d.getDay()] + ', ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()]; };
  var hasCopy = function (pc, d) { return d >= OLDEST && d <= TODAY && pc.copy(d); };
  var $ = function (id) { return document.getElementById(id); };

  var state = { step: 1, pc: 0, file: 0, month: 1, day: null };
  var pc = function () { return PCS[state.pc]; };
  var file = function () { return state.file === null ? null : pc().files[state.file]; };

  function latestCopy() {
    for (var d = new Date(TODAY); d >= OLDEST; d.setDate(d.getDate() - 1)) if (hasCopy(pc(), d)) return new Date(d);
    return null;
  }

  function chip(withPath) {
    var f = file();
    var path = withPath ? '<small>' + crumbs([pc().name].concat(pc().path)) + '</small>' : '';
    return fileIcon(f[0]) + '<div><b>' + f[1] + '</b>' + path + '</div>';
  }

  function drawPcs() {
    $('pcs').innerHTML = PCS.map(function (one, at) {
      return '<button type="button" class="pc" role="radio" aria-checked="' + (at === state.pc) + '" data-pc="' + at + '">' + icon(one.icon) + one.name + '</button>';
    }).join('');
    $('crumbs').innerHTML = crumbs(pc().path.slice(0, -1).concat(['<b>' + pc().path[pc().path.length - 1] + '</b>']));
    var query = $('query').value.trim().toLowerCase();
    var html = pc().files.map(function (f, at) {
      if (query && f[1].toLowerCase().indexOf(query) < 0) return '';
      return '<button type="button" class="file" role="radio" aria-checked="' + (at === state.file) + '" data-file="' + at + '">' +
        '<span class="name">' + fileIcon(f[0]) + '<span>' + f[1] + '</span></span>' +
        '<span class="num">' + f[2] + '</span><span class="num date">' + f[3] + '</span></button>';
    }).join('');
    $('files').innerHTML = html || '<p class="empty">No files</p>';
  }

  function drawCalendar() {
    var first = MONTHS[state.month];
    $('month').textContent = MONTH_NAMES[first.getMonth()] + ' ' + first.getFullYear();
    $('prev').disabled = state.month === 0;
    $('next-month').disabled = state.month === MONTHS.length - 1;
    var html = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(function (w) { return '<span class="wd">' + w + '</span>'; }).join('');
    var lead = (first.getDay() + 6) % 7;
    var count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    // Six rows on each month, so the wizard keeps its height.
    for (var cell = 0; cell < 42; cell++) {
      var n = cell - lead + 1;
      if (n < 1 || n > count) { html += '<span class="day"></span>'; continue; }
      var d = new Date(first.getFullYear(), first.getMonth(), n);
      var copy = hasCopy(pc(), d);
      var cls = 'day' + (copy ? ' kept' : '') + (d > TODAY ? ' later' : '') + (sameDay(d, TODAY) ? ' today' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + n + '"' + (copy ? '' : ' disabled') +
        ' aria-pressed="' + sameDay(d, state.day) + '" aria-label="' + dayName(d) + ' ' + d.getFullYear() + '"><b>' + n + '</b></button>';
    }
    $('grid').innerHTML = html;
  }

  function drawDay() {
    if (file()) $('chip-2').innerHTML = chip(true);
    $('day-name').textContent = state.day ? dayName(state.day) : '\u00a0';
    $('day-size').textContent = file() ? file()[2] : '';
  }

  function drawSummary() {
    if (!file() || !state.day) return;
    $('chip-3').innerHTML = chip(false);
    var rows = [
      ['PC', pc().name],
      ['Folder', crumbs(pc().path)],
      ['Day', dayName(state.day) + ' ' + state.day.getFullYear()],
      ['Size', file()[2]],
    ];
    $('facts').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
    $('chip-4').innerHTML = chip(true);
    $('done-day').textContent = dayName(state.day) + ' ' + state.day.getFullYear();
  }

  function drawStep() {
    var items = $('steps').children;
    for (var i = 0; i < items.length; i++) {
      items[i].className = i + 1 < state.step ? 'past' : i + 1 === state.step ? 'now' : '';
      if (i + 1 === state.step) items[i].setAttribute('aria-current', 'step'); else items[i].removeAttribute('aria-current');
    }
    for (var s = 1; s <= 4; s++) {
      var section = $('step-' + s);
      section.classList.toggle('on', s === state.step);
      section.inert = s !== state.step;
    }
    var back = $('back');
    var next = $('next');
    back.hidden = state.step === 1 || state.step === 4;
    next.disabled = (state.step === 1 && !file()) || (state.step === 2 && !state.day);
    next.innerHTML = state.step === 3 ? icon('restore') + 'Restore' : state.step === 4 ? 'Restore another' : 'Next';
  }

  function draw() {
    drawPcs();
    drawCalendar();
    drawDay();
    drawSummary();
    drawStep();
  }

  function pickFile(at) {
    state.file = at;
    state.day = latestCopy();
    state.month = state.day ? MONTHS.findIndex(function (m) { return m.getMonth() === state.day.getMonth(); }) : 1;
    draw();
  }

  // A redraw replaces the buttons, so the focus goes to the new button of the same item.
  function refocus(kind, value) {
    var button = document.querySelector('[data-' + kind + '="' + value + '"]');
    if (button) button.focus({ preventScroll: true });
  }

  function restore() {
    var bar = $('bar');
    var quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('next').disabled = true;
    $('back').disabled = true;
    bar.classList.add('run');
    setTimeout(function () {
      bar.classList.remove('run');
      $('back').disabled = false;
      state.step = 4;
      draw();
    }, quick ? 0 : 950);
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest('button');
    if (!target || target.disabled) return;
    if (target.dataset.pc) {
      state.pc = Number(target.dataset.pc);
      $('query').value = '';
      state.file = null;
      state.day = null;
      draw();
      refocus('pc', target.dataset.pc);
    } else if (target.dataset.file) {
      pickFile(Number(target.dataset.file));
      refocus('file', target.dataset.file);
    } else if (target.dataset.day) {
      var first = MONTHS[state.month];
      state.day = new Date(first.getFullYear(), first.getMonth(), Number(target.dataset.day));
      draw();
      refocus('day', target.dataset.day);
    } else if (target.id === 'prev' || target.id === 'next-month') {
      state.month += target.id === 'prev' ? -1 : 1;
      drawCalendar();
    } else if (target.id === 'back') {
      state.step -= 1;
      drawStep();
    } else if (target.id === 'next') {
      if (state.step === 3) return restore();
      if (state.step === 4) { state.step = 1; $('query').value = ''; return pickFile(0); }
      state.step += 1;
      drawStep();
    }
  });

  $('query').addEventListener('input', drawPcs);

  document.querySelectorAll('svg[data-i]').forEach(function (svg) {
    svg.setAttribute('viewBox', ICONS[svg.dataset.i][0]);
    svg.innerHTML = ICONS[svg.dataset.i][1];
  });
  pickFile(0);
})();
