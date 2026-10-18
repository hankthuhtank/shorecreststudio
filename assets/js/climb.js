/* ==========================================================================
   Home: the climb. A trail runs from "From shore" up to "to crest." with the
   photographs set along it, coast first, mountains last. The photograph you
   are nearest grows out of its place on the trail into a full print.
   Mouse: point along the trail. Touch: drag sideways or tap a photo. Keys: arrows.
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST;
  var hero = document.querySelector("[data-climb]");
  if (!ST || !hero) return;
  var stops = ST.$$(".climb__stop", hero),
    n = stops.length;
  if (n < 2) return;
  var ahead = ST.$(".climb__trail-ahead", hero),
    done = ST.$(".climb__trail-done", hero);
  var thread = ST.$(".climb__thread", hero),
    spot = ST.$(".climb__spot", hero);
  var cap = ST.$(".climb__cap", hero),
    capTitle = ST.$(".climb__cap-title", hero),
    capPlace = ST.$(".climb__cap-place", hero);
  var from = ST.$(".climb__from", hero),
    to = ST.$(".climb__to", hero),
    by = ST.$(".climb__by", hero);
  var stacked = window.matchMedia(
    "(max-width: 760px), (max-width: 1100px) and (orientation: portrait)",
  );

  var W = 0,
    H = 0,
    pw = 0,
    ph = 0,
    tw = 0,
    th = 0,
    L = 0,
    smin = 0.2,
    span = 1,
    pts = [],
    small = false,
    dirty = true,
    visible = true;
  var p = 0,
    target = 0,
    dom = -1;
  var intro = null,
    touched = false,
    travel = 0,
    drag = null,
    lastDrag = 0,
    pointer = "mouse";

  stops.forEach(function (s, i) {
    s.firstElementChild.style.setProperty("--n", i);
    s.classList.add("is-thumb");
  });

  function box(el) {
    return {
      l: el.offsetLeft,
      t: el.offsetTop,
      r: el.offsetLeft + el.offsetWidth,
      b: el.offsetTop + el.offsetHeight,
    };
  }

  // a smooth path through sampled points (Catmull-Rom as cubic Béziers)
  function smooth(q) {
    var d = "M" + q[0][0].toFixed(1) + " " + q[0][1].toFixed(1);
    for (var i = 0; i < q.length - 1; i++) {
      var a = q[Math.max(0, i - 1)],
        b = q[i],
        c = q[i + 1],
        e = q[Math.min(q.length - 1, i + 2)];
      d +=
        "C" +
        (b[0] + (c[0] - a[0]) / 6).toFixed(1) +
        " " +
        (b[1] + (c[1] - a[1]) / 6).toFixed(1) +
        " " +
        (c[0] - (e[0] - b[0]) / 6).toFixed(1) +
        " " +
        (c[1] - (e[1] - b[1]) / 6).toFixed(1) +
        " " +
        c[0].toFixed(1) +
        " " +
        c[1].toFixed(1);
    }
    return d;
  }

  function measure() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    pw = stops[0].offsetWidth;
    ph = stops[0].offsetHeight;
    small = stacked.matches;
    var f = box(from),
      t = box(to),
      b = box(by),
      A,
      B,
      C,
      amp,
      zz;
    // the trail leaves from the word "shore", runs along the coast, then climbs switchbacks up to "crest."
    if (small) {
      A = { x: f.l + 6, y: f.t - 34 };
      B = { x: t.r - 34, y: b.b + 28 };
      C = { x: W - 52, y: A.y - 18 };
      amp = H * 0.011;
      zz = W * 0.03;
    } else {
      A = { x: f.r + W * 0.03, y: (f.t + f.b) / 2 };
      B = { x: t.l - W * 0.02, y: t.b - (t.b - t.t) * 0.15 };
      C = { x: B.x - W * 0.015, y: A.y - H * 0.05 };
      amp = H * 0.016;
      zz = W * 0.028;
    }
    var q = [],
      k,
      u;
    for (k = 0; k <= 30; k++) {
      u = k / 30;
      q.push([
        A.x + (C.x - A.x) * u,
        A.y + (C.y - A.y) * u * u + amp * Math.sin(u * Math.PI * 5) * Math.pow(1 - u, 0.6),
      ]);
    }
    for (k = 1; k <= 40; k++) {
      u = k / 40;
      q.push([
        C.x + (B.x - C.x) * u + zz * Math.sin(u * Math.PI * 3.5) * (1 - u * 0.4),
        C.y + (B.y - C.y) * u,
      ]);
    }
    var d = smooth(q);
    ahead.setAttribute("d", d);
    done.setAttribute("d", d);
    L = ahead.getTotalLength();
    done.style.strokeDasharray = L + " " + L;
    span = Math.max(120, small ? W * 0.7 : C.x - A.x + (A.y - B.y) * 0.6);
    tw = Math.min(small ? 30 : ST.clamp(W * 0.034, 46, 64), (L / (n - 1)) * 0.62);
    th = (tw * ph) / pw;
    smin = tw / pw;
    var capH = cap.offsetHeight + 12;
    pts = stops.map(function (s, i) {
      var pt = ahead.getPointAtLength((L * i) / (n - 1)),
        uu = i / (n - 1),
        m = uu * uu * (3 - 2 * uu);
      // each print lifts into the open space: straight up off the coast, out to the left off the climb
      var dx = -m,
        dy = -(1 - m),
        len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      var reach = (Math.abs(dx) * (pw + tw)) / 2 + (Math.abs(dy) * (ph + th)) / 2 + 18;
      var cx = pt.x + dx * reach,
        cy = pt.y + dy * reach;
      cx = ST.clamp(cx, (small ? 16 : W * 0.03) + pw / 2, W - (small ? 24 : 16) - pw / 2);
      var l = cx - pw / 2,
        r = cx + pw / 2;
      var top = Math.max(var_hdr(), r > Math.min(t.l, b.l) - 12 ? b.b + 14 : 0) + ph / 2;
      var bottom = l < f.r + 12 ? f.t - 14 : H - 16;
      // and above the coastal part of the trail, so no photograph there is covered
      if (r > A.x - tw && l < C.x + tw)
        bottom = Math.min(bottom, Math.min(A.y, C.y) - amp - th / 2 - 12);
      bottom -= capH + ph / 2;
      cy = ST.clamp(cy, top, Math.max(top, bottom));
      return { x: pt.x, y: pt.y, cx: cx, cy: cy };
    });
    dirty = true;
  }
  function var_hdr() {
    var h = document.querySelector(".hdr");
    return (h ? h.offsetHeight : 80) + 10;
  }

  function setDominant(i) {
    if (i === dom) return;
    if (dom >= 0) {
      stops[dom].setAttribute("tabindex", "-1");
      stops[dom].classList.add("is-thumb");
    }
    dom = i;
    var s = stops[i];
    s.setAttribute("tabindex", "0");
    s.classList.remove("is-thumb");
    capTitle.textContent = s.getAttribute("data-title");
    capPlace.textContent = s.getAttribute("data-place");
  }

  function render() {
    var pi = p * (n - 1);
    setDominant(Math.round(pi));
    var ed = 0,
      rx = 0,
      ry = 0,
      rs = 1;
    for (var i = 0; i < n; i++) {
      var w = Math.max(0, 1 - Math.abs(pi - i) / 1.1),
        e = w * w * (3 - 2 * w),
        s = smin + (1 - smin) * e,
        P = pts[i];
      var x = P.x + (P.cx - P.x) * e,
        y = P.y + (P.cy - P.y) * e;
      stops[i].style.transform =
        "translate3d(" +
        (x - pw / 2).toFixed(1) +
        "px," +
        (y - ph / 2).toFixed(1) +
        "px,0) scale(" +
        s.toFixed(4) +
        ")";
      stops[i].style.zIndex = 1 + Math.round(e * 50);
      if (i === dom) {
        ed = e;
        rx = x;
        ry = y;
        rs = s;
      }
    }
    done.style.strokeDashoffset = (L * (1 - p)).toFixed(1);
    // a thread from the photograph back to its place on the trail
    var P0 = pts[dom],
      hw = (pw * rs) / 2,
      hh = (ph * rs) / 2;
    var ex = ST.clamp(P0.x, rx - hw, rx + hw),
      ey = ST.clamp(P0.y, ry - hh, ry + hh);
    thread.setAttribute("x1", P0.x.toFixed(1));
    thread.setAttribute("y1", P0.y.toFixed(1));
    thread.setAttribute("x2", ex.toFixed(1));
    thread.setAttribute("y2", ey.toFixed(1));
    thread.style.opacity = ed.toFixed(3);
    spot.setAttribute("cx", P0.x.toFixed(1));
    spot.setAttribute("cy", P0.y.toFixed(1));
    spot.style.opacity = ed.toFixed(3);
    // the label sits under the photograph
    var cx = Math.min(rx - hw, W - cap.offsetWidth - 16);
    cap.style.transform =
      "translate3d(" + cx.toFixed(1) + "px," + (ry + hh + 12).toFixed(1) + "px,0)";
    cap.style.opacity = ST.clamp((ed - 0.45) / 0.4).toFixed(3);
  }

  /* ---------------------------------------------------------------- input */
  function takeOver() {
    touched = true;
    intro = null;
  }
  // nearest point on the line through the photographs, as a fraction of the climb
  function project(x, y) {
    var best = 0,
      bd = Infinity;
    for (var i = 0; i < n - 1; i++) {
      var a = pts[i],
        b = pts[i + 1],
        dx = b.x - a.x,
        dy = b.y - a.y;
      var t = ST.clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1));
      var px = a.x + dx * t - x,
        py = a.y + dy * t - y,
        dd = px * px + py * py;
      if (dd < bd) {
        bd = dd;
        best = i + t;
      }
    }
    return best / (n - 1);
  }
  hero.addEventListener(
    "pointermove",
    function (e) {
      if (e.pointerType === "touch") {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) {
          drag.moved = true;
          hero.classList.add("is-dragging");
        }
        target = ST.clamp(drag.p + dx / span);
        return;
      }
      // a resting hand nudges the mouse; let the opening walk finish unless the pointer really moves
      if (intro) {
        travel += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        if (travel < 90) return;
      }
      takeOver();
      var r = hero.getBoundingClientRect();
      target = project(e.clientX - r.left, e.clientY - r.top);
    },
    { passive: true },
  );
  hero.addEventListener(
    "pointerdown",
    function (e) {
      pointer = e.pointerType;
      if (e.pointerType !== "touch") return;
      takeOver();
      drag = { x: e.clientX, p: target, moved: false };
    },
    { passive: true },
  );
  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      lastDrag = performance.now();
      target = Math.round(target * (n - 1)) / (n - 1);
    }
    drag = null;
    hero.classList.remove("is-dragging");
  }
  hero.addEventListener("pointerup", endDrag);
  hero.addEventListener("pointercancel", endDrag);

  stops.forEach(function (s, i) {
    s.addEventListener("click", function (e) {
      if (performance.now() - lastDrag < 350) {
        e.preventDefault();
        return;
      }
      // on touch, the first tap walks the trail to a photograph and the second opens it
      if (pointer === "touch" && i !== dom) {
        e.preventDefault();
        takeOver();
        target = i / (n - 1);
      }
    });
    s.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });
    s.addEventListener("focus", function () {
      if (pointer !== "touch") {
        takeOver();
        target = i / (n - 1);
      }
    });
    s.addEventListener("keydown", function (e) {
      var j = {
        ArrowLeft: i - 1,
        ArrowUp: i - 1,
        ArrowRight: i + 1,
        ArrowDown: i + 1,
        Home: 0,
        End: n - 1,
      }[e.key];
      if (j == null) return;
      e.preventDefault();
      j = ST.clamp(j, 0, n - 1);
      takeOver();
      target = j / (n - 1);
      stops[j].setAttribute("tabindex", "0");
      stops[j].focus();
    });
  });

  /* ---------------------------------------------------------------- frame loop */
  ST.raf(function (t, dt) {
    if (!visible) return;
    if (intro) {
      var q = ST.clamp((t - intro.start) / intro.ms);
      target = ST.ease.io(q);
      if (q >= 1) intro = null;
    }
    var prev = p;
    p += (target - p) * (ST.reduce ? 1 : 1 - Math.pow(1 - 0.14, dt / 16.7));
    if (Math.abs(target - p) < 0.0004) p = target;
    if (p !== prev || dirty) {
      dirty = false;
      render();
    }
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      dirty = true;
    }).observe(hero);
  }
  window.addEventListener("resize", ST.debounce(measure, 100));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  measure();
  render();
  requestAnimationFrame(function () {
    hero.classList.add("is-set");
  });

  // once the photographs are ready, walk the trail from the shore up to the crest
  if (!ST.reduce) {
    var imgs = ST.$$("img", ST.$(".climb__stops", hero));
    var ready = Promise.all(
      imgs.map(function (img) {
        return img.decode ? img.decode().catch(function () {}) : null;
      }),
    );
    Promise.race([
      ready,
      new Promise(function (res) {
        setTimeout(res, 3000);
      }),
    ]).then(function () {
      setTimeout(function () {
        if (!touched) intro = { start: performance.now(), ms: 6000 };
      }, 1300);
    });
  }
})();
