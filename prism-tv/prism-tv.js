// Prism IPTV sürüm sayfası. Veri: /prism-tv/releases.json (CI her sürümde günceller;
// uygulama içi güncelleme de aynı dosyayı okur). Biçim: mobile-ip-tv/docs/RELEASE.md §9.
(function () {
  'use strict';

  var DATA_URL = '/prism-tv/releases.json';
  var PLATFORMS = [
    { key: 'android-arm64', label: 'Android · arm64', note: 'Telefon ve Google TV (64 bit)' },
    { key: 'android-arm', label: 'Android · armeabi-v7a', note: '32 bit TV ve eski cihazlar' },
    { key: 'android-universal', label: 'Android · evrensel', note: 'Hangisini seçeceğini bilmiyorsan (büyük dosya)' },
    { key: 'windows-x64', label: 'Windows', note: 'ZIP, x64' },
    { key: 'linux-x64', label: 'Linux', note: 'tar.gz, x64' },
  ];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function mb(bytes) { return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB'; }
  function trDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function safeUrl(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : null; }

  function preferredKey() {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android-arm64';
    if (/Windows/i.test(ua)) return 'windows-x64';
    if (/Linux|X11/i.test(ua)) return 'linux-x64';
    return null;
  }

  function fillDownloads(box, assets, primaryKey) {
    box.textContent = '';
    PLATFORMS.forEach(function (p) {
      var a = assets && assets[p.key];
      var url = a && safeUrl(a.url);
      if (!url) return;
      var link = el('a', 'pt-btn' + (p.key === primaryKey ? ' pt-btn--primary' : ''));
      link.href = url;
      link.setAttribute('download', a.name || '');
      link.rel = 'noopener';
      link.appendChild(el('b', null, p.label));
      link.appendChild(el('small', null, p.note + (a.size ? ' · ' + mb(a.size) : '')));
      if (a.sha256) link.title = 'SHA-256: ' + a.sha256;
      box.appendChild(link);
    });
    return box;
  }

  function fillNotes(ul, list) {
    ul.textContent = '';
    (list || []).forEach(function (t) { ul.appendChild(el('li', null, t)); });
    return ul;
  }

  function hasAssets(r) { return r.assets && Object.keys(r.assets).length > 0; }

  function renderLatest(r) {
    var primary = preferredKey();
    $('pt-latest-title').textContent = r.title || 'Prism IPTV v' + r.version;
    $('pt-latest-meta').textContent = 'v' + r.version + ' · build ' + r.build + ' · ' + trDate(r.date);
    fillDownloads($('pt-downloads'), r.assets, primary);
    $('pt-hint').textContent = primary === 'android-arm64'
      ? 'Onvo Apollo gibi 32 bit TV’ler için armeabi-v7a dosyasını seç.' : '';
    fillNotes($('pt-latest-notes'), r.notes);
    $('pt-notes-title').hidden = !(r.notes && r.notes.length);
    $('pt-latest').hidden = false;
    $('pt-install').hidden = false;
    $('pt-lead').textContent = 'Güncel sürüm v' + r.version + '. Dosyayı indir, kur; uygulama kendi güncellemelerini de buradan kontrol eder.';
  }

  function renderHistory(list) {
    var host = $('pt-history');
    list.forEach(function (r) {
      var d = el('details');
      var s = el('summary');
      s.appendChild(el('span', null, 'v' + r.version));
      s.appendChild(el('span', 'pt-meta num', 'build ' + r.build + ' · ' + trDate(r.date)));
      d.appendChild(s);
      var body = el('div', 'pt-detail');
      body.appendChild(fillNotes(el('ul', 'pt-notes'), r.notes));
      if (hasAssets(r)) body.appendChild(fillDownloads(el('div', 'pt-downloads'), r.assets, null));
      else body.appendChild(el('p', 'pt-gone', 'Bu sürümün dosyaları kota nedeniyle sayfadan kaldırıldı.'));
      d.appendChild(body);
      host.appendChild(d);
    });
    $('pt-history-wrap').hidden = list.length === 0;
  }

  function showEmpty(text) {
    $('pt-lead').textContent = '';
    $('pt-empty-text').textContent = text;
    $('pt-empty').hidden = false;
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (doc) {
      var releases = doc && Array.isArray(doc.releases) ? doc.releases : [];
      if (!releases.length) { showEmpty('İlk sürüm yayınlandığında burada görünecek.'); return; }
      renderLatest(releases[0]);
      renderHistory(releases.slice(1));
    })
    .catch(function () {
      showEmpty('Sürüm bilgisi alınamadı. Biraz sonra sayfayı yenile.');
    });
})();
