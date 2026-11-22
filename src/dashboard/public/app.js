(function () {
  // auto-hide flash
  const flash = document.getElementById('flash');
  if (flash) setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 400); }, 4000);

  // multi-select filter
  document.querySelectorAll('[data-multi]').forEach((box) => {
    const input = box.querySelector('.multi-filter');
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      box.querySelectorAll('.multi-item').forEach((it) => { it.style.display = it.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });

  // table filter
  document.querySelectorAll('.table-filter').forEach((input) => {
    const table = document.getElementById(input.dataset.target);
    if (!table) return;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      table.querySelectorAll('tbody tr').forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });

  // dynamic rows (rewards, role panel roles)
  document.querySelectorAll('[data-add-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = document.getElementById(btn.dataset.addRow);
      const rows = wrap.children;
      if (rows.length >= 25) return;
      const clone = rows[rows.length - 1].cloneNode(true);
      clone.querySelectorAll('input').forEach((i) => { i.value = ''; });
      clone.querySelectorAll('select').forEach((s) => { s.selectedIndex = 0; });
      wrap.appendChild(clone);
    });
  });
  document.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-row]');
    if (!rm) return;
    const row = rm.parentElement;
    if (row.parentElement.children.length > 1) row.remove();
    else { row.querySelectorAll('input').forEach((i) => { i.value = ''; }); row.querySelectorAll('select').forEach((s) => { s.selectedIndex = 0; }); }
  });

  // disabled commands (checked = enabled)
  document.querySelectorAll('.cmd-toggle').forEach((cb) => {
    cb.addEventListener('change', () => {
      const label = cb.closest('.cmd-item');
      const hidden = label.querySelector('input[type=hidden]');
      if (!cb.checked && !hidden) {
        const h = document.createElement('input');
        h.type = 'hidden'; h.name = 'disabledCommands'; h.value = cb.dataset.name;
        label.appendChild(h);
      } else if (cb.checked && hidden) hidden.remove();
    });
  });

  // edit custom command
  document.querySelectorAll('[data-edit-cc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('cc-trigger').value = btn.dataset.trigger;
      document.getElementById('cc-response').value = btn.dataset.response;
      document.getElementById('cc-trigger').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // embed live preview
  const form = document.getElementById('msg-form');
  if (form) {
    const $ = (id) => document.getElementById(id);
    const update = () => {
      const f = form.elements;
      $('pv-content').textContent = f.content.value;
      const useEmbed = f.useEmbed.checked;
      $('pv-embed').style.display = useEmbed && (f.title.value || f.description.value || f.image.value) ? 'flex' : 'none';
      $('pv-embed').style.borderLeftColor = f.color.value;
      $('pv-title').textContent = f.title.value;
      $('pv-description').textContent = f.description.value;
      $('pv-footer').textContent = f.footer.value;
      ['image', 'thumbnail'].forEach((k) => {
        const img = $(`pv-${k}`);
        if (/^https?:\/\//.test(f[k].value)) { img.src = f[k].value; img.hidden = false; } else img.hidden = true;
      });
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  }
})();
