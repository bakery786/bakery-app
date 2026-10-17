(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var n = function (v) { return Number(v) || 0; };
  var sum = function (arr, f) { return arr.reduce(function (s, x) { return s + n(f(x)); }, 0); };
  var inc = function (v) { return firebase.firestore.FieldValue.increment(v); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  if (!window.configured) {
    $('#login').innerHTML = '<div class="card"><h2>Setup needed</h2><p>Paste your Firebase config into <code>public/firebase-config.js</code>. See README.md.</p></div>';
    return;
  }
  var auth = firebase.auth();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(function () { }); } catch (e) { /* ignore */ }

  var NAMES = ['orders', 'products', 'materials', 'assets', 'invoices', 'expenses', 'customers'];
  var S = { shop: Object.assign({}, DEFAULT_SHOP) };
  NAMES.forEach(function (k) { S[k] = []; });
  var ST = { tab: 'orders', of: 'active', inv: 'all', rep: { p: 'month', from: '', to: '' } };
  var unsubs = [], ready = {}, modalDelete = null;
  var TABS = [['orders', 'Orders'], ['invoices', 'Invoices'], ['products', 'Products'], ['materials', 'Raw material'], ['assets', 'Tools & assets'], ['money', 'Expenses & loss'], ['customers', 'Customers'], ['reports', 'Reports'], ['settings', 'Settings']];
  var COLL = { product: 'products', material: 'materials', asset: 'assets', expense: 'expenses', customer: 'customers' };
  var NEXT = { 'new': ['confirmed', 'Confirm'], confirmed: ['baking', 'Start baking'], baking: ['ready', 'Mark ready'], ready: ['delivered', 'Delivered'] };

  // ---------- helpers ----------
  function fld(label, name, val, attrs) {
    return '<label class="f"><span>' + label + '</span><input name="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || '') + '></label>';
  }
  function chk(label, name, on) {
    return '<label class="f chk"><input type="checkbox" name="' + name + '" ' + (on ? 'checked' : '') + '><span>' + label + '</span></label>';
  }
  function sel(label, name, opts, val) {
    return '<label class="f"><span>' + label + '</span><select name="' + name + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '" ' + (o[0] === val ? 'selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></label>';
  }
  var NUM = 'type="number" step="any" min="0" inputmode="decimal"';
  function imgField(cur, label) {
    return '<div class="f imgf"><span class="lbl">' + label + '</span><div class="row gap"><img id="imgprev" class="thumb lg" ' + (cur ? 'src="' + esc(cur) + '"' : 'hidden') + ' alt="">' +
      '<label class="btn">Choose photo<input id="imgin" type="file" accept="image/*" hidden></label><button type="button" class="btn ghost" data-a="imgclear">Remove</button></div>' +
      '<input type="hidden" name="img" id="imgval" value="' + esc(cur || '') + '"></div>';
  }
  function thumb(rec) { return rec && rec.img ? '<img class="thumb" src="' + esc(rec.img) + '" alt="">' : ''; }
  function findByName(list, name) {
    var q = String(name || '').trim().toLowerCase();
    return list.filter(function (x) { return String(x.name).trim().toLowerCase() === q; })[0];
  }
  function mergeLines(lines) {
    var map = {}, out = [];
    lines.forEach(function (l) {
      var k = l.name.toLowerCase();
      if (map[k]) { map[k].qty += l.qty; map[k].rate = l.rate; } else { map[k] = Object.assign({}, l); out.push(map[k]); }
    });
    return out;
  }
  function invDue(i) { return n(i.total) - n(i.paid); }
  function save(col, id, data) {
    if (id) return db.collection(col).doc(id).set(data, { merge: true });
    return db.collection(col).add(Object.assign({ createdMs: Date.now() }, data));
  }

  // ---------- modal ----------
  function closeModal() { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; modalDelete = null; }
  function modal(title, body, onSubmit, opts) {
    opts = opts || {};
    modalDelete = opts.onDelete || null;
    var root = $('#modal');
    root.innerHTML = '<div class="sheet"><div class="sh-h"><b>' + title + '</b><button class="x" data-close>✕</button></div><form id="mf">' + body +
      '<div class="sh-f">' + (modalDelete ? '<button type="button" class="btn bad" data-a="mdel">Delete</button>' : '') +
      (onSubmit ? '<button class="btn pri" type="submit">' + (opts.saveLabel || 'Save') + '</button>' : '') + '</div></form></div>';
    root.classList.add('open');
    var f = $('#mf');
    f.onsubmit = async function (e) {
      e.preventDefault();
      if (!onSubmit) return;
      var btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
      try { await onSubmit(new FormData(f), f); closeModal(); }
      catch (err) { console.error(err); toast('Error: ' + (err.message || err)); if (btn) btn.disabled = false; }
    };
    return f;
  }

  // ---------- numbering ----------
  async function nextNo(kind) {
    var ref = db.doc('meta/counter');
    var num = await db.runTransaction(async function (t) {
      var d = await t.get(ref), v = ((d.exists && d.data()[kind]) || 0) + 1;
      if (d.exists) t.update(ref, (function () { var o = {}; o[kind] = v; return o; })());
      else { var o = { orders: 0, sale: 0, purchase: 0 }; o[kind] = v; t.set(ref, o); }
      return v;
    });
    return (kind === 'sale' ? 'S-' : 'P-') + String(num).padStart(4, '0');
  }

  // ---------- invoice creation ----------
  async function createInvoice(o, extra) {
    var lines = mergeLines(o.lines);
    if (!lines.length) throw new Error('Add at least one item');
    var total = sum(lines, function (l) { return l.qty * l.rate; });
    var paid = Math.min(Math.max(n(o.paid), 0), total);
    var no = await nextNo(o.type);
    var b = db.batch(), iref = db.collection('invoices').doc();
    var phone = normPhone(o.phone || '');
    b.set(iref, {
      type: o.type, no: no, party: o.party, phone: phone, date: o.date, lines: lines, total: total, paid: paid,
      kind: o.kind || '', note: o.note || '', orderId: o.orderId || '', img: o.img || '', createdMs: Date.now()
    });
    if (o.type === 'sale') {
      lines.forEach(function (l) {
        var p = (l.pid && S.products.filter(function (x) { return x.id === l.pid; })[0]) || findByName(S.products, l.name);
        if (p && p.trackStock) b.update(db.doc('products/' + p.id), { stock: inc(-l.qty) });
      });
      if (phone && !S.customers.filter(function (c) { return c.id === phone; })[0]) {
        b.set(db.doc('customers/' + phone), { name: o.party, phone: phone, address: '', createdMs: Date.now() });
      }
    } else if (o.kind === 'asset') {
      lines.forEach(function (l) {
        b.set(db.collection('assets').doc(), { name: l.name, qty: l.qty, cost: l.rate, date: o.date, invoiceId: iref.id, note: 'From ' + no, createdMs: Date.now() });
      });
    } else {
      lines.forEach(function (l) {
        var m = findByName(S.materials, l.name);
        if (m) b.update(db.doc('materials/' + m.id), { qty: inc(l.qty), cost: l.rate });
        else b.set(db.collection('materials').doc(), { name: l.name, unit: '', qty: l.qty, cost: l.rate, low: 0, createdMs: Date.now() });
      });
    }
    if (extra) extra(b, iref);
    await b.commit();
    return iref;
  }

  async function deleteInvoice(id) {
    var inv = S.invoices.filter(function (i) { return i.id === id; })[0]; if (!inv) return;
    var b = db.batch();
    (inv.lines || []).forEach(function (l) {
      if (inv.type === 'sale') {
        var p = (l.pid && S.products.filter(function (x) { return x.id === l.pid; })[0]) || findByName(S.products, l.name);
        if (p && p.trackStock) b.update(db.doc('products/' + p.id), { stock: inc(l.qty) });
      } else if (inv.kind !== 'asset') {
        var m = findByName(S.materials, l.name);
        if (m) b.update(db.doc('materials/' + m.id), { qty: inc(-l.qty) });
      }
    });
    if (inv.kind === 'asset') S.assets.filter(function (a) { return a.invoiceId === id; }).forEach(function (a) { b.delete(db.doc('assets/' + a.id)); });
    b.delete(db.doc('invoices/' + id));
    await b.commit();
  }

  // ---------- forms ----------
  var FORMS = {
    product: function (p) {
      p = p || { active: true, unit: 'pc' };
      modal(p.id ? 'Edit product' : 'New product',
        fld('Name', 'name', p.name, 'required') + fld('Category (Cakes, Cookies…)', 'category', p.category) +
        '<div class="two">' + fld('Price', 'price', p.price, NUM + ' required') + fld('Unit', 'unit', p.unit) + '</div>' +
        chk('Track ready stock', 'trackStock', p.trackStock) + fld('Stock in hand', 'stock', p.stock || 0, 'type="number" step="any"') +
        chk('Show on customer order page', 'active', p.active !== false) + imgField(p.img, 'Product photo (customers see this)'),
        function (fd) {
          return save('products', p.id, {
            name: fd.get('name').trim(), category: (fd.get('category') || '').trim(), price: n(fd.get('price')),
            unit: (fd.get('unit') || 'pc').trim(), trackStock: fd.get('trackStock') === 'on', stock: n(fd.get('stock')), active: fd.get('active') === 'on', img: fd.get('img') || ''
          });
        }, { onDelete: p.id && function () { return db.doc('products/' + p.id).delete(); } });
    },
    material: function (m) {
      m = m || {};
      modal(m.id ? 'Edit raw material' : 'New raw material',
        fld('Name', 'name', m.name, 'required') + '<div class="two">' + fld('Quantity in stock', 'qty', m.qty || 0, 'type="number" step="any"') + fld('Unit (kg, dozen…)', 'unit', m.unit) + '</div>' +
        '<div class="two">' + fld('Cost per unit', 'cost', m.cost || 0, NUM) + fld('Low-stock alert at', 'low', m.low || 0, NUM) + '</div>' + imgField(m.img, 'Photo (optional)'),
        function (fd) {
          return save('materials', m.id, { name: fd.get('name').trim(), qty: n(fd.get('qty')), unit: (fd.get('unit') || '').trim(), cost: n(fd.get('cost')), low: n(fd.get('low')), img: fd.get('img') || '' });
        }, { onDelete: m.id && function () { return db.doc('materials/' + m.id).delete(); } });
    },
    asset: function (a) {
      a = a || { date: todayStr(), qty: 1 };
      modal(a.id ? 'Edit tool / asset' : 'New tool / asset',
        fld('Name (oven, mixer, trays…)', 'name', a.name, 'required') + '<div class="two">' + fld('Qty', 'qty', a.qty, NUM) + fld('Cost each', 'cost', a.cost || 0, NUM) + '</div>' +
        fld('Purchase date', 'date', a.date, 'type="date"') + fld('Note', 'note', a.note) + imgField(a.img, 'Photo of tool (optional)'),
        function (fd) {
          return save('assets', a.id, { name: fd.get('name').trim(), qty: n(fd.get('qty')) || 1, cost: n(fd.get('cost')), date: fd.get('date') || todayStr(), note: fd.get('note') || '', img: fd.get('img') || '' });
        }, { onDelete: a.id && function () { return db.doc('assets/' + a.id).delete(); } });
    },
    expense: function (e) {
      e = e || { kind: 'expense', date: todayStr() };
      modal(e.id ? 'Edit record' : 'New expense / loss',
        sel('Type', 'kind', [['expense', 'Expense (gas, rent, delivery…)'], ['loss', 'Loss (spoiled, burnt, wasted)']], e.kind) +
        fld('Description', 'desc', e.desc, 'required') + '<div class="two">' + fld('Amount', 'amount', e.amount, NUM + ' required') + fld('Date', 'date', e.date, 'type="date" required') + '</div>' + imgField(e.img, 'Receipt / photo (optional)'),
        function (fd) { return save('expenses', e.id, { kind: fd.get('kind'), desc: fd.get('desc').trim(), amount: n(fd.get('amount')), date: fd.get('date'), img: fd.get('img') || '' }); },
        { onDelete: e.id && function () { return db.doc('expenses/' + e.id).delete(); } });
    },
    customer: function (c) {
      c = c || {};
      modal(c.id ? 'Edit customer' : 'New customer',
        fld('Name', 'name', c.name, 'required') + fld('Mobile', 'phone', c.phone, 'type="tel" inputmode="tel"') + fld('Address', 'address', c.address),
        function (fd) {
          var phone = normPhone(fd.get('phone'));
          var data = { name: fd.get('name').trim(), phone: phone, address: fd.get('address') || '' };
          if (c.id) return save('customers', c.id, data);
          if (phone) return db.doc('customers/' + phone).set(Object.assign({ createdMs: Date.now() }, data), { merge: true });
          return save('customers', null, data);
        }, { onDelete: c.id && function () { return db.doc('customers/' + c.id).delete(); } });
    }
  };

  function lineRow(sale) {
    return '<div class="line"><input class="li-name" placeholder="Item" list="dl" required><input class="li-qty" type="number" step="any" min="0" placeholder="Qty" required>' +
      '<input class="li-rate" type="number" step="any" min="0" placeholder="Rate" required><button type="button" class="x" data-a="rmline">✕</button></div>';
  }
  function readLines(f) {
    return [].slice.call(f.querySelectorAll('.line')).map(function (r) {
      return { name: r.querySelector('.li-name').value.trim(), qty: n(r.querySelector('.li-qty').value), rate: n(r.querySelector('.li-rate').value) };
    }).filter(function (l) { return l.name && l.qty > 0; });
  }
  function recalc() {
    var f = $('#mf'); if (!f) return;
    var t = sum(readLines(f), function (l) { return l.qty * l.rate; });
    var el = $('#itot'); if (el) el.textContent = money(t);
  }

  function invoiceForm(type) {
    var isSale = type === 'sale';
    var dl = (isSale ? S.products : S.materials).map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('');
    var cdl = S.customers.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('');
    var f = modal(isSale ? 'New sale invoice' : 'New purchase invoice',
      '<datalist id="dl">' + dl + '</datalist><datalist id="cdl">' + cdl + '</datalist>' +
      (isSale ? fld('Customer', 'party', '', 'list="cdl" required') + fld('Mobile (optional)', 'phone', '', 'type="tel" inputmode="tel"')
        : fld('Supplier / shop', 'party', '', 'required') + sel('Buying', 'kind', [['material', 'Raw material / ingredients'], ['asset', 'Tool / fixed asset']], 'material')) +
      fld('Date', 'date', todayStr(), 'type="date" required') +
      '<div id="lines">' + lineRow() + '</div><button type="button" class="btn ghost" style="margin-top:8px" data-a="addline">+ Add item</button>' +
      '<div class="tot">Total: <b id="itot">Rs 0</b></div>' + fld('Paid now', 'paid', 0, NUM) + fld('Note', 'note', '') + imgField('', 'Bill / receipt photo (optional)'),
      function (fd, form) {
        return createInvoice({
          type: type, party: fd.get('party').trim(), phone: fd.get('phone') || '', date: fd.get('date'), kind: fd.get('kind') || '',
          lines: readLines(form), paid: fd.get('paid'), note: fd.get('note') || '', img: fd.get('img') || ''
        });
      }, { saveLabel: 'Save invoice' });
    f.addEventListener('change', function (e) {
      if (!e.target.classList.contains('li-name')) return;
      var row = e.target.closest('.line'), rate = row.querySelector('.li-rate');
      var rec = findByName(isSale ? S.products : S.materials, e.target.value);
      if (rec && !rate.value) rate.value = isSale ? n(rec.price) : n(rec.cost);
      recalc();
    });
  }

  function invoiceView(id) {
    var i = S.invoices.filter(function (x) { return x.id === id; })[0]; if (!i) return;
    var due = invDue(i);
    var rows = (i.lines || []).map(function (l) { return '<tr><td>' + esc(l.name) + '</td><td>' + l.qty + ' × ' + money(l.rate) + '</td><td>' + money(l.qty * l.rate) + '</td></tr>'; }).join('');
    var body = '<div class="print-area"><h3>' + esc(S.shop.name) + '</h3><div>' + (i.type === 'sale' ? 'Sale invoice' : 'Purchase invoice') + ' <b>' + esc(i.no) + '</b> · ' + esc(i.date) + '</div>' +
      '<div>' + (i.type === 'sale' ? 'Customer: ' : 'Supplier: ') + '<b>' + esc(i.party) + '</b>' + (i.phone ? ' · ' + esc(i.phone) : '') + '</div>' +
      '<table class="inv"><tr><th>Item</th><th>Qty × Rate</th><th>Amount</th></tr>' + rows + '</table>' +
      '<div class="row sb"><b>Total</b><b>' + money(i.total) + '</b></div><div class="row sb"><span>Paid</span><span>' + money(i.paid) + '</span></div>' +
      '<div class="row sb"><b>Balance due</b><b class="' + (due > 0 ? 'neg' : 'pos') + '">' + money(due) + '</b></div>' + (i.note ? '<p class="muted">' + esc(i.note) + '</p>' : '') + (i.img ? '<img class="big" src="' + esc(i.img) + '" alt="bill">' : '') + '</div>' +
      '<div class="row wrap gap">' + (due > 0 ? '<button type="button" class="btn pri" data-a="addpay" data-id="' + i.id + '">Add payment</button>' : '') +
      (i.type === 'sale' && i.phone ? '<a class="btn" target="_blank" href="https://wa.me/' + waNum(i.phone) + '?text=' + encodeURIComponent('Invoice ' + i.no + ' from ' + S.shop.name + '\nTotal ' + money(i.total) + ', paid ' + money(i.paid) + ', due ' + money(due) + '. Thank you!') + '">WhatsApp</a>' : '') +
      '<button type="button" class="btn" data-a="print">Print</button></div>';
    modal('Invoice ' + esc(i.no), body, null, { onDelete: function () { return deleteInvoice(id); } });
  }

  function payForm(id) {
    var i = S.invoices.filter(function (x) { return x.id === id; })[0]; if (!i) return;
    modal('Add payment · ' + esc(i.no), '<p class="muted">Balance due ' + money(invDue(i)) + '</p>' + fld('Amount received/paid', 'amt', invDue(i), NUM + ' required'),
      function (fd) { return db.doc('invoices/' + id).update({ paid: Math.min(n(i.total), n(i.paid) + n(fd.get('amt'))) }); });
  }

  function deliverForm(o) {
    var bal = n(o.total) - (o.advanceReceived ? n(o.advanceDue) : 0);
    modal('Deliver ' + esc(o.orderNo),
      '<p class="muted">Creates a sale invoice and deducts tracked ready stock.' + (!o.advanceReceived && n(o.advanceDue) > 0 ? ' Advance is not marked received yet — it will not be counted as paid.' : '') + '</p>' +
      fld('Cash collected now', 'paid', Math.max(0, bal), NUM),
      function (fd) {
        var paid = (o.advanceReceived ? n(o.advanceDue) : 0) + n(fd.get('paid'));
        return createInvoice({
          type: 'sale', party: o.name, phone: o.phone, date: todayStr(), paid: paid, note: 'Order ' + o.orderNo, orderId: o.id,
          lines: (o.items || []).map(function (l) { return { name: l.name, pid: l.id, qty: n(l.qty), rate: n(l.price) }; })
        }, function (b, iref) { b.update(db.doc('orders/' + o.id), { status: 'delivered', invoiceId: iref.id, deliveredMs: Date.now() }); });
      }, { saveLabel: 'Mark delivered' });
  }

  // ---------- views ----------
  function chips(list, cur, act) {
    return '<div class="chips">' + list.map(function (c) { return '<button class="chip ' + (cur === c[0] ? 'on' : '') + '" data-a="' + act + '" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
  }
  function addBtn(k, label) { return '<button class="btn pri fab" data-a="new" data-k="' + k + '">+ ' + label + '</button>'; }
  function empty(t) { return '<p class="muted" style="text-align:center;margin:30px 0">' + t + '</p>'; }

  function orderCard(o) {
    var due = n(o.total) - (o.advanceReceived ? n(o.advanceDue) : 0), nx = NEXT[o.status];
    var live = o.status !== 'cancelled' && o.status !== 'delivered';
    var warns = [];
    if (o.status === 'new' || o.status === 'confirmed') {
      var calc = sum(o.items || [], function (i) { return n(i.qty) * n(i.price); });
      if (Math.round(calc) !== Math.round(n(o.total))) warns.push('total does not match the items');
      (o.items || []).forEach(function (i) {
        var pr = (i.id && S.products.filter(function (x) { return x.id === i.id; })[0]) || findByName(S.products, i.name);
        if (pr && n(pr.price) !== n(i.price)) warns.push(esc(i.name) + ' ordered at ' + money(i.price) + ', menu price is ' + money(pr.price));
      });
      if (n(o.advanceDue) < Math.ceil(n(o.total) * n(S.shop.advancePercent) / 100)) warns.push('advance is below ' + n(S.shop.advancePercent) + '%');
    }
    var adv = n(o.advanceDue) > 0 ? (o.advanceReceived ? '<span class="pill ok">Advance ' + money(o.advanceDue) + ' received</span>'
      : (o.slip ? '<span class="pill warn">Slip sent' + (o.payApp ? ' · ' + esc(o.payApp) : '') + ' — verify</span>' : '<span class="pill">Advance ' + money(o.advanceDue) + ' pending</span>')) : '';
    var msg = 'Assalam o Alaikum ' + o.name + ', your order ' + o.orderNo + ' is ' + o.status + '. - ' + S.shop.name;
    return '<div class="card ord s-' + esc(o.status) + '"><div class="row sb"><b>#' + esc(o.orderNo) + '</b><span class="pill st">' + esc(o.status) + '</span></div>' +
      '<div><b>' + esc(o.name) + '</b> · <a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></div>' +
      (o.deliveryDate ? '<div class="muted">For ' + esc(o.deliveryDate) + ' ' + esc(o.deliveryTime || '') + '</div>' : '') +
      (o.address ? '<div class="muted">' + esc(o.address) + '</div>' : '') +
      '<div class="items">' + (o.items || []).map(function (i) { return esc(i.qty) + ' × ' + esc(i.name); }).join(', ') + '</div>' +
      (o.note ? '<div class="note">“' + esc(o.note) + '”</div>' : '') +
      (warns.length ? '<div class="warnbox">Check price: ' + warns.join('; ') + '.</div>' : '') +
      '<div class="row sb"><span>Total <b>' + money(o.total) + '</b></span><span class="muted">Balance ' + money(due) + '</span></div>' +
      '<div class="row wrap" style="margin-top:6px">' + adv + (o.slip ? '<img class="slip" src="' + esc(o.slip) + '" data-a="slip" data-id="' + o.id + '" alt="slip">' : '') + '</div>' +
      '<div class="row wrap gap">' + (nx && live ? '<button class="btn pri" data-a="next" data-id="' + o.id + '" data-v="' + nx[0] + '">' + nx[1] + '</button>' : '') +
      (live && !o.advanceReceived && n(o.advanceDue) > 0 ? '<button class="btn ok" data-a="adv" data-id="' + o.id + '">Advance received</button>' : '') +
      '<a class="btn" target="_blank" href="https://wa.me/' + waNum(o.phone) + '?text=' + encodeURIComponent(msg) + '">WhatsApp</a>' +
      (live ? '<button class="btn bad" data-a="cancel" data-id="' + o.id + '">Cancel</button>' : '') + '</div></div>';
  }

  var VIEWS = {
    orders: function () {
      var f = ST.of, act = ['new', 'confirmed', 'baking', 'ready'];
      var list = S.orders.slice().sort(function (a, b) { return (b.createdMs || 0) - (a.createdMs || 0); }).filter(function (o) {
        return f === 'all' || (f === 'active' ? act.indexOf(o.status) >= 0 : o.status === f);
      });
      return chips([['active', 'Active'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']], f, 'ofilter') +
        (list.length ? list.map(orderCard).join('') : empty('No orders here yet. Share your order link from Settings.'));
    },
    invoices: function () {
      var f = ST.inv;
      var list = S.invoices.slice().sort(function (a, b) { return (b.date + b.no).localeCompare(a.date + a.no); }).filter(function (i) { return f === 'all' || i.type === f; });
      return '<div class="row gap"><button class="btn pri" data-a="newinv" data-v="sale">+ Sale invoice</button><button class="btn" data-a="newinv" data-v="purchase">+ Purchase invoice</button></div>' +
        chips([['all', 'All'], ['sale', 'Sales'], ['purchase', 'Purchases']], f, 'ifilter') +
        (list.length ? list.map(function (i) {
          var d = invDue(i);
          return '<div class="rowitem" data-a="invview" data-id="' + i.id + '"><div><b>' + esc(i.no) + '</b> · ' + esc(i.party) + '<div class="muted">' + esc(i.date) + ' · ' + (i.type === 'sale' ? 'Sale' : (i.kind === 'asset' ? 'Asset purchase' : 'Purchase')) + '</div></div>' +
            '<div class="r"><b>' + money(i.total) + '</b><div>' + (d > 0 ? '<span class="pill warn">Due ' + money(d) + '</span>' : '<span class="pill ok">Paid</span>') + '</div></div></div>';
        }).join('') : empty('No invoices yet.'));
    },
    products: function () {
      var list = S.products.slice().sort(function (a, b) { return String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name)); });
      return (list.length ? list.map(function (p) {
        return '<div class="rowitem" data-a="edit" data-k="product" data-id="' + p.id + '"><div class="row">' + thumb(p) + '<div><b>' + esc(p.name) + '</b><div class="muted">' + esc(p.category || 'Menu') + (p.active === false ? ' · hidden' : '') + '</div></div></div>' +
          '<div class="r"><b>' + money(p.price) + '</b>' + (p.trackStock ? '<div class="' + (n(p.stock) <= 0 ? 'neg' : 'muted') + '">Stock ' + n(p.stock) + '</div>' : '') + '</div></div>';
      }).join('') : empty('Add your menu items — they appear on the customer order page instantly.')) + addBtn('product', 'Product');
    },
    materials: function () {
      var list = S.materials.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var val = sum(list, function (m) { return n(m.qty) * n(m.cost); });
      return '<div class="tile big"><small>Raw material stock value</small><b>' + money(val) + '</b></div><p class="muted">Stock rises automatically when you save a purchase invoice for raw material.</p>' +
        (list.length ? list.map(function (m) {
          var low = n(m.low) > 0 && n(m.qty) <= n(m.low);
          return '<div class="rowitem" data-a="edit" data-k="material" data-id="' + m.id + '"><div class="row">' + thumb(m) + '<div><b>' + esc(m.name) + '</b>' + (low ? ' <span class="pill bad">Low</span>' : '') + '<div class="muted">' + money(m.cost) + ' / ' + esc(m.unit || 'unit') + '</div></div></div>' +
            '<div class="r"><b>' + n(m.qty) + ' ' + esc(m.unit || '') + '</b><div class="muted">' + money(n(m.qty) * n(m.cost)) + '</div></div></div>';
        }).join('') : empty('No raw material yet.')) + addBtn('material', 'Material');
    },
    assets: function () {
      var list = S.assets.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      return '<div class="tile big"><small>Total tools &amp; fixed assets (at cost)</small><b>' + money(sum(list, function (a) { return n(a.qty) * n(a.cost); })) + '</b></div>' +
        (list.length ? list.map(function (a) {
          return '<div class="rowitem" data-a="edit" data-k="asset" data-id="' + a.id + '"><div class="row">' + thumb(a) + '<div><b>' + esc(a.name) + '</b><div class="muted">' + esc(a.date || '') + (a.note ? ' · ' + esc(a.note) : '') + '</div></div></div><div class="r"><b>' + money(n(a.qty) * n(a.cost)) + '</b><div class="muted">' + n(a.qty) + ' × ' + money(a.cost) + '</div></div></div>';
        }).join('') : empty('No tools or assets recorded.')) + addBtn('asset', 'Tool / asset');
    },
    money: function () {
      var list = S.expenses.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      var ym = todayStr().slice(0, 7), mo = list.filter(function (e) { return String(e.date).indexOf(ym) === 0; });
      return '<div class="tiles"><div class="tile"><small>Expenses this month</small><b>' + money(sum(mo.filter(function (e) { return e.kind === 'expense'; }), function (e) { return e.amount; })) + '</b></div>' +
        '<div class="tile"><small>Losses this month</small><b class="neg">' + money(sum(mo.filter(function (e) { return e.kind === 'loss'; }), function (e) { return e.amount; })) + '</b></div></div>' +
        (list.length ? list.map(function (e) {
          return '<div class="rowitem" data-a="edit" data-k="expense" data-id="' + e.id + '"><div class="row">' + thumb(e) + '<div><b>' + esc(e.desc) + '</b><div class="muted">' + esc(e.date) + '</div></div></div><div class="r"><b>' + money(e.amount) + '</b><div><span class="pill ' + (e.kind === 'loss' ? 'bad' : '') + '">' + esc(e.kind) + '</span></div></div></div>';
        }).join('') : empty('No expenses or losses recorded.')) + addBtn('expense', 'Expense / loss');
    },
    customers: function () {
      var list = S.customers.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      return (list.length ? list.map(function (c) {
        var key = normPhone(c.phone || c.id);
        var cnt = S.orders.filter(function (o) { return normPhone(o.phone) === key; }).length;
        var due = sum(S.invoices.filter(function (i) { return i.type === 'sale' && ((i.phone && i.phone === key) || (!i.phone && i.party === c.name)); }), invDue);
        return '<div class="rowitem" data-a="edit" data-k="customer" data-id="' + c.id + '"><div><b>' + esc(c.name) + '</b><div class="muted">' + esc(c.phone || '') + '</div></div>' +
          '<div class="r"><div class="muted">' + cnt + ' order' + (cnt === 1 ? '' : 's') + '</div>' + (due > 0 ? '<span class="pill warn">Owes ' + money(due) + '</span>' : '') + '</div></div>';
      }).join('') : empty('Customers are added automatically when you deliver an order or save a sale invoice with a phone number.')) + addBtn('customer', 'Customer');
    },
    reports: function () {
      var r = ST.rep, d = new Date(), pad = function (x) { return String(x).padStart(2, '0'); };
      var ymd = function (x) { return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
      var a = '0000-00-00', b = '9999-99-99';
      if (r.p === 'today') { a = b = todayStr(); }
      else if (r.p === 'month') { a = ymd(new Date(d.getFullYear(), d.getMonth(), 1)); b = todayStr(); }
      else if (r.p === 'last') { a = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)); b = ymd(new Date(d.getFullYear(), d.getMonth(), 0)); }
      else if (r.p === 'custom') { a = r.from || a; b = r.to || b; }
      var inR = function (x) { return x.date >= a && x.date <= b; };
      var sales = S.invoices.filter(function (i) { return i.type === 'sale' && inR(i); });
      var purch = S.invoices.filter(function (i) { return i.type === 'purchase' && inR(i); });
      var rev = sum(sales, function (i) { return i.total; }), cash = sum(sales, function (i) { return i.paid; });
      var matBuy = sum(purch.filter(function (i) { return i.kind !== 'asset'; }), function (i) { return i.total; });
      var assetBuy = sum(purch.filter(function (i) { return i.kind === 'asset'; }), function (i) { return i.total; });
      var exp = sum(S.expenses.filter(function (e) { return e.kind === 'expense' && inR(e); }), function (e) { return e.amount; });
      var loss = sum(S.expenses.filter(function (e) { return e.kind === 'loss' && inR(e); }), function (e) { return e.amount; });
      var profit = rev - matBuy - exp - loss;
      var top = {};
      sales.forEach(function (i) { (i.lines || []).forEach(function (l) { var t = top[l.name] = top[l.name] || { q: 0, a: 0 }; t.q += n(l.qty); t.a += n(l.qty) * n(l.rate); }); });
      var topList = Object.keys(top).sort(function (x, y) { return top[y].a - top[x].a; }).slice(0, 6);
      var lowM = S.materials.filter(function (m) { return n(m.low) > 0 && n(m.qty) <= n(m.low); });
      var lowP = S.products.filter(function (p) { return p.trackStock && n(p.stock) <= 0; });
      var tile = function (l, v, c) { return '<div class="tile"><small>' + l + '</small><b class="' + (c || '') + '">' + money(v) + '</b></div>'; };
      return '<div class="row gap"><select data-a="rep-p"><option value="today">Today</option><option value="month">This month</option><option value="last">Last month</option><option value="all">All time</option><option value="custom">Custom…</option></select></div>' +
        (r.p === 'custom' ? '<div class="two"><input type="date" data-a="rep-from" value="' + esc(r.from) + '"><input type="date" data-a="rep-to" value="' + esc(r.to) + '"></div>' : '') +
        '<div class="tiles"><div class="tile big"><small>Net profit</small><b class="' + (profit >= 0 ? 'pos' : 'neg') + '">' + money(profit) + '</b></div>' +
        tile('Sales', rev) + tile('Cash received', cash) + tile('Material purchases', matBuy) + tile('Expenses', exp) + tile('Losses', loss, 'neg') + tile('To collect from customers', rev - cash) +
        tile('To pay suppliers', sum(purch, invDue)) + tile('Asset purchases (not in profit)', assetBuy) +
        tile('Raw material stock value', sum(S.materials, function (m) { return n(m.qty) * n(m.cost); })) + tile('Tools & assets value', sum(S.assets, function (x) { return n(x.qty) * n(x.cost); })) + '</div>' +
        '<p class="muted">Net profit = sales − material purchases − expenses − losses for the period. It does not subtract the value of ingredients still on the shelf.</p>' +
        '<h3>Top sellers</h3>' + (topList.length ? topList.map(function (k) { return '<div class="rowitem" style="cursor:default"><span>' + esc(k) + '</span><span><b>' + money(top[k].a) + '</b> <span class="muted">· ' + top[k].q + ' sold</span></span></div>'; }).join('') : '<p class="muted">No sales in this period.</p>') +
        ((lowM.length || lowP.length) ? '<h3>Needs attention</h3>' + lowM.map(function (m) { return '<div class="rowitem" style="cursor:default"><span>' + esc(m.name) + '</span><span class="pill bad">Low: ' + n(m.qty) + ' ' + esc(m.unit || '') + '</span></div>'; }).join('') +
          lowP.map(function (p) { return '<div class="rowitem" style="cursor:default"><span>' + esc(p.name) + '</span><span class="pill bad">Sold out</span></div>'; }).join('') : '');
    },
    settings: function () {
      var s = S.shop, link = s.orderUrl || (/^https?:/.test(location.protocol) && location.hostname !== 'localhost' ? location.origin + '/order.html' : '');
      var pm = (s.payments || []).map(function (m, i) {
        return '<div class="card"><b>' + esc(m.label) + '</b>' + chk('Show on order page', 'pm_en_' + i, m.enabled) +
          fld('Account title', 'pm_title_' + i, m.title) + fld('Account number / IBAN', 'pm_num_' + i, m.number, 'inputmode="text"') +
          fld('Android app package id (to open the app)', 'pm_pkg_' + i, m.pkg, 'autocapitalize="off"') + '</div>';
      }).join('');
      return '<form id="sf"><div class="card"><h3>Shop</h3>' + fld('Bakery name', 'name', s.name, 'required') + '<div class="two">' + fld('Order no. prefix', 'prefix', s.prefix) + fld('Advance %', 'advancePercent', s.advancePercent, NUM + ' max="100"') + '</div>' +
        fld('WhatsApp number for orders (03xx… or 92…)', 'whatsapp', s.whatsapp, 'type="tel"') + fld('Order page web address', 'orderUrl', s.orderUrl || link, 'type="url" placeholder="https://yourproject.web.app/order.html"') +
        fld('Notice shown on order page', 'notice', s.notice) + chk('Accepting orders', 'accepting', s.accepting !== false) + '</div>' +
        '<h3>Advance payment accounts</h3>' + pm + '<button class="btn pri block" type="submit">Save settings</button></form>' +
        '<div class="card"><h3>Share order link</h3><p class="muted" style="word-break:break-all">' + esc(link || 'Enter the order page web address above and save.') + '</p><div class="row wrap gap">' +
        (link ? '<a class="btn ok" target="_blank" href="https://wa.me/?text=' + encodeURIComponent('Order from ' + s.name + ': ' + link) + '">Share on WhatsApp</a><button class="btn" data-a="copylink">Copy link</button>' : '') +
        '</div></div><div class="card"><h3>Phone alerts when app is closed</h3><p class="muted">Install the free <b>ntfy</b> app on your phone, tap +, and subscribe to this topic:</p>' +
        '<div class="acct"><b>' + esc(s.ntfyTopic || 'appears after you sign in again') + '</b></div><div class="row wrap gap"><button class="btn" data-a="copytopic">Copy topic</button><button class="btn pri" data-a="testalert">Send test alert</button></div></div>' +
        '<div class="card"><div class="row wrap gap"><button class="btn" data-a="notif">Enable order alerts</button><button class="btn" data-a="backup">Save backup file</button><button class="btn bad" data-a="logout">Sign out</button></div></div>';
    }
  };

  function render(force) {
    if (!force) {
      var ae = document.activeElement;
      if (ae && $('#view').contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    }
    $('#shopname').textContent = S.shop.name || 'Bakery';
    var nc = S.orders.filter(function (o) { return o.status === 'new'; }).length;
    $('#tabs').innerHTML = TABS.map(function (t) {
      return '<button class="tab ' + (ST.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '">' + t[1] + (t[0] === 'orders' && nc ? '<i class="badge">' + nc + '</i>' : '') + '</button>';
    }).join('');
    $('#view').innerHTML = VIEWS[ST.tab]();
    var rp = $('#view select[data-a="rep-p"]'); if (rp) rp.value = ST.rep.p;
  }

  // ---------- actions ----------
  var A = {
    tab: function (t, id, v) { ST.tab = v; render(true); window.scrollTo(0, 0); },
    ofilter: function (t, id, v) { ST.of = v; render(true); },
    ifilter: function (t, id, v) { ST.inv = v; render(true); },
    next: function (t, id, v) {
      if (v === 'delivered') { deliverForm(S.orders.filter(function (o) { return o.id === id; })[0]); return; }
      return db.doc('orders/' + id).update({ status: v });
    },
    adv: function (t, id) { return db.doc('orders/' + id).update({ advanceReceived: true }); },
    cancel: function (t, id) { if (confirm('Cancel this order?')) return db.doc('orders/' + id).update({ status: 'cancelled' }); },
    slip: function (t, id) {
      var o = S.orders.filter(function (x) { return x.id === id; })[0]; if (!o) return;
      modal('Payment slip · ' + esc(o.orderNo), '<img class="big" src="' + esc(o.slip) + '" alt="slip">', null);
    },
    'new': function (t) { FORMS[t.dataset.k](); },
    edit: function (t, id) {
      var k = t.dataset.k, rec = S[COLL[k]].filter(function (x) { return x.id === id; })[0];
      if (rec) FORMS[k](rec);
    },
    newinv: function (t, id, v) { invoiceForm(v); },
    invview: function (t, id) { invoiceView(id); },
    addpay: function (t, id) { payForm(id); },
    addline: function () { $('#lines').insertAdjacentHTML('beforeend', lineRow()); },
    rmline: function (t) { var l = t.closest('.line'); if (document.querySelectorAll('.line').length > 1) { l.remove(); recalc(); } },
    mdel: async function () {
      if (modalDelete && confirm('Delete this permanently?')) { var f = modalDelete; await f(); closeModal(); }
    },
    print: function () { window.print(); },
    'rep-p': function (t) { ST.rep.p = t.value; render(true); },
    'rep-from': function (t) { ST.rep.from = t.value; render(true); },
    'rep-to': function (t) { ST.rep.to = t.value; render(true); },
    copylink: function () {
      var link = S.shop.orderUrl || location.origin + '/order.html';
      return copyText(link).then(function () { toast('Link copied'); });
    },
    notif: function () {
      if (!window.Notification) { toast('Alerts are not supported here; sound alerts still work while the app is open.'); return; }
      return Notification.requestPermission().then(function (p) { toast(p === 'granted' ? 'Alerts enabled' : 'Alerts blocked'); });
    },
    imgclear: function () { $('#imgval').value = ''; $('#imgprev').hidden = true; },
    copytopic: function () { return copyText(S.shop.ntfyTopic || '').then(function () { toast('Topic copied'); }); },
    testalert: function () {
      return ntfy(S.shop.ntfyTopic, 'Test alert', 'Order alerts are working').then(function (ok) {
        toast(ok ? 'Test sent. Check the ntfy app.' : 'Could not reach ntfy. Check internet.');
      });
    },
    backup: function () {
      var data = {}; NAMES.forEach(function (k) { data[k] = S[k]; });
      data.shop = S.shop; data.exportedAt = new Date().toISOString();
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), name = 'bakery-backup-' + todayStr() + '.json', file = null;
      try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { /* ignore */ }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(function () { });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    },
    // Signing out also wipes the offline copy of your data kept on this phone.
    logout: function () {
      return auth.signOut().then(function () {
        if (db.terminate && db.clearPersistence) return db.terminate().then(function () { return db.clearPersistence(); }).catch(function () { });
      }).then(function () { location.reload(); });
    }
  };

  document.addEventListener('click', async function (e) {
    if (e.target.id === 'modal') { closeModal(); return; }
    var t = e.target.closest('[data-a],[data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) { closeModal(); return; }
    if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type === 'date')) return;
    var a = t.dataset.a;
    try { if (A[a]) await A[a](t, t.dataset.id, t.dataset.v); }
    catch (err) { console.error(err); toast('Error: ' + (err.message || err)); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && /^rep-/.test(t.dataset.a || '')) A[t.dataset.a](t);
    if (t.id === 'imgin' && t.files[0]) {
      compressImage(t.files[0], 520, 0.7).then(function (data) {
        $('#imgval').value = data; var p = $('#imgprev'); p.src = data; p.hidden = false;
      }).catch(function (err) { toast(err.message); });
    }
  });
  document.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('#lines')) recalc(); });
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'sf') return;
    e.preventDefault();
    var fd = new FormData(e.target);
    var pays = (S.shop.payments || []).map(function (m, i) {
      return { key: m.key, label: m.label, enabled: fd.get('pm_en_' + i) === 'on', title: (fd.get('pm_title_' + i) || '').trim(), number: (fd.get('pm_num_' + i) || '').trim(), pkg: (fd.get('pm_pkg_' + i) || '').trim() };
    });
    var data = {
      name: fd.get('name').trim(), prefix: (fd.get('prefix') || 'BK').trim().toUpperCase(), advancePercent: Math.min(100, n(fd.get('advancePercent'))),
      whatsapp: (fd.get('whatsapp') || '').trim(), orderUrl: (fd.get('orderUrl') || '').trim(), notice: (fd.get('notice') || '').trim(),
      accepting: fd.get('accepting') === 'on', payments: pays
    };
    try { await db.doc('settings/shop').set(data, { merge: true }); toast('Settings saved'); }
    catch (err) { toast('Error: ' + err.message); }
  });

  // ---------- alerts ----------
  function beep() {
    try {
      var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start();
      setTimeout(function () { o.stop(); c.close(); }, 350);
    } catch (e) { /* ignore */ }
  }
  function newOrderAlert(o) {
    beep(); toast('New order ' + o.orderNo + ' · ' + o.name + ' · ' + money(o.total));
    try { if (window.Notification && Notification.permission === 'granted') new Notification('New order ' + o.orderNo, { body: o.name + ' · ' + money(o.total) }); } catch (e) { /* ignore */ }
  }

  // ---------- data + auth ----------
  function subscribe() {
    ready = {};
    var onErr = function (name) {
      return function (err) {
        console.error(name, err);
        if (err && err.code === 'permission-denied') toast('Access denied. Is this account email listed in firestore.rules?');
      };
    };
    unsubs.push(db.doc('settings/shop').onSnapshot(function (d) {
      S.shop = Object.assign({}, DEFAULT_SHOP, d.exists ? d.data() : {});
      render();
    }, onErr('settings')));
    NAMES.forEach(function (k) {
      unsubs.push(db.collection(k).onSnapshot(function (snap) {
        if (k === 'orders' && ready.orders) {
          snap.docChanges().forEach(function (c) {
            if (c.type === 'added' && !snap.metadata.hasPendingWrites) newOrderAlert(c.doc.data());
          });
        }
        S[k] = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        ready[k] = true;
        render();
      }, onErr(k)));
    });
  }
  async function ensureSeed() {
    try {
      var c = await db.doc('meta/counter').get();
      if (!c.exists) await db.doc('meta/counter').set({ orders: 0, sale: 0, purchase: 0 });
      var s = await db.doc('settings/shop').get();
      var topic = 'bakery-' + randId();
      if (!s.exists) await db.doc('settings/shop').set(Object.assign({}, DEFAULT_SHOP, { ntfyTopic: topic }));
      else if (!s.data().ntfyTopic) await db.doc('settings/shop').update({ ntfyTopic: topic });
    } catch (e) { console.error(e); }
  }

  $('#lf').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    $('#lerr').textContent = '';
    auth.signInWithEmailAndPassword(fd.get('email').trim(), fd.get('password')).catch(function (err) {
      $('#lerr').textContent = 'Sign-in failed: ' + (err.code || err.message);
    });
  });
  auth.onAuthStateChanged(function (u) {
    unsubs.forEach(function (f) { f(); }); unsubs = [];
    if (u) {
      $('#login').hidden = true; $('#main').hidden = false;
      ensureSeed(); subscribe(); render(true);
    } else {
      $('#login').hidden = false; $('#main').hidden = true;
    }
  });
})();
