(function () {
  'use strict';
  var cfg = window.FIREBASE_CONFIG || {};
  window.configured = !!(cfg.apiKey && !/PASTE/i.test(cfg.apiKey) && window.firebase);
  if (window.configured) {
    firebase.initializeApp(cfg);
    window.db = firebase.firestore();
  }
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  window.money = function (n) { return 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-PK'); };
  window.todayStr = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  window.digits = function (s) { return String(s || '').replace(/\D/g, ''); };
  // Pakistani mobile numbers: store as 03xxxxxxxxx
  window.normPhone = function (p) {
    var d = digits(p);
    if (d.indexOf('92') === 0 && d.length === 12) d = '0' + d.slice(2);
    else if (d.length === 10 && d.charAt(0) !== '0') d = '0' + d;
    return d;
  };
  // wa.me needs international format without +
  window.waNum = function (p) {
    var d = digits(p);
    if (d.charAt(0) === '0') d = '92' + d.slice(1);
    return d;
  };
  window.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = ''; }, 3200);
  };
  window.copyText = function (text) {
    function fallback(x) {
      var a = document.createElement('textarea');
      a.value = x; a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      a.remove();
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { fallback(text); });
    }
    fallback(text);
    return Promise.resolve();
  };
  window.compressImage = function (file, max, q) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = function () { rej(new Error('Could not read this image')); };
      img.src = url;
    });
  };
  window.randId = function () {
    var a = new Uint8Array(10); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return (x % 36).toString(36); }).join('');
  };
  // Phone alert through ntfy.sh (title must be plain ASCII)
  window.ntfy = function (topic, title, msg) {
    if (!topic) return Promise.resolve(false);
    return fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
      method: 'POST', body: msg, headers: { Title: title, Priority: 'high', Tags: 'cake' }
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  };
  window.DEFAULT_SHOP = {
    name: 'My Bakery', prefix: 'BK', whatsapp: '', advancePercent: 50, accepting: true,
    notice: '', orderUrl: '',
    payments: [
      { key: 'jazzcash', label: 'JazzCash', title: '', number: '', pkg: 'com.techlogix.mobilinkcustomer', enabled: true },
      { key: 'easypaisa', label: 'Easypaisa', title: '', number: '', pkg: 'pk.com.telenor.phoenix', enabled: true },
      { key: 'bank', label: 'Bank / Raast', title: '', number: '', pkg: '', enabled: true },
      { key: 'sadapay', label: 'SadaPay / NayaPay', title: '', number: '', pkg: '', enabled: true }
    ]
  };
})();
