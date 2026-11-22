(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = {};
  $$('#paletteLabels [data-k]').forEach((el) => { L[el.dataset.k] = el.textContent; });

  // ---------------------------------------------------------------- toast
  const toast = $('#toast');
  if (toast) setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 400); }, 4800);

  // ---------------------------------------------------------------- sidebar + popovers
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-side]')) document.body.classList.add('side-open');
    else if (e.target.closest('[data-close-side]')) document.body.classList.remove('side-open');
    $$('details.pop[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  // ---------------------------------------------------------------- theme + accent hue
  const paintPrefs = () => {
    const theme = store.get('theme') || 'auto';
    $$('[data-theme-set]').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === theme));
    const hue = store.get('hue') || '268';
    $$('[data-hue]').forEach((b) => b.classList.toggle('on', b.dataset.hue === hue));
  };
  const setTheme = (t) => {
    if (t === 'auto') { root.removeAttribute('data-theme'); store.set('theme', null); } else { root.setAttribute('data-theme', t); store.set('theme', t); }
    paintPrefs();
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme-set]');
    if (t) setTheme(t.dataset.themeSet);
    const h = e.target.closest('[data-hue]');
    if (h) { root.style.setProperty('--h', h.dataset.hue); store.set('hue', h.dataset.hue); paintPrefs(); }
  });
  paintPrefs();

  // ---------------------------------------------------------------- spotlight that follows the pointer
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // ---------------------------------------------------------------- forms: confirm, autosubmit, loading, dirty state
  document.addEventListener('submit', (e) => {
    const f = e.target;
    const msg = f.dataset.confirm || (e.submitter && e.submitter.dataset.confirm);
    if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
    const btn = e.submitter && e.submitter.dataset.loading ? e.submitter : null;
    if (btn) setTimeout(() => { btn.disabled = true; btn.textContent = btn.dataset.loading; }, 0);
    f.dataset.submitting = '1';
  }, true);
  document.addEventListener('change', (e) => { if (e.target.matches('[data-autosubmit]')) e.target.form.requestSubmit(); });
  $$('form').forEach((f) => {
    const bar = $('.savebar', f);
    if (!bar) return;
    const mark = () => bar.classList.add('dirty');
    f.addEventListener('input', mark); f.addEventListener('change', mark);
  });
  window.addEventListener('beforeunload', (e) => {
    if ($$('.savebar.dirty').some((b) => !b.closest('form').dataset.submitting)) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------------------------------------------------------------- filters + dynamic rows
  $$('[data-multi]').forEach((box) => {
    const input = $('.multi-filter', box);
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      $$('.multi-item', box).forEach((it) => { it.style.display = it.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });
  $$('.table-filter').forEach((input) => {
    const table = document.getElementById(input.dataset.target);
    if (!table) return;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      $$('tbody tr', table).forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });
  $$('[data-add-row]').forEach((btn) => btn.addEventListener('click', () => {
    const wrap = document.getElementById(btn.dataset.addRow);
    if (wrap.children.length >= 25) return;
    const clone = wrap.lastElementChild.cloneNode(true);
    $$('input', clone).forEach((i) => { i.value = ''; });
    $$('select', clone).forEach((s) => { s.selectedIndex = 0; });
    wrap.appendChild(clone);
    wrap.closest('form')?.dispatchEvent(new Event('input'));
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
    btn.closest('form')?.dispatchEvent(new Event('change'));
  }));

  // edit custom command
  $$('[data-edit-cc]').forEach((btn) => btn.addEventListener('click', () => {
    $('#cc-trigger').value = btn.dataset.trigger;
    $('#cc-response').value = btn.dataset.response;
    if ($('#cc-type')) $('#cc-type').value = btn.dataset.type || 'command';
    if ($('#cc-reaction')) $('#cc-reaction').value = btn.dataset.reaction || '';
    $('#cc-trigger').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        if (/^https:\/\//.test(f[k].value)) { img.src = f[k].value; img.hidden = false; } else img.hidden = true;
      });
    };
    form.addEventListener('input', update); form.addEventListener('change', update); update();
  }

  // count-up numbers
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!target) return;
    const start = performance.now();
    const fmt = new Intl.NumberFormat(root.lang);
    const step = (t) => {
      const p = Math.min(1, (t - start) / 1400);
      el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // ---------------------------------------------------------------- live updates (Server-Sent Events)
  const live = $('[data-live-indicator]');
  if (live && window.EventSource) {
    const STATUS_TEXT = {};
    $$('[data-bot-status-text]').forEach((el) => { STATUS_TEXT[el.textContent.trim()] = true; });
    const es = new EventSource('/api/stream');
    es.addEventListener('hello', () => live.classList.add('on'));
    es.onerror = () => live.classList.remove('on');
    const nf = new Intl.NumberFormat(root.lang);
    es.addEventListener('status', (e) => {
      const d = JSON.parse(e.data);
      $$(`[data-bot-dot="${d.id}"]`).forEach((el) => { el.className = `dot dot-${d.status}`; });
      $$(`[data-bot-status="${d.id}"]`).forEach((el) => { el.className = `status status-${d.status}`; el.textContent = d.status; });
      $$(`[data-bot-guilds="${d.id}"]`).forEach((el) => { el.textContent = nf.format(d.guilds); });
      $$(`[data-bot-members="${d.id}"]`).forEach((el) => { el.textContent = nf.format(d.members); });
      $$(`[data-bot-ping="${d.id}"]`).forEach((el) => { el.textContent = d.ping != null ? `${d.ping} ms` : '—'; });
    });
    es.addEventListener('log', (e) => {
      const d = JSON.parse(e.data);
      $$(`[data-console="${d.id}"]`).forEach((box) => {
        const line = document.createElement('div');
        line.className = `log-line log-${d.level} fresh`;
        line.innerHTML = `<time>${new Date(d.t).toLocaleTimeString(root.lang)}</time>${box.hasAttribute('data-mini') ? '' : `<b>${esc(d.level)}</b>`}<span>${esc(d.msg)}</span>`;
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        if (box.hasAttribute('data-mini')) box.prepend(line); else box.append(line);
        const max = Number(box.dataset.max || 200);
        while (box.children.length > max) (box.hasAttribute('data-mini') ? box.lastElementChild : box.firstElementChild).remove();
        if (!box.hasAttribute('data-mini') && atBottom) box.scrollTop = box.scrollHeight;
      });
    });
    window.addEventListener('beforeunload', () => es.close());
  }
  const con = $('#console');
  if (con) con.scrollTop = con.scrollHeight;

  // ---------------------------------------------------------------- command palette (Ctrl/Cmd + K)
  const pal = $('#palette');
  if (pal) {
    const input = $('#paletteInput');
    const listEl = $('#paletteList');
    let items = null; let sel = 0; let shown = [];
    const pages = [
      { type: 'page', label: L.app, url: '/app', icon: 'grid' },
      { type: 'page', label: L.new, url: '/app/new', icon: 'plus' },
      { type: 'page', label: L.account, url: '/account', icon: 'shield-check' },
      { type: 'page', label: L.catalog, url: '/catalog', icon: 'book' },
      { type: 'page', label: L.pricing, url: '/pricing', icon: 'crown' },
      { type: 'page', label: L.status, url: '/status', icon: 'activity' },
      { type: 'action', label: L.theme, action: () => setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'), icon: 'moon' },
    ];
    if (L.isAdmin) pages.push({ type: 'page', label: L.admin, url: '/admin', icon: 'crown' });
    // pages of the current server, taken from the sidebar
    $$('.side-section .side-nav a').forEach((a) => pages.push({ type: 'page', label: a.textContent.trim(), url: a.getAttribute('href'), icon: a.querySelector('use')?.getAttribute('href').slice(3) || 'arrow-right' }));
    const icon = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;
    const groupName = { page: L.pages, action: L.pages, bot: L.bots, server: L.servers };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const all = [...pages, ...(items || [])];
      shown = all.filter((it) => !q || it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q)).slice(0, 40);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      let html = ''; let last = '';
      shown.forEach((it, i) => {
        const g = groupName[it.type];
        if (g !== last) { html += `<div class="palette-group">${esc(g)}</div>`; last = g; }
        const ico = it.icon || (it.type === 'bot' ? 'bot' : it.type === 'server' ? 'server' : 'arrow-right');
        html += `<div class="palette-item${i === sel ? ' sel' : ''}" data-i="${i}">${icon(ico)}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</div>`;
      });
      listEl.innerHTML = html || `<div class="palette-group">${esc(L.empty)}</div>`;
      listEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    };
    const open = async () => {
      pal.classList.add('open'); input.value = ''; sel = 0; render(); input.focus();
      if (!items) {
        const r = await fetch('/api/palette', { headers: { Accept: 'application/json' } }).catch(() => null);
        items = r && r.ok ? (await r.json()).items : [];
        render();
      }
    };
    const close = () => pal.classList.remove('open');
    const go = (it) => { if (!it) return; close(); if (it.action) it.action(); else location.href = it.url; };
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.contains('open') ? close() : open(); return; }
      if (!pal.classList.contains('open')) { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); open(); } return; }
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
    });
    input.addEventListener('input', () => { sel = 0; render(); });
    listEl.addEventListener('click', (e) => { const el = e.target.closest('[data-i]'); if (el) go(shown[Number(el.dataset.i)]); });
    pal.addEventListener('click', (e) => { if (e.target === pal) close(); });
    $$('[data-palette-open]').forEach((b) => b.addEventListener('click', open));
  }

  // ---------------------------------------------------------------- AI support widget
  const sup = $('#sup');
  if (sup) {
    const panel = $('.sup-panel', sup);
    const body = $('[data-sup-body]', sup);
    const form = $('[data-sup-form]', sup);
    const input = $('input', form);
    const csrf = sup.dataset.csrf;
    const history = [];
    let busy = false;
    const openSup = () => { sup.classList.add('open'); panel.hidden = false; input.focus(); };
    const closeSup = () => { sup.classList.remove('open'); panel.hidden = true; };
    $$('[data-sup-open]', sup).forEach((b) => b.addEventListener('click', openSup));
    $$('[data-sup-close]', sup).forEach((b) => b.addEventListener('click', closeSup));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sup.classList.contains('open')) closeSup(); });
    const add = (role, text) => {
      const el = document.createElement('div');
      el.className = 'sup-msg ' + (role === 'user' ? 'me' : 'bot');
      el.textContent = text;
      body.appendChild(el); body.scrollTop = body.scrollHeight;
      return el;
    };
    fetch('/api/support/meta').then((r) => r.json()).then((m) => { const b = $('[data-sup-badge]', sup); if (b) b.textContent = m.ai ? 'AI' : 'FAQ'; }).catch(() => {});
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || busy) return;
      busy = true; input.value = '';
      add('user', q);
      history.push({ role: 'user', content: q });
      const typing = add('bot', '…'); typing.classList.add('typing');
      try {
        const r = await fetch('/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _csrf: csrf, history }) });
        const data = await r.json();
        typing.remove();
        add('bot', data.reply || (data.error ? 'Greška: ' + data.error : 'Greška.'));
        if (data.reply) history.push({ role: 'assistant', content: data.reply });
      } catch (err) { typing.remove(); add('bot', 'Veza nije uspjela. Pokušaj ponovo.'); }
      busy = false; input.focus();
    });
  }
})();
