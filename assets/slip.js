/* Essence Slip — order slip behaviour: write lines, tear off to checkout or WhatsApp */
(() => {
  const E = window.Essence || {};
  const S = E.strings || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SERIES_RE = /^seri/i;
  const SIZE_SUFFIX = /-(XXS|XS|S|M|L|XL|XXL|SERI)$/i;

  /* ---------- opening screen: once per visit, skippable ---------- */
  const intro = $('[data-intro]');
  if (intro && !document.documentElement.classList.contains('intro-seen')) {
    try { sessionStorage.setItem('esn-intro', '1'); } catch (e) { /* private mode: show every time */ }
    const skip = () => {
      if (intro.classList.contains('is-skipped')) return;
      intro.classList.add('is-skipped');
      document.documentElement.style.setProperty('--intro-delay', '.05s');
      setTimeout(() => intro.remove(), 400);
    };
    intro.addEventListener('click', skip);
    addEventListener('keydown', skip, { once: true });
    setTimeout(() => intro.isConnected && intro.remove(), 2700);
  }

  const drawer = $('[data-drawer]');
  const linesEl = $('[data-slip-lines]');
  const tpl = $('[data-slip-line-tpl]');
  const toastEl = $('[data-toast]');
  let lastFocus = null;
  let knownKeys = new Set();

  /* ---------- money ---------- */
  function formatMoney(cents, format = E.money || '{{amount}} TL') {
    const n = (cents || 0) / 100;
    const fmt = (v, dec, th, dp) => {
      const [i, d] = v.toFixed(dec).split('.');
      return i.replace(/\B(?=(\d{3})+(?!\d))/g, th) + (d ? dp + d : '');
    };
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => ({
      amount: fmt(n, 2, ',', '.'),
      amount_no_decimals: fmt(n, 0, ',', '.'),
      amount_with_comma_separator: fmt(n, 2, '.', ','),
      amount_no_decimals_with_comma_separator: fmt(n, 0, '.', ',')
    }[k] ?? fmt(n, 2, ',', '.')));
  }

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg, err = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('is-err', err);
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
  }

  /* ---------- cart api ---------- */
  async function api(url, body) {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).description || res.statusText);
    return res.json();
  }
  const getCart = () => api(E.routes.cart);

  /* ---------- rendering the slip ---------- */
  const isSeries = (item) => (item.options_with_values || []).some((o) => SERIES_RE.test(o.value)) || SERIES_RE.test(item.variant_title || '');
  const codeOf = (item) => (item.sku || '').replace(SIZE_SUFFIX, '') || item.product_title;
  const pad = (n, w) => String(n).padStart(w, '0');

  function render(cart, { fresh = false } = {}) {
    const next = new Set();
    linesEl.textContent = '';
    if (!cart.items.length) {
      const li = document.createElement('li');
      li.className = 'drawer__empty';
      li.textContent = S.empty || '';
      linesEl.append(li);
    }
    cart.items.forEach((item, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      const series = isSeries(item);
      node.dataset.key = item.key;
      $('[data-no]', node).textContent = pad(i + 1, 2);
      $('[data-code]', node).textContent = codeOf(item);
      $('[data-title]', node).textContent = item.product_title;
      $('[data-unit]', node).textContent = series
        ? `${item.quantity} ${S.series} = ${item.quantity * 5} ${S.pieces} · ${formatMoney(item.final_line_price)}`
        : `${item.variant_title || ''} · ${item.quantity} ${S.piece} · ${formatMoney(item.final_line_price)}`;
      $('[data-line-qty]', node).value = item.quantity;
      $$('[aria-label]', node).forEach((el) => el.setAttribute('aria-label', `${el.getAttribute('aria-label')}: ${codeOf(item)}`));
      $('[data-line-remove]', node).setAttribute('aria-label', `${S.remove}: ${codeOf(item)}`);
      next.add(item.key);
      if (fresh && !knownKeys.has(item.key)) node.classList.add('is-new');
      linesEl.append(node);
    });
    knownKeys = next;

    const series = cart.items.filter(isSeries).reduce((a, it) => a + it.quantity, 0);
    $$('[data-slip-count]').forEach((el) => (el.textContent = cart.item_count));
    $$('[data-slip-number]').forEach((el) => (el.textContent = `Nº ${pad(cart.item_count, 4)}`));
    const total = $('[data-slip-total]');
    if (total) total.textContent = formatMoney(cart.total_price);

    const empty = !cart.items.length;
    $$('[data-slip-whatsapp]').forEach((a) => a.setAttribute('aria-disabled', empty));
    syncCheckout(empty);
    const rows = cart.items.map((it, i) => {
      const unit = isSeries(it) ? `${it.quantity} ${S.series} (${it.quantity * 5} ${S.pieces})` : `${it.variant_title || ''} × ${it.quantity}`;
      return `${pad(i + 1, 2)}. ${codeOf(it)} — ${it.product_title} — ${unit}`;
    });
    const msg = [`${S.slipTitle} Nº ${pad(cart.item_count, 4)}`, '', ...rows, '', `${series} ${S.series} · ${formatMoney(cart.total_price)}`].join('\n');
    $$('[data-slip-whatsapp]').forEach((wa) => (wa.href = `https://wa.me/${E.whatsapp}?text=${encodeURIComponent(msg)}`));
  }

  /* checkout stays locked until the slip has lines and, for retail, the contract box is ticked */
  let cartEmpty = false;
  function syncCheckout(empty = cartEmpty) {
    cartEmpty = empty;
    $$('[data-slip-checkout]').forEach((a) => {
      const terms = $('[data-terms]', a.parentElement);
      a.setAttribute('aria-disabled', empty || !!(terms && !terms.checked));
    });
  }
  document.addEventListener('change', (e) => {
    if (!e.target.matches('[data-terms]')) return;
    e.target.removeAttribute('aria-invalid');
    const err = $('[data-terms-error]', e.target.closest('.drawer__foot, .cart-page__foot') || document);
    if (err && e.target.checked) err.hidden = true;
    syncCheckout();
  });

  async function refresh(opts) {
    try { render(await getCart(), opts); } catch (e) { /* keep the slip as drawn */ }
  }

  /* ---------- drawer ---------- */
  /* everything behind the open slip is inert, so focus and screen readers stay on the slip */
  const background = () => [...document.body.children].filter((el) => el !== drawer && !el.matches('script, [data-toast], svg'));
  function openSlip() {
    if (!drawer.classList.contains('is-open')) lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    background().forEach((el) => (el.inert = true));
    $$('[data-slip-open]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => $('.drawer__close', drawer).focus());
  }
  function closeSlip() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    background().forEach((el) => (el.inert = false));
    $$('[data-slip-open]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  const status = (msg) => { const s = $('[data-slip-status]'); if (s) s.textContent = msg; };
  const refocus = (key, sel) => {
    const li = linesEl.querySelector(`.sl[data-key="${CSS.escape(key)}"]`);
    const target = (li && $(sel, li)) || $('.drawer__close', drawer);
    target.focus();
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-slip-open]')) { refresh(); openSlip(); }
    if (e.target.closest('[data-slip-close]')) closeSlip();
    const dis = e.target.closest('[aria-disabled="true"]');
    if (dis) {
      e.preventDefault();
      if (dis.matches('[data-slip-checkout]') && !cartEmpty) {
        toast(S.termsNeeded, true);
        const box = $('[data-terms]', dis.parentElement);
        const err = $('[data-terms-error]', dis.parentElement);
        if (err) err.hidden = false;
        if (box) { box.setAttribute('aria-invalid', 'true'); box.focus(); }
      }
    }
    const cookie = e.target.closest('[data-cookie-settings]');
    if (cookie && window.privacyBanner && typeof window.privacyBanner.showPreferences === 'function') {
      e.preventDefault();
      window.privacyBanner.showPreferences();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!drawer.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeSlip();
    if (e.key === 'Tab') {
      const f = $$('a[href], button:not([disabled]), input', $('.drawer__sheet', drawer)).filter((el) => el.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- writing to the slip ---------- */
  async function add(id, quantity, btn) {
    if (!id) return;
    btn && btn.classList.add('is-loading');
    try {
      await api(E.routes.cartAdd, { items: [{ id: Number(id), quantity: Number(quantity) || 1 }] });
      await refresh({ fresh: true });
      openSlip();
      drawer.classList.remove('is-pressed');
      void drawer.offsetWidth;
      drawer.classList.add('is-pressed');
      toast(S.added);
    } catch (err) {
      toast(S.error, true);
    } finally {
      btn && btn.classList.remove('is-loading');
    }
  }

  linesEl && linesEl.addEventListener('click', async (e) => {
    const li = e.target.closest('.sl');
    if (!li) return;
    const input = $('[data-line-qty]', li);
    let q = null;
    const step = e.target.closest('[data-line-step]');
    if (step) q = Math.max(0, Number(input.value) + Number(step.dataset.lineStep));
    if (e.target.closest('[data-line-remove]')) q = 0;
    if (q === null) return;
    const key = li.dataset.key;
    const code = $('[data-code]', li).textContent;
    const sel = step ? `[data-line-step="${step.dataset.lineStep}"]` : '[data-line-remove]';
    try {
      render(await api(E.routes.cartChange, { id: key, quantity: q }));
      refocus(key, sel);
      status(q ? `${code}: ${q}` : `${code}: ${S.removed}`);
    } catch (_) { toast(S.error, true); }
  });
  linesEl && linesEl.addEventListener('change', async (e) => {
    const li = e.target.closest('.sl');
    if (!li || !e.target.matches('[data-line-qty]')) return;
    const key = li.dataset.key;
    const q = Math.max(0, Number(e.target.value) || 0);
    try {
      render(await api(E.routes.cartChange, { id: key, quantity: q }));
      refocus(key, '[data-line-qty]');
      status(`${$('[data-code]', li).textContent}: ${q || S.removed}`);
    } catch (_) { toast(S.error, true); }
  });

  /* quick add from the season lines */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick-add]');
    if (b) add(b.dataset.quickAdd, b.dataset.qty, b);
  });

  /* steppers on product forms */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const input = $('input[type="number"]', b.parentElement);
    input.value = Math.max(1, (Number(input.value) || 1) + Number(b.dataset.step));
  });

  /* hero / product form: series vs retail */
  $$('[data-slip-form]').forEach((form) => {
    const variant = $('[data-variant-input]', form);
    const seriesId = variant.dataset.seriesId;
    const row = $('.hero__actions .row', form);
    const apply = $('[data-apply-link]', form);
    const sync = () => {
      const mode = ($('[data-mode]:checked', form) || {}).value || 'series';
      $$('[data-panel]', form).forEach((p) => (p.hidden = p.dataset.panel !== mode));
      const lockedSeries = mode === 'series' && !E.wholesale;
      if (row) row.hidden = lockedSeries;
      if (apply) apply.hidden = !lockedSeries;
      const inline = $('[data-apply-inline]', form);
      if (inline) inline.hidden = lockedSeries;
      const picked = $('[data-retail-variant]:checked', form);
      variant.value = mode === 'series' ? seriesId : picked ? picked.value : '';
    };
    form.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!variant.value) {
        toast(form.querySelector('.sizes') ? S.chooseSize : S.error, true);
        const first = $('[data-retail-variant]:not(:disabled)', form);
        first && first.focus();
        return;
      }
      add(variant.value, $('input[name="quantity"]', form).value, $('[data-add]', form));
    });
  });

  /* season list filter by code prefix */
  $$('[data-lines]').forEach((sec) => {
    const btns = $$('[data-filter]', sec);
    /* drop filters that would show nothing in this list */
    const codes = $$('[data-line]', sec).map((l) => (l.dataset.code || '').toUpperCase());
    btns.forEach((b) => {
      if (b.dataset.filter === '*') return;
      const pre = b.dataset.filter.split(',').map((x) => x.trim().toUpperCase() + '-');
      const n = codes.filter((c) => pre.some((p) => c.startsWith(p))).length;
      if (!n || n === codes.length) b.hidden = true;
    });
    const group = $('.lines__filter', sec);
    if (group && btns.filter((b) => !b.hidden).length < 2) group.hidden = true;
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const pre = b.dataset.filter === '*' ? null : b.dataset.filter.split(',').map((s) => s.trim().toUpperCase());
      let shown = 0;
      $$('[data-line]', sec).forEach((l) => {
        l.hidden = !!pre && !pre.some((p) => (l.dataset.code || '').toUpperCase().startsWith(p + '-'));
        if (!l.hidden) shown++;
      });
      const count = $('[data-count]', sec);
      if (count) count.textContent = shown;
    }));

    /* sort the rows in place; line numbers follow the new order */
    const sort = $('[data-sort]', sec);
    const table = $('[data-table]', sec);
    if (sort && table) {
      const rows = $$('[data-line]', table);
      rows.forEach((r, i) => (r.dataset.index = i));
      sort.addEventListener('change', () => {
        const by = sort.value;
        const sorted = rows.slice().sort((a, b) => {
          if (by === 'code') return a.dataset.code.localeCompare(b.dataset.code, 'tr', { numeric: true });
          if (by === 'price-asc') return a.dataset.price - b.dataset.price;
          if (by === 'price-desc') return b.dataset.price - a.dataset.price;
          return a.dataset.index - b.dataset.index;
        });
        sorted.forEach((r, i) => { $('.line__no', r).textContent = pad(i + 1, 2); table.append(r); });
      });
    }
  });

  /* product photo zoom: a native dialog with a snap track */
  const zoom = $('[data-zoom-dialog]');
  if (zoom && zoom.showModal) {
    const track = $('[data-zoom-track]', zoom);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-zoom]');
      if (b) {
        zoom.showModal();
        const fig = track.children[Number(b.dataset.zoom)];
        fig && fig.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
      if (e.target.closest('[data-zoom-close]') || e.target === zoom) zoom.close();
    });
  }

  refresh();
})();
