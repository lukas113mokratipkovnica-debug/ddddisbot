// Runs in <head> before paint: applies saved theme + accent hue (no flash of wrong theme).
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    var h = localStorage.getItem('hue');
    if (h && /^\d{1,3}$/.test(h)) document.documentElement.style.setProperty('--h', h);
  } catch (e) { /* storage blocked */ }
})();
