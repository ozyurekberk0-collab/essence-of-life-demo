/* Static demo only: stands in for Shopify's AJAX cart, search and contact form, so the exported site works without a server.
   The slip is kept in this browser's localStorage. Never part of the Shopify theme. */
(() => {
  const D = window.EssenceDemo || { variants: {}, prefix: '', lang: 'tr' };
  const KEY = 'esn-demo-cart';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const save = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* private mode: cart lasts this page */ } };
  let cart = load();

  const cartJSON = () => {
    const items = cart.filter((l) => D.variants[l.id]).map(({ id, quantity }) => {
      const v = D.variants[id];
      return {
        key: `${id}:k`, id, quantity, product_title: v.product_title, variant_title: v.title, sku: v.sku,
        options_with_values: [{ name: 'Birim', value: v.title }], price: v.price, final_line_price: v.price * quantity
      };
    });
    return { items, item_count: items.reduce((a, i) => a + i.quantity, 0), total_price: items.reduce((a, i) => a + i.final_line_price, 0) };
  };
  const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, opts = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const p = url.pathname;
    const body = () => { try { return JSON.parse(opts.body || '{}'); } catch (e) { return {}; } };
    if (p.endsWith('/cart.js')) return reply(cartJSON());
    if (p.endsWith('/cart/add.js')) {
      for (const it of body().items || []) {
        if (!D.variants[it.id]) return reply({ status: 422, description: 'Not found' }, 422);
        const line = cart.find((l) => l.id === it.id);
        line ? (line.quantity += it.quantity || 1) : cart.push({ id: it.id, quantity: it.quantity || 1 });
      }
      save(cart);
      return reply({ items: body().items });
    }
    if (p.endsWith('/cart/change.js')) {
      const { id, quantity } = body();
      const vid = Number(String(id).split(':')[0]);
      cart = cart.map((l) => (l.id === vid ? { ...l, quantity } : l)).filter((l) => l.quantity > 0);
      save(cart);
      return reply(cartJSON());
    }
    return realFetch(input, opts);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const local = location.pathname.slice((D.base || '').length).replace(/\.html$/, '').replace(/\/index$/, '') || '/';
    const page = local.replace(/^\/(en|toptan)(?=\/|$)/, '') || '/';

    // the slip page opens the slip drawer (the full-page cart needs a server)
    if (page === '/cart') setTimeout(() => { const b = document.querySelector('[data-slip-open]'); b && b.click(); }, 300);

    // search filters the pre-rendered list of every product
    if (page === '/search') {
      const q = (new URLSearchParams(location.search).get('q') || '').trim();
      const n = q.toLocaleLowerCase(D.lang);
      const input = document.querySelector('.search__form input[name="q"]');
      if (input) input.value = q;
      const rows = [...document.querySelectorAll('.search [data-line]')];
      const table = document.querySelector('.search .table');
      const count = document.querySelector('.search__count');
      if (!q) { if (table) table.hidden = true; if (count) count.hidden = true; return; }
      let shown = 0;
      rows.forEach((r) => {
        const hay = `${r.dataset.code} ${r.dataset.title} ${r.textContent}`.toLocaleLowerCase(D.lang);
        r.hidden = !hay.includes(n);
        if (!r.hidden) shown++;
      });
      if (count) count.textContent = D.lang === 'en' ? `${shown} lines for "${q}"` : `"${q}" için ${shown} satır`;
      if (!shown && table) {
        const p = document.createElement('p');
        p.className = 'hand';
        p.style.cssText = 'font-size:26px;padding:24px 0';
        p.textContent = D.lang === 'en' ? `No code matches "${q}". Try the E50-12 format.` : `"${q}" ile eşleşen kod yok. Kodu E50-12 biçiminde yazmayı deneyin.`;
        table.append(p);
      }
    }

    // the wholesale application cannot be sent from a static demo
    document.querySelectorAll('form[action$="/contact"]').forEach((form) => form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const msg = document.createElement('p');
      msg.className = 'form-msg form-msg--ok';
      msg.setAttribute('role', 'status');
      msg.textContent = D.lang === 'en' ? 'Demo: in the live store this application reaches the showroom team.' : 'Demo: canlı mağazada bu başvuru showroom ekibine ulaşır.';
      form.prepend(msg);
      msg.scrollIntoView({ block: 'center' });
    }));
  });
})();
