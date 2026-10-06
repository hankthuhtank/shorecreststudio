/* Astro's album: a full-photo spotlight and a strip of memories. */
(function () {
  "use strict";
  var ST = window.ST, $ = ST.$, $$ = ST.$$;
  var stage = $("[data-astro-stage]"), display = $("[data-astro-display]"), reel = $("[data-astro-reel]");
  if (!stage || !display || !reel) return;
  var photos = ST.collectionPhotos("astro"), index = 0;
  if (!photos.length) return;
  reel.innerHTML = photos.map(function (p, i) {
    return '<button class="astro-memory" type="button" data-memory="' + i + '" aria-label="Show ' + ST.esc(p.title) + '" aria-pressed="false" style="--ph:' + p.c + '"><img src="' + ST.src(p, 480) + '" alt="" loading="lazy" decoding="async"></button>';
  }).join("");
  var thumbs = $$("[data-memory]", reel), img = $("img", display);
  function show(i, reveal) {
    index = (i + photos.length) % photos.length;
    var p = photos[index];
    display.href = ST.largest(p);
    display.setAttribute("aria-label", "Open " + p.title + " full size");
    img.src = ST.src(p, 1320); img.alt = p.alt;
    $("[data-astro-caption]").textContent = p.title + (p.trip ? " · " + p.place : "");
    $("[data-astro-count]").textContent = (index + 1) + " / " + photos.length;
    thumbs.forEach(function (t, n) { t.setAttribute("aria-pressed", n === index ? "true" : "false"); });
    if (reveal) {
      var thumb = thumbs[index], left = thumb.offsetLeft - (reel.clientWidth - thumb.offsetWidth) / 2;
      reel.scrollTo({ left: Math.max(0, left), behavior: ST.reduce ? "auto" : "smooth" });
      if (!ST.reduce && img.animate) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
    }
    var next = new Image(); next.src = ST.src(photos[(index + 1) % photos.length], 1320);
  }
  $("[data-astro-prev]").addEventListener("click", function () { show(index - 1, true); });
  $("[data-astro-next]").addEventListener("click", function () { show(index + 1, true); });
  thumbs.forEach(function (t, i) { t.addEventListener("click", function () { show(i, true); }); });
  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); show(index + (e.key === "ArrowRight" ? 1 : -1), true); }
  });
  display.addEventListener("click", function (e) {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    ST.viewer.open(photos, index, display, { findTile: function (p) { return p.id === photos[index].id ? display : null; } });
  });
  show(0, false);
})();
