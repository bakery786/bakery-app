(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!window.configured) {
    app.innerHTML = '<div class="card"><h2>Setup needed</h2><p>Paste your Firebase config into <code>firebase-config.js</code>.</p></div>';
    return;
  }
  var KEY = 'bk_last_order';
  var STEPS = ['new', 'confirmed', 'baking', 'ready', 'delivered'];
  var shop = Object.assign({}, DEFAULT_SHOP);
  var products = [], cart = {}, view = 'menu', order = null, orderUnsub = null, payChoice = null, firstSnap = true, busy = false, celebrate = false;

  function cartLines() {
    return products.filter(function (p) { return cart[p.id] > 0; }).map(function (p) {
      return { id: p.id, name: p.name, price: Number(p.price) || 0, qty: cart[p.id], unit: p.unit || '' };
    });
  }
  function cartTotal() { return cartLines().reduce(function (s, l) { return s + l.price * l.qty; }, 0); }
  function advanceFor(total) { return Math.ceil(total * (Number(shop.advancePercent) || 0) / 100); }
  function maxQty(p) { return p.trackStock ? Math.max(0, Number(p.stock) || 0) : 999; }

  // Live updates must never wipe what the customer is typing at checkout.
  function softRender() {
    if (view === 'checkout') {
      var s = document.getElementById('sum');
      if (s) s.innerHTML = summaryHtml();
      return;
    }
    render();
  }

  // ---------- live data ----------
  db.doc('settings/shop').onSnapshot(function (d) {
    if (d.exists) shop = Object.assign({}, DEFAULT_SHOP, d.data());
    softRender();
  }, function (e) { console.error(e); });

  db.collection('products').where('active', '==', true).onSnapshot(function (s) {
    products = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) {
      return (a.category || '').localeCompare(b.category || '') || String(a.name).localeCompare(String(b.name));
    });
    Object.keys(cart).forEach(function (id) {
      var p = products.filter(function (x) { return x.id === id; })[0];
      if (!p) delete cart[id]; else if (cart[id] > maxQty(p)) cart[id] = maxQty(p);
    });
    softRender();
  }, function (e) { console.error(e); });

  function watchOrder(id) {
    if (orderUnsub) orderUnsub();
    firstSnap = true;
    orderUnsub = db.doc('orders/' + id).onSnapshot(function (d) {
      if (d.exists) {
        order = Object.assign({ id: d.id }, d.data());
        if (firstSnap) view = 'order';
      } else {
        order = null;
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        if (view === 'order') view = 'menu';
      }
      firstSnap = false;
      softRender();
    }, function () { order = null; if (view === 'order') view = 'menu'; softRender(); });
  }
  try { var saved = localStorage.getItem(KEY); if (saved) watchOrder(saved); } catch (e) { /* ignore */ }

  // ---------- views ----------
  function render() {
    if (view === 'checkout') { app.innerHTML = checkoutHtml(); return; }
    if (view === 'order' && order) { app.innerHTML = orderHtml(); return; }
    app.innerHTML = menuHtml();
  }

  function heroHtml(inner) { return '<header class="hero">' + inner + '</header>'; }

  function menuHtml() {
    var groups = {}, order_ = [];
    products.forEach(function (p) { var c = p.category || 'Menu'; if (!groups[c]) { groups[c] = []; order_.push(c); } groups[c].push(p); });
    var h = heroHtml('<h1>' + esc(shop.name) + '</h1><p>Baked fresh to order. Pick your treats and a delivery day.</p>');
    if (shop.notice) h += '<div class="notice">' + esc(shop.notice) + '</div>';
    if (!shop.accepting) h += '<div class="notice warn">We are not taking new orders right now. Please check back soon.</div>';
    if (order) h += '<button class="btn ghost block" data-a="myorder">View my order ' + esc(order.orderNo) + ' (' + esc(order.status) + ')</button>';
    if (!products.length) h += '<p class="muted" style="text-align:center;margin:36px 8px">The menu will appear here as soon as the bakery adds its items.</p>';
    order_.forEach(function (c) {
      h += '<div class="cat">' + esc(c) + '</div><div class="pgrid">';
      groups[c].forEach(function (p) {
        var q = cart[p.id] || 0, mx = maxQty(p);
        var ctl;
        if (mx <= 0) ctl = '<span class="pill bad">Sold out</span>';
        else if (!q) ctl = '<button class="btn pri add" data-a="inc" data-id="' + p.id + '">Add</button>';
        else ctl = '<div class="stepper"><button data-a="dec" data-id="' + p.id + '" aria-label="Remove one">−</button><span>' + q + '</span><button data-a="inc" data-id="' + p.id + '" aria-label="Add one">+</button></div>';
        var photo = p.img ? '<img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy">' : '<span class="ph-l">' + esc(String(p.name).charAt(0).toUpperCase()) + '</span>';
        h += '<div class="prod' + (mx <= 0 ? ' gone' : '') + '"><div class="ph' + (p.img ? '' : ' empty') + '">' + photo + '</div><div class="pb"><b>' + esc(p.name) + '</b>' +
          '<span class="price">' + money(p.price) + (p.unit ? '<small> / ' + esc(p.unit) + '</small>' : '') + '</span><div class="pc">' + ctl + '</div></div></div>';
      });
      h += '</div>';
    });
    var t = cartTotal();
    if (t > 0 && shop.accepting) {
      var count = cartLines().reduce(function (s, l) { return s + l.qty; }, 0);
      h += '<div class="cartbar"><button class="btn pri" data-a="checkout"><span>Checkout · ' + count + ' item' + (count > 1 ? 's' : '') + '</span><b>' + money(t) + '</b></button></div>';
    }
    return h;
  }

  function summaryHtml() {
    var lines = cartLines(), total = cartTotal(), adv = advanceFor(total), h = '';
    lines.forEach(function (l) {
      h += '<div class="row sb"><span>' + l.qty + ' × ' + esc(l.name) + '</span><b>' + money(l.qty * l.price) + '</b></div>';
    });
    h += '<hr class="hr"><div class="row sb"><b>Total</b><b>' + money(total) + '</b></div>';
    if (adv > 0) h += '<div class="row sb muted"><span>Advance to confirm (' + (Number(shop.advancePercent) || 0) + '%)</span><span>' + money(adv) + '</span></div>';
    return h;
  }

  function checkoutHtml() {
    var min = todayStr();
    return heroHtml('<h1>Your order</h1><p>Tell us where and when.</p>') + '<div class="card" id="sum">' + summaryHtml() + '</div><form id="co" class="card">' +
      '<label class="f"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name"></label>' +
      '<label class="f"><span>Mobile number</span><input name="phone" required type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="03xx xxxxxxx"></label>' +
      '<label class="f"><span>Delivery address (or write "pickup")</span><textarea name="address" maxlength="300"></textarea></label>' +
      '<div class="two"><label class="f"><span>Needed on</span><input name="date" type="date" min="' + min + '" required></label>' +
      '<label class="f"><span>Time</span><input name="time" type="time"></label></div>' +
      '<label class="f"><span>Notes (message on cake, flavour…)</span><textarea name="note" maxlength="400"></textarea></label>' +
      '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
      '<button class="btn pri block" type="submit" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Placing…' : 'Place order') + '</button>' +
      '<button class="btn ghost block" type="button" data-a="back">Back to menu</button></form>';
  }

  function sprinkles() {
    var cols = ['#f0a93a', '#6f9a52', '#ee6a93', '#7aa7e0', '#fff'], h = '<div class="sprinkles" aria-hidden="true">';
    for (var i = 0; i < 26; i++) {
      h += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + cols[i % cols.length] + ';animation-delay:' + (Math.random() * 0.7).toFixed(2) + 's;transform:rotate(' + Math.round(Math.random() * 180) + 'deg)"></i>';
    }
    return h + '</div>';
  }

  function orderHtml() {
    var o = order, idx = STEPS.indexOf(o.status), h = '';
    if (celebrate) { h += sprinkles(); celebrate = false; }
    h += heroHtml('<p>Order number</p><div class="big-no">' + esc(o.orderNo) + '</div>');
    if (o.status === 'cancelled') h += '<div class="notice warn">This order was cancelled.</div>';
    else h += '<div class="progress">' + STEPS.map(function (s, i) { return '<div class="' + (i <= idx ? 'done' : '') + '"><i></i>' + s + '</div>'; }).join('') + '</div>';
    h += '<div class="card"><b>' + esc(o.name) + '</b> · ' + esc(o.phone) +
      (o.deliveryDate ? '<div class="muted">For ' + esc(o.deliveryDate) + ' ' + esc(o.deliveryTime || '') + '</div>' : '') +
      (o.address ? '<div class="muted">' + esc(o.address) + '</div>' : '') + '<hr class="hr">';
    (o.items || []).forEach(function (l) {
      h += '<div class="row sb"><span>' + esc(l.qty) + ' × ' + esc(l.name) + '</span><span>' + money(l.qty * l.price) + '</span></div>';
    });
    h += '<div class="row sb" style="margin-top:6px"><b>Total</b><b>' + money(o.total) + '</b></div></div>';

    var due = Number(o.advanceDue) || 0;
    if (o.status !== 'cancelled' && o.status !== 'delivered' && due > 0) {
      if (o.advanceReceived) h += '<div class="notice ok">Advance of ' + money(due) + ' received. Thank you!</div>';
      else h += payHtml(o, due);
    }
    h += '<button class="btn ghost block" data-a="neworder">Start a new order</button>';
    return h;
  }

  function payHtml(o, due) {
    var methods = (shop.payments || []).filter(function (m) { return m.enabled && m.number; });
    var h = '<div class="card"><h3>Pay advance ' + money(due) + '</h3>';
    h += '<div><span class="stepno">1</span>Choose your payment app</div>';
    if (!methods.length) {
      h += '<p class="muted">Payment details are not set up yet. Please message us on WhatsApp.</p>';
    } else {
      h += '<div class="methods">' + methods.map(function (m) {
        return '<button class="btn ' + (payChoice === m.key ? 'on' : '') + '" data-a="pay" data-k="' + esc(m.key) + '">' + esc(m.label) + '</button>';
      }).join('') + '</div>';
      var sel = methods.filter(function (m) { return m.key === payChoice; })[0];
      if (sel) {
        h += '<div class="acct"><div class="muted">' + esc(sel.label) + (sel.title ? ' · ' + esc(sel.title) : '') + '</div><b>' + esc(sel.number) + '</b>' +
          '<div class="row gap"><button class="btn" data-a="copy" data-k="' + esc(sel.key) + '">Copy number</button>' +
          '<button class="btn pri" data-a="pay" data-k="' + esc(sel.key) + '">Open ' + esc(sel.label) + '</button></div>' +
          '<div class="muted" style="margin-top:6px">The number is copied for you. Paste it in the app and send ' + money(due) + '.</div></div>';
      }
    }
    h += '<div style="margin-top:14px"><span class="stepno">2</span>Attach your payment slip or screenshot</div>';
    if (o.slip) h += '<img class="slip" style="height:90px;margin:8px 0" src="' + esc(o.slip) + '" alt="Your payment slip"><div class="pill ok">Slip received</div>';
    h += '<label class="upload" style="margin-top:8px">' + (o.slip ? 'Replace slip' : 'Tap to choose photo') + '<input id="slip" type="file" accept="image/*" hidden></label>';
    h += '<div style="margin-top:14px"><span class="stepno">3</span>Send confirmation on WhatsApp</div>';
    h += '<button class="btn ok block" data-a="wa">Send order number and slip on WhatsApp</button></div>';
    return h;
  }

  // ---------- actions ----------
  var A = {
    inc: function (id) {
      var p = products.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      if ((cart[id] || 0) >= maxQty(p)) { toast('Only ' + maxQty(p) + ' available'); return; }
      cart[id] = (cart[id] || 0) + 1; render();
    },
    dec: function (id) { cart[id] = Math.max(0, (cart[id] || 0) - 1); render(); },
    checkout: function () { view = 'checkout'; render(); window.scrollTo(0, 0); },
    back: function () { view = 'menu'; render(); },
    myorder: function () { view = 'order'; render(); },
    neworder: function () { view = 'menu'; render(); window.scrollTo(0, 0); },
    pay: function (id, k) { openPay(k); },
    copy: function (id, k) { var m = findMethod(k); if (m) copyText(m.number).then(function () { toast('Account number copied'); }); },
    wa: function () { sendWa(); }
  };

  function findMethod(k) { return (shop.payments || []).filter(function (m) { return m.key === k; })[0]; }

  function openPay(k) {
    var m = findMethod(k); if (!m || !order) return;
    payChoice = k; render();
    copyText(m.number).then(function () { toast('Account number copied. Paste it in ' + m.label); });
    db.doc('orders/' + order.id).update({ payApp: String(m.label).slice(0, 39) }).catch(function () { /* ignore */ });
    if (m.pkg && /Android/i.test(navigator.userAgent)) {
      var fb = encodeURIComponent('https://play.google.com/store/apps/details?id=' + m.pkg);
      setTimeout(function () { location.href = 'intent://#Intent;package=' + m.pkg + ';S.browser_fallback_url=' + fb + ';end'; }, 350);
    } else if (!m.pkg) {
      toast('Number copied. Open your bank or wallet app and paste it.');
    }
  }

  async function uploadSlip(file) {
    if (!file || !order) return;
    toast('Uploading slip…');
    var data = await compressImage(file, 900, 0.65);
    if (data.length > 650000) data = await compressImage(file, 700, 0.45);
    var upd = { slip: data, slipAt: firebase.firestore.FieldValue.serverTimestamp() };
    var m = findMethod(payChoice); if (m) upd.payApp = String(m.label).slice(0, 39);
    await db.doc('orders/' + order.id).update(upd);
    ntfy(shop.ntfyTopic, 'Payment slip received', order.orderNo + ' - please verify the advance');
    toast('Slip sent to the bakery');
  }

  async function sendWa() {
    var num = waNum(shop.whatsapp);
    if (!num) { toast('Bakery WhatsApp number is not set yet'); return; }
    var o = order;
    var text = 'Assalam o Alaikum! Order ' + o.orderNo + '\nName: ' + o.name + '\nTotal: ' + money(o.total) +
      '\nAdvance: ' + money(o.advanceDue) + (o.payApp ? ' via ' + o.payApp : '') + '\nPayment slip attached.';
    if (o.slip && navigator.canShare) {
      try {
        var blob = await (await fetch(o.slip)).blob();
        var file = new File([blob], o.orderNo + '-slip.jpg', { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: text });
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    if (o.slip) toast('Please attach your slip screenshot in the chat');
  }

  async function placeOrder(fd) {
    if (fd.get('website')) return; // honeypot: real customers never see this field
    var lines = cartLines();
    if (!lines.length) return;
    for (var i = 0; i < lines.length; i++) {
      var p = products.filter(function (x) { return x.id === lines[i].id; })[0];
      if (!p || lines[i].qty > maxQty(p)) { toast(lines[i].name + ' is no longer available in that quantity'); view = 'menu'; render(); return; }
    }
    var total = cartTotal();
    var phone = String(fd.get('phone') || '').trim();
    if (digits(phone).length < 10) { toast('Please enter a valid mobile number'); return; }
    busy = true; render();
    var ref = db.collection('orders').doc(), cref = db.doc('meta/counter');
    var data = {
      name: String(fd.get('name')).trim(), phone: phone, address: String(fd.get('address') || '').trim(),
      deliveryDate: fd.get('date') || '', deliveryTime: fd.get('time') || '', note: String(fd.get('note') || '').trim(),
      items: lines, total: total, advanceDue: advanceFor(total), status: 'new', advanceReceived: false,
      createdMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      await db.runTransaction(async function (t) {
        var c = await t.get(cref), pre = String(shop.prefix || 'BK').slice(0, 6), no;
        if (c.exists) {
          var n = (c.data().orders || 0) + 1;
          t.update(cref, { orders: n });
          no = pre + '-' + String(n).padStart(4, '0');
        } else {
          no = pre + '-' + String(Date.now()).slice(-6);
        }
        data.orderNo = no;
        t.set(ref, data);
      });
      cart = {}; busy = false; payChoice = null; celebrate = true;
      ntfy(shop.ntfyTopic, 'New order ' + data.orderNo, money(total) + ' - ' + lines.length + ' item type(s)');
      try { localStorage.setItem(KEY, ref.id); } catch (e) { /* ignore */ }
      watchOrder(ref.id);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err); busy = false; render();
      toast('Could not place the order. Check your connection and try again.');
    }
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]');
    if (!t) return;
    var f = A[t.dataset.a];
    if (f) f(t.dataset.id, t.dataset.k);
  });
  app.addEventListener('submit', function (e) {
    if (e.target.id === 'co') { e.preventDefault(); placeOrder(new FormData(e.target)); }
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'slip' && e.target.files[0]) {
      uploadSlip(e.target.files[0]).catch(function (err) { toast('Upload failed: ' + err.message); });
    }
  });
})();
