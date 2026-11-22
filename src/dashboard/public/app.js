(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // toast
  const toast = $('#toast');
  if (toast) setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 400); }, 4500);

  // mobile sidebar
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-side]')) document.body.classList.add('side-open');
    else if (e.target.closest('[data-close-side]')) document.body.classList.remove('side-open');
  });

  // multi-select filter
  $$('[data-multi]').forEach((box) => {
    const input = $('.multi-filter', box);
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      $$('.multi-item', box).forEach((it) => { it.style.display = it.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });

  // table filter
  $$('.table-filter').forEach((input) => {
    const table = document.getElementById(input.dataset.target);
    if (!table) return;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      $$('tbody tr', table).forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });

  // dynamic rows
  $$('[data-add-row]').forEach((btn) => btn.addEventListener('click', () => {
    const wrap = document.getElementById(btn.dataset.addRow);
    if (wrap.children.length >= 25) return;
    const clone = wrap.lastElementChild.cloneNode(true);
    $$('input', clone).forEach((i) => { i.value = ''; });
    $$('select', clone).forEach((s) => { s.selectedIndex = 0; });
    wrap.appendChild(clone);
  }));
  document.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-row]');
    if (!rm) return;
    const row = rm.parentElement;
    if (row.parentElement.children.length > 1) row.remove();
    else { $$('input', row).forEach((i) => { i.value = ''; }); $$('select', row).forEach((s) => { s.selectedIndex = 0; }); }
  });

  // disabled commands (checked = enabled)
  $$('.cmd-toggle').forEach((cb) => cb.addEventListener('change', () => {
    const label = cb.closest('.cmd-item');
    const hidden = $('input[type=hidden]', label);
    if (!cb.checked && !hidden) {
      const h = document.createElement('input');
      h.type = 'hidden'; h.name = 'disabledCommands'; h.value = cb.dataset.name;
      label.appendChild(h);
    } else if (cb.checked && hidden) hidden.remove();
  }));

  // module presets
  const modCount = $('#modCount');
  const updateCount = () => { if (modCount) modCount.textContent = $$('input[name=modules]:checked').length; };
  $$('input[name=modules]').forEach((cb) => cb.addEventListener('change', updateCount));
  $$('[data-mods]').forEach((btn) => btn.addEventListener('click', () => {
    const v = btn.dataset.mods;
    const set = v === 'all' ? null : new Set(v === 'none' ? [] : v.split(','));
    $$('input[name=modules]').forEach((cb) => { cb.checked = set ? set.has(cb.value) : true; });
    updateCount();
  }));

  // edit custom command
  $$('[data-edit-cc]').forEach((btn) => btn.addEventListener('click', () => {
    $('#cc-trigger').value = btn.dataset.trigger;
    $('#cc-response').value = btn.dataset.response;
    if ($('#cc-type')) $('#cc-type').value = btn.dataset.type || 'command';
    if ($('#cc-reaction')) $('#cc-reaction').value = btn.dataset.reaction || '';
    $('#cc-trigger').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));

  // loading buttons
  $$('[data-loading]').forEach((btn) => btn.form && btn.form.addEventListener('submit', () => {
    setTimeout(() => { btn.disabled = true; btn.textContent = btn.dataset.loading; }, 0);
  }));

  // embed preview
  const form = $('#msg-form');
  if (form) {
    const update = () => {
      const f = form.elements;
      $('#pv-content').textContent = f.content.value;
      $('#pv-embed').style.display = f.useEmbed.checked && (f.title.value || f.description.value || f.image.value) ? 'flex' : 'none';
      $('#pv-embed').style.borderLeftColor = f.color.value;
      $('#pv-title').textContent = f.title.value;
      $('#pv-description').textContent = f.description.value;
      $('#pv-footer').textContent = f.footer.value;
      ['image', 'thumbnail'].forEach((k) => {
        const img = $('#pv-' + k);
        if (/^https?:\/\//.test(f[k].value)) { img.src = f[k].value; img.hidden = false; } else img.hidden = true;
      });
    };
    form.addEventListener('input', update); form.addEventListener('change', update); update();
  }

  // live console
  const con = $('#console');
  if (con) {
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    con.scrollTop = con.scrollHeight;
    setInterval(async () => {
      const r = await fetch('/bots/' + con.dataset.bot + '/status.json').catch(() => null);
      if (!r || !r.ok) return;
      const { logs } = await r.json();
      const atBottom = con.scrollHeight - con.scrollTop - con.clientHeight < 40;
      con.innerHTML = logs.map((l) => '<div class="log-line log-' + l.level + '"><time>' + new Date(l.t).toLocaleTimeString('hr-HR') + '</time><b>' + l.level + '</b><span>' + esc(l.msg) + '</span></div>').join('') || '<div class="muted">Nema zapisa.</div>';
      if (atBottom) con.scrollTop = con.scrollHeight;
    }, 3000);
  }

  // count-up numbers on landing
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!target) return;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 1200);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('hr-HR');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
})();
