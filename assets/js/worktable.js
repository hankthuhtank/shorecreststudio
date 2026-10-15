/* ==========================================================================
   Home: the worktable. A contact sheet on the mat, the selects circled in
   grease pencil, and a loupe that reads the frames.
   Positions are kept in sheet units: the paper is 800 x 1000.
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST;
  var desk = document.querySelector("[data-desk]");
  if (!ST || !desk) return;
  var sheet = ST.$("[data-sheet]", desk), paper = ST.$(".sheet__paper", sheet);
  var loupe = ST.$(".loupe", sheet), view = ST.$(".loupe__view", loupe);
  var frames = ST.$$(".frame", paper);
  if (!frames.length) return;
  var MAG = 2.2, W = 800, H = 1000;

  /* ---------------------------------------------------------------- grease pencil */
  function circlePath(cx, cy, half, seed) {
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var rx = half * (1.12 + rnd() * .06), ry = half * (1.06 + rnd() * .06);
    var tilt = (rnd() - .5) * .45, a0 = rnd() * Math.PI * 2, sweep = Math.PI * 2 + .45 + rnd() * .3;
    var p1 = rnd() * 6, p2 = rnd() * 6, pts = [], n = 64;
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = a0 + t * sweep;
      // a hand never closes the loop exactly: it drifts outward and wobbles a little
      var k = 1 + .028 * Math.sin(2 * a + p1) + .014 * Math.sin(5 * a + p2) + .06 * t;
      var ex = Math.cos(a) * rx * k, ey = Math.sin(a) * ry * k;
      pts.push([cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)]);
    }
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var j = 1; j < pts.length - 1; j++) {
      var mx = (pts[j][0] + pts[j + 1][0]) / 2, my = (pts[j][1] + pts[j + 1][1]) / 2;
      d += "Q" + pts[j][0].toFixed(1) + " " + pts[j][1].toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
    }
    return d;
  }

  /* ---------------------------------------------------------------- geometry */
  var u = 1, R = 0, boxes = [], selects = [], tilt = 0;
  function measure() {
    u = paper.offsetWidth / W || 1;
    R = loupe.offsetWidth / 2;
    var m = getComputedStyle(sheet).transform;
    tilt = 0;
    if (m && m !== "none") { var v = m.match(/-?[\d.e]+/g).map(Number); tilt = Math.atan2(v[1], v[0]); }
    boxes = frames.map(function (f) {
      var s = f.parentElement;
      return {
        el: f, sel: f.hasAttribute("data-select"),
        x: (s.offsetLeft + f.offsetLeft) / u, y: (s.offsetTop + f.offsetTop) / u,
        w: f.offsetWidth / u, h: f.offsetHeight / u,
        title: f.getAttribute("data-title"), place: f.getAttribute("data-place")
      };
    });
    boxes.forEach(function (b) { b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; });
    selects = boxes.filter(function (b) { return b.sel; });
    if (!selects.length) selects = boxes.slice(0, 1);
  }
  measure();

  var marks = ST.$(".sheet__marks", paper);
  marks.innerHTML = selects.map(function (b, i) {
    return '<path d="' + circlePath(b.cx, b.cy, b.w / 2, 4801 + i * 977) + '" style="--n:' + i + '"/>';
  }).join("");
  ST.$$("path", marks).forEach(function (p) { p.style.setProperty("--len", Math.ceil(p.getTotalLength() + 4)); });

  // the loupe shows a second copy of the paper, enlarged
  var copy = paper.cloneNode(true);
  ST.$$("a", copy).forEach(function (a) { a.setAttribute("tabindex", "-1"); a.removeAttribute("aria-label"); });
  ST.$$("img", copy).forEach(function (img) { img.alt = ""; });
  view.appendChild(copy);
  var notes = [ST.$(".sheet__note", paper), ST.$(".sheet__note", copy)];

  /* ---------------------------------------------------------------- loupe state */
  var idx = 0;
  selects.forEach(function (b, i) { if (b.el.hasAttribute("data-start")) idx = i; });
  var start = selects[idx];
  var x = start.cx, y = start.cy, tx = x, ty = y, lastX = NaN, lastY = NaN;
  var mode = "tour", modeAt = 0, stepAt = 0, shown = start, visible = true, pointer = "mouse";
  var TOUR_EVERY = 5200, REST_AFTER = 2600, PIN_FOR = 9000;

  function render() {
    var px = x * u, py = y * u;
    loupe.style.transform = "translate3d(" + (px - R).toFixed(2) + "px," + (py - R).toFixed(2) + "px,0)";
    view.style.transform = "translate3d(" + (R - px * MAG).toFixed(2) + "px," + (R - py * MAG).toFixed(2) + "px,0) scale(" + MAG + ")";
  }
  function note(b) {
    if (!b || b === shown) return;
    shown = b;
    notes.forEach(function (n) {
      n.firstChild.textContent = b.title;
      n.lastChild.textContent = b.place;
      n.classList.remove("is-new");
      void n.offsetWidth;
      n.classList.add("is-new");
    });
  }
  function frameAt(px, py) {
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }
  function goTo(b, why) {
    tx = b.cx; ty = b.cy;
    mode = why; modeAt = performance.now();
    note(b);
  }
  function nearestSelect() {
    var best = 0, bd = Infinity;
    selects.forEach(function (b, i) { var d = Math.hypot(b.cx - x, b.cy - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* ---------------------------------------------------------------- pointer, touch, keyboard */
  function toSheet(cx, cy) {
    var r = sheet.getBoundingClientRect();
    var dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    var c = Math.cos(-tilt), s = Math.sin(-tilt);
    return { x: (dx * c - dy * s) / u + W / 2, y: (dx * s + dy * c) / u + H / 2 };
  }
  function leave() {
    if (mode !== "follow") return;
    sheet.classList.remove("is-following");
    mode = "rest"; modeAt = performance.now();
  }
  desk.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    var p = toSheet(e.clientX, e.clientY);
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) { leave(); return; }
    if (mode !== "follow") sheet.classList.add("is-following");
    mode = "follow"; modeAt = performance.now();
    tx = Math.max(20, Math.min(W - 20, p.x));
    ty = Math.max(20, Math.min(H - 20, p.y));
  }, { passive: true });
  desk.addEventListener("pointerleave", leave);
  sheet.addEventListener("pointerdown", function (e) { pointer = e.pointerType; }, { passive: true });

  frames.forEach(function (f, i) {
    // on touch, the first tap brings the loupe to the frame and the second tap opens it
    f.addEventListener("click", function (e) {
      if (pointer !== "touch" || e.metaKey || e.ctrlKey) return;
      var b = boxes[i];
      if (mode === "pinned" && Math.hypot(tx - b.cx, ty - b.cy) < 1) return;
      e.preventDefault();
      goTo(b, "pinned");
    });
    f.addEventListener("focus", function () { if (pointer !== "touch") goTo(boxes[i], "pinned"); });
    f.addEventListener("blur", function () { if (mode === "pinned") { mode = "rest"; modeAt = performance.now() - REST_AFTER + 800; } });
  });

  /* ---------------------------------------------------------------- frame loop */
  ST.raf(function (t, dt) {
    if (!visible) return;
    if (mode === "rest" && t - modeAt > REST_AFTER) { idx = nearestSelect(); goTo(selects[idx], "tour"); stepAt = t; }
    if (mode === "pinned" && pointer === "touch" && t - modeAt > PIN_FOR) { mode = "rest"; modeAt = t - REST_AFTER; }
    if (mode === "tour" && !ST.reduce && selects.length > 1 && t - stepAt > TOUR_EVERY) {
      idx = (idx + 1) % selects.length; goTo(selects[idx], "tour"); stepAt = t;
    }
    var k = ST.reduce ? 1 : 1 - Math.pow(1 - (mode === "follow" ? .24 : .055), dt / 16.7);
    x += (tx - x) * k; y += (ty - y) * k;
    if (Math.abs(tx - x) + Math.abs(ty - y) < .05) { x = tx; y = ty; }
    if (x !== lastX || y !== lastY) {
      lastX = x; lastY = y;
      render();
      if (mode === "follow") note(frameAt(x, y));
    }
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) stepAt = performance.now(); }).observe(desk);
  }
  window.addEventListener("resize", ST.debounce(function () { measure(); lastX = NaN; }, 120));

  render();
  stepAt = performance.now() + 1400;
  requestAnimationFrame(function () { desk.classList.add("is-set"); });
})();
