/* ==========================================================================
   Photo viewer: opens out of the thumbnail you clicked, then steps through the set.
   ST.viewer.open(photos, index, originEl, { onMap: fn(photo) })
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST;
  if (!ST) return;

  var el, stage, cap, titleEl, lineEl, placeEl, countEl, mapEl, prevBtn, nextBtn, closeBtn;
  var list = [], idx = 0, img = null, origin = null, opts = {}, lastFocus = null, open = false, busy = false;
  var PAD = 28;

  function build() {
    el = document.createElement("div");
    el.className = "vw";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Photograph");
    el.innerHTML =
      '<div class="vw__bg"></div><div class="vw__stage"></div>' +
      '<div class="vw__bar"><div class="vw__cap"><h2 class="vw__title"></h2><p class="vw__line"></p><p class="vw__place"></p></div>' +
      '<div class="vw__ctl"><a class="vw__map link" href="#">' + ST.icon.pin + '<span>See it on the map</span></a>' +
      '<button class="icon-btn vw__prev" type="button" aria-label="Previous photograph">' + ST.icon.back + "</button>" +
      '<span class="vw__count" aria-live="polite"></span>' +
      '<button class="icon-btn vw__next" type="button" aria-label="Next photograph">' + ST.icon.arrow + "</button></div></div>" +
      '<button class="icon-btn vw__close" type="button" aria-label="Close">' + ST.icon.close + "</button>";
    document.body.appendChild(el);
    stage = el.querySelector(".vw__stage");
    cap = el.querySelector(".vw__cap");
    titleEl = el.querySelector(".vw__title");
    lineEl = el.querySelector(".vw__line");
    placeEl = el.querySelector(".vw__place");
    countEl = el.querySelector(".vw__count");
    mapEl = el.querySelector(".vw__map");
    prevBtn = el.querySelector(".vw__prev");
    nextBtn = el.querySelector(".vw__next");
    closeBtn = el.querySelector(".vw__close");
    prevBtn.addEventListener("click", function () { go(-1); });
    nextBtn.addEventListener("click", function () { go(1); });
    closeBtn.addEventListener("click", function () { close(); });
    el.querySelector(".vw__bg").addEventListener("click", function () { close(); });
    stage.addEventListener("click", function (e) { if (e.target === stage || e.target.classList.contains("vw__img")) { if (!dragged) close(); } });
    mapEl.addEventListener("click", function (e) {
      var p = list[idx];
      if (opts.onMap && p && p.stop) { e.preventDefault(); var f = opts.onMap; close(true); f(p); }
    });
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Tab") trap(e);
    });
    window.addEventListener("resize", ST.debounce(function () { if (open && img) place(img, list[idx]); }, 100));
    swipe();
  }

  function trap(e) {
    var f = ST.$$("a[href], button:not([disabled])", el).filter(function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function box(p) {
    var r = stage.getBoundingClientRect(), maxW = r.width - PAD * 2, maxH = r.height - PAD * 2 - 20;
    var s = Math.min(maxW / p.w, maxH / p.h), w = Math.round(p.w * s), h = Math.round(p.h * s);
    return { x: Math.round(r.left + (r.width - w) / 2), y: Math.round(r.top + PAD + 20 + (maxH - h) / 2), w: w, h: h };
  }
  function place(node, p) {
    var b = box(p), r = stage.getBoundingClientRect();
    node.style.left = (b.x - r.left) + "px";
    node.style.top = (b.y - r.top) + "px";
    node.style.width = b.w + "px";
    node.style.height = b.h + "px";
    return b;
  }

  function makeImg(p, lowSrc) {
    var node = document.createElement("img");
    node.className = "vw__img";
    node.alt = p.alt;
    node.draggable = false;
    node.src = lowSrc || ST.src(p, 480);
    var b = box(p), hi = ST.src(p, Math.min(2400, b.w * 1.1)), pre = new Image();
    pre.src = hi;
    (pre.decode ? pre.decode() : Promise.resolve()).then(function () { node.src = hi; }).catch(function () {});
    return node;
  }

  function caption(p) {
    var trip = ST.trip(p.trip), at = ST.stopOf(p);
    titleEl.textContent = p.title;
    lineEl.textContent = p.line || "";
    lineEl.hidden = !p.line;
    placeEl.textContent = p.place + (trip ? " · " + trip.name : "");
    countEl.textContent = (idx + 1) + " / " + list.length;
    if (at) { mapEl.hidden = false; mapEl.href = at.trip.page + "?stop=" + encodeURIComponent(at.stop.id); }
    else mapEl.hidden = true;
    prevBtn.disabled = list.length < 2;
    nextBtn.disabled = list.length < 2;
  }

  function preloadAround() {
    [1, -1].forEach(function (d) {
      var p = list[(idx + d + list.length) % list.length];
      if (p) { var im = new Image(); im.src = ST.src(p, 1600); }
    });
  }

  function flipFrom(node, b, rect, reverse, done) {
    if (!rect || ST.reduce || !node.animate) { if (done) done(); return; }
    var sc = Math.max(rect.width / b.w, rect.height / b.h);
    var tx = rect.left + rect.width / 2 - (b.x + b.w * sc / 2);
    var ty = rect.top + rect.height / 2 - (b.y + b.h * sc / 2);
    var ix = Math.max(0, (b.w - rect.width / sc) / 2), iy = Math.max(0, (b.h - rect.height / sc) / 2);
    var from = { transform: "translate(" + tx + "px," + ty + "px) scale(" + sc + ")", clipPath: "inset(" + iy + "px " + ix + "px round " + (6 / sc) + "px)" };
    var to = { transform: "translate(0,0) scale(1)", clipPath: "inset(0px 0px round 2px)" };
    var a = node.animate(reverse ? [to, from] : [from, to], { duration: reverse ? 520 : 760, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" });
    a.onfinish = function () { if (!reverse) a.cancel(); if (done) done(); };
  }

  function openAt(photos, i, originEl, o) {
    if (!el) build();
    list = photos; idx = i; opts = o || {}; origin = originEl || null;
    lastFocus = document.activeElement;
    el.hidden = false;
    open = true;
    ST.lockScroll(true);
    var p = list[idx], low = null, rect = null;
    if (origin) {
      var im = origin.querySelector ? (origin.tagName === "IMG" ? origin : origin.querySelector("img.fade-img, img:not([aria-hidden])")) : null;
      if (im && im.currentSrc && im.complete) low = im.currentSrc;
      rect = origin.getBoundingClientRect();
    }
    stage.innerHTML = "";
    img = makeImg(p, low);
    stage.appendChild(img);
    var b = place(img, p);
    caption(p);
    if (origin) origin.style.visibility = "hidden";
    requestAnimationFrame(function () {
      el.classList.add("is-open");
      flipFrom(img, b, rect, false, function () { if (origin) origin.style.visibility = ""; });
      if (!rect && img.animate && !ST.reduce) img.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: "cubic-bezier(.16,1,.3,1)" });
    });
    closeBtn.focus({ preventScroll: true });
    preloadAround();
  }

  function go(d) {
    if (busy || list.length < 2) return;
    busy = true;
    idx = (idx + d + list.length) % list.length;
    var p = list[idx], old = img;
    img = makeImg(p);
    stage.appendChild(img);
    place(img, p);
    el.classList.add("is-swap");
    setTimeout(function () { caption(p); el.classList.remove("is-swap"); }, 160);
    origin = null;
    if (old.animate && !ST.reduce) {
      old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + (-70 * d) + "px) scale(.98)" }], { duration: 420, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
      var a = img.animate([{ opacity: 0, transform: "translateX(" + (90 * d) + "px) scale(1.02)" }, { opacity: 1, transform: "none" }], { duration: 620, delay: 80, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      a.onfinish = function () { old.remove(); busy = false; };
    } else { old.remove(); busy = false; }
    preloadAround();
  }

  function close(skipFlip) {
    if (!open) return;
    open = false;
    var p = list[idx], target = null;
    if (!skipFlip && opts.findTile) target = opts.findTile(p, idx);
    if (!skipFlip && !target && origin) target = origin;
    var rect = target ? target.getBoundingClientRect() : null;
    var inView = rect && rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
    el.classList.remove("is-open");
    function finish() {
      el.hidden = true;
      stage.innerHTML = "";
      if (target) target.style.visibility = "";
      ST.lockScroll(false);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    if (inView && img && img.animate && !ST.reduce) {
      target.style.visibility = "hidden";
      flipFrom(img, box(p), rect, true, finish);
    } else if (img && img.animate && !ST.reduce) {
      img.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.97)" }], { duration: 320, easing: "ease-out", fill: "forwards" }).onfinish = finish;
    } else finish();
  }

  /* swipe left/right to step, down to close */
  var dragged = false;
  function swipe() {
    var x0 = 0, y0 = 0, down = false, dx = 0, dy = 0;
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = true; dragged = false; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
    });
    window.addEventListener("pointermove", function (e) {
      if (!down || !img) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragged = true;
      if (!dragged) return;
      if (Math.abs(dy) > Math.abs(dx) && dy > 0) img.style.transform = "translateY(" + dy + "px) scale(" + (1 - Math.min(dy, 300) / 1500) + ")";
      else img.style.transform = "translateX(" + dx * 0.6 + "px)";
    });
    window.addEventListener("pointerup", function () {
      if (!down) return;
      down = false;
      if (!img) return;
      var cur = img;
      if (dragged && Math.abs(dy) > Math.abs(dx) && dy > 110) { close(); return; }
      if (dragged && Math.abs(dx) > 60) { cur.style.transform = ""; go(dx < 0 ? 1 : -1); }
      else if (cur.animate && cur.style.transform) {
        var t = cur.style.transform;
        cur.style.transform = "";
        cur.animate([{ transform: t }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" });
      }
      setTimeout(function () { dragged = false; }, 0);
    });
  }

  ST.viewer = { open: openAt, close: close, isOpen: function () { return open; } };
})();
