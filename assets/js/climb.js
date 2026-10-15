/* ==========================================================================
   Home: the climb. One print travels from the shore to the crest, flipping
   through the photographs in order, while the drawing pans from the waves to
   the mountain. Mouse: move across the page. Touch: drag sideways. Keys: arrows.
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST;
  var hero = document.querySelector("[data-climb]");
  if (!ST || !hero) return;
  var land = ST.$(".climb__land img", hero), stage = ST.$(".climb__stage", hero), print = ST.$(".climb__print", hero);
  var imgs = ST.$$(".climb__photos img", hero);
  var capTitle = ST.$(".climb__cap-title", hero), capPlace = ST.$(".climb__cap-place", hero);
  var n = imgs.length;
  if (!n) return;

  var p = 0, target = 0, tilt = 0, cur = 0;
  var W = 0, H = 0, pan = 0, sw = 0, ph = 0, capW = 0, capLeft = false, path = null, dirty = true, visible = true;
  var intro = null, touched = false, drag = null, lastDrag = 0, travel = 0;

  var stacked = window.matchMedia("(max-width: 760px), (max-width: 1100px) and (orientation: portrait)");
  var cap = ST.$(".climb__cap", hero), from = ST.$(".climb__from", hero), to = ST.$(".climb__to", hero), by = ST.$(".climb__by", hero);
  function box(el) { return { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight }; }
  function measure() {
    W = hero.clientWidth; H = hero.clientHeight;
    pan = Math.max(0, land.offsetWidth - W);
    sw = stage.offsetWidth; ph = print.offsetHeight;
    var small = stacked.matches, below = small ? cap.offsetHeight + 12 : 0;
    // where the print starts (by the shore) and where it ends (below the crest), as fractions of the hero
    path = small ? { x0: .4, x1: .6, y0: .56, y1: .45 } : { x0: .22, x1: .645, y0: .53, y1: .43 };
    // keep the print clear of both halves of the headline, whatever the screen
    var f = box(from), top = Math.max(box(to).b, box(by).b) + 18;
    path.y0 = Math.min(path.y0, (f.t - 16 - below - ph / 2) / H);
    path.y1 = Math.max(path.y1, (top + ph / 2) / H);
    path.y1 = Math.min(path.y1, path.y0);
    capW = small ? 0 : cap.offsetWidth;
    dirty = true;
  }

  function show(i) {
    if (i === cur) return;
    imgs[cur].classList.remove("is-on");
    imgs[i].classList.add("is-on");
    cur = i;
    var im = imgs[i], title = im.getAttribute("data-title"), place = im.getAttribute("data-place");
    capTitle.textContent = title;
    capPlace.textContent = place;
    print.href = im.getAttribute("data-href");
    print.setAttribute("aria-label", title + ", " + place + ". View photographs");
  }

  function render() {
    var e = ST.ease.sine(p);
    var cx = W * (path.x0 + (path.x1 - path.x0) * p), cy = H * (path.y0 + (path.y1 - path.y0) * e);
    stage.style.transform = "translate3d(" + (cx - sw / 2).toFixed(1) + "px," + (cy - ph / 2).toFixed(1) + "px,0)";
    var left = capW > 0 && cx + sw / 2 + 22 + capW > W - 16;
    if (left !== capLeft) { capLeft = left; cap.classList.toggle("is-left", left); }
    land.style.transform = "translate3d(" + (-pan * p).toFixed(1) + "px,0,0)";
    print.style.setProperty("--tilt", tilt.toFixed(2) + "deg");
    show(Math.round(p * (n - 1)));
  }

  function takeOver() { touched = true; intro = null; }
  function snap() { target = Math.round(target * (n - 1)) / (n - 1); }

  /* ---------------------------------------------------------------- input */
  hero.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) { drag.moved = true; hero.classList.add("is-dragging"); }
      target = ST.clamp(drag.p + dx / (W * .8));
      return;
    }
    // a resting hand nudges the mouse; let the opening climb finish unless the pointer really moves
    if (intro) { travel += Math.abs(e.movementX || 0); if (travel < 80) return; }
    takeOver();
    var r = hero.getBoundingClientRect();
    target = ST.clamp((e.clientX - r.left - W * .1) / (W * .8));
  }, { passive: true });
  hero.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    takeOver();
    drag = { x: e.clientX, p: target, moved: false };
  }, { passive: true });
  function endDrag() {
    if (!drag) return;
    if (drag.moved) { lastDrag = performance.now(); snap(); }
    drag = null;
    hero.classList.remove("is-dragging");
  }
  hero.addEventListener("pointerup", endDrag);
  hero.addEventListener("pointercancel", endDrag);
  print.addEventListener("click", function (e) { if (performance.now() - lastDrag < 350) e.preventDefault(); });
  print.addEventListener("dragstart", function (e) { e.preventDefault(); });
  print.addEventListener("keydown", function (e) {
    var i = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: n - 1 }[e.key];
    if (i == null) return;
    e.preventDefault();
    takeOver();
    target = ST.clamp(i, 0, n - 1) / (n - 1);
  });

  /* ---------------------------------------------------------------- frame loop */
  ST.raf(function (t, dt) {
    if (!visible) return;
    if (intro) {
      var q = ST.clamp((t - intro.start) / intro.ms);
      target = ST.ease.io(q);
      if (q >= 1) intro = null;
    }
    var prev = p, f = dt / 16.7;
    p += (target - p) * (ST.reduce ? 1 : 1 - Math.pow(1 - .12, f));
    if (Math.abs(target - p) < .0004) p = target;
    var lean = ST.reduce ? 0 : ST.clamp((p - prev) / f * 320, -6, 6);
    tilt += (lean - tilt) * Math.min(1, .14 * f);
    if (Math.abs(tilt) < .01) tilt = 0;
    if (p !== prev || tilt !== 0 || dirty) { dirty = false; render(); }
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; dirty = true; }).observe(hero);
  }
  window.addEventListener("resize", ST.debounce(measure, 100));
  if (!land.complete) land.addEventListener("load", measure, { once: true });

  measure();
  render();
  requestAnimationFrame(function () { hero.classList.add("is-set"); });

  // once the photographs are ready, walk the print up from the shore to the crest
  if (!ST.reduce) {
    var ready = Promise.all(imgs.map(function (img) { return img.decode ? img.decode().catch(function () {}) : null; }));
    var timeout = new Promise(function (res) { setTimeout(res, 3000); });
    Promise.race([ready, timeout]).then(function () {
      setTimeout(function () { if (!touched) intro = { start: performance.now(), ms: 5600 }; }, 700);
    });
  }
})();
