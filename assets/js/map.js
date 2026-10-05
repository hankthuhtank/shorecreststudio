/* ==========================================================================
   The atlas: a canvas map of the West with the road routes drawn on it.
   World units are kilometres (Albers equal-area, see tools/build.py).
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST, RAW = window.ST_GEO;
  if (!ST || !RAW) return;

  var BG = "#f8f8f5", LAND = "#e3e8e2", EDGE = "rgba(48, 68, 88, .2)", BORDER = "rgba(255, 255, 255, .95)";
  var LABEL = "25, 41, 40";

  /* ---------------------------------------------------------------- geometry, decoded once */
  function decode(arr, unit) {
    var out = new Float32Array(arr.length), x = 0, y = 0;
    for (var i = 0; i < arr.length; i += 2) { x += arr[i]; y += arr[i + 1]; out[i] = x * unit; out[i + 1] = y * unit; }
    return out;
  }
  function pathOf(pts, close, path) {
    path = path || new Path2D();
    path.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
    if (close) path.closePath();
    return path;
  }
  var G = null;
  function geo() {
    if (G) return G;
    G = { land: new Path2D(), grat: new Path2D(), states: [], trips: {} };
    RAW.states.forEach(function (s) {
      s.r.forEach(function (r) { pathOf(decode(r, 0.1), true, G.land); });
      G.states.push({ n: s.n, x: s.l[0], y: s.l[1] });
    });
    RAW.grat.forEach(function (g) { pathOf(decode(g, 1), false, G.grat); });
    Object.keys(RAW.trips).forEach(function (id) {
      var t = RAW.trips[id], legs = [], total = 0;
      t.legs.forEach(function (l, i) {
        if (!l) { legs.push(null); return; }
        var p = decode(l.p, 0.01), n = p.length / 2, cum = new Float32Array(n);
        for (var j = 1; j < n; j++) cum[j] = cum[j - 1] + Math.hypot(p[2 * j] - p[2 * j - 2], p[2 * j + 1] - p[2 * j - 1]);
        var b = [Infinity, Infinity, -Infinity, -Infinity];
        for (var q = 0; q < p.length; q += 2) {
          if (p[q] < b[0]) b[0] = p[q]; if (p[q + 1] < b[1]) b[1] = p[q + 1];
          if (p[q] > b[2]) b[2] = p[q]; if (p[q + 1] > b[3]) b[3] = p[q + 1];
        }
        var m = Math.min(l.m, n - 1);
        legs.push({ p: p, cum: cum, len: cum[n - 1], start: total, m: m, mLen: cum[m], d: l.d, b: b, path: pathOf(p, false) });
        total += cum[n - 1];
      });
      G.trips[id] = { color: t.color, rgb: hexRgb(t.color), bounds: t.bounds, legs: legs, total: total, stops: t.stops, labels: t.labels, spots: t.spots };
    });
    return G;
  }
  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)].join(","); }

  /* ---------------------------------------------------------------- smooth zoom (van Wijk & Nuij, "Smooth and efficient zooming and panning") */
  function cosh(x) { return ((x = Math.exp(x)) + 1 / x) / 2; }
  function sinh(x) { return ((x = Math.exp(x)) - 1 / x) / 2; }
  function tanh(x) { return ((x = Math.exp(2 * x)) - 1) / (x + 1); }
  function smoothZoom(p0, p1, rho) {
    var rho2 = rho * rho, rho4 = rho2 * rho2;
    var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2];
    var dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, S, f;
    if (d2 < 1e-9) {
      S = Math.log(w1 / w0) / rho;
      f = function (t) { return [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)]; };
    } else {
      var d1 = Math.sqrt(d2),
        b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1),
        b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1),
        r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0),
        r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / rho;
      f = function (t) {
        var s = t * S, c0 = cosh(r0), u = w0 / (rho2 * d1) * (c0 * tanh(rho * s + r0) - sinh(r0));
        return [ux0 + u * dx, uy0 + u * dy, w0 * c0 / cosh(rho * s + r0)];
      };
    }
    f.S = Math.abs(S);
    return f;
  }

  /* ---------------------------------------------------------------- the atlas */
  function Atlas(canvas, opts) {
    var self = this;
    opts = opts || {};
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.g = geo();
    this.opts = opts;
    this.order = opts.trips || Object.keys(this.g.trips);
    this.state = {};
    this.order.forEach(function (id) { self.state[id] = { alpha: 1, ahead: false, d: Infinity, w: 2.6, head: false }; });
    this.cam = { x: 0, y: 0, k: 1 };
    this.anims = [];
    this.hooks = [];
    this.dirty = true;
    this.visible = true;
    this.minW = opts.minWidth || 150;  // never zoom closer than this many km across
    this.resize();
    if ("ResizeObserver" in window) new ResizeObserver(function () { self.resize(); }).observe(canvas.parentNode);
    else window.addEventListener("resize", function () { self.resize(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; if (self.visible) self.dirty = true; }).observe(canvas);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.dirty = true; });
    ST.raf(function (t) { self.tick(t); });
    (ST.atlases = ST.atlases || []).push(this);
  }

  Atlas.prototype.resize = function () {
    var r = this.c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width || !r.height) return;
    var oldSafe = this.W ? this.safe() : null, oldK = this.cam.k;
    this.W = r.width; this.H = r.height; this.dpr = dpr;
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    if (this.fitTo) this.cam = this.fit(this.fitTo, this.fitPad);
    else if (oldSafe) { var s = this.safe(); this.cam.k = oldK * Math.min(s.w / oldSafe.w, s.h / oldSafe.h); }
    this.dirty = true;
    if (this.opts.onResize) this.opts.onResize(this);
  };

  /* the part of the canvas not covered by cards, rails and headers */
  Atlas.prototype.safe = function () {
    var p = this.opts.padding ? this.opts.padding(this) : { l: 0, t: 0, r: 0, b: 0 };
    var w = Math.max(80, this.W - p.l - p.r), h = Math.max(80, this.H - p.t - p.b);
    return { l: p.l, t: p.t, w: w, h: h, cx: p.l + w / 2, cy: p.t + h / 2 };
  };

  Atlas.prototype.fit = function (b, pad) {
    var s = this.safe(), bw = Math.max(b[2] - b[0], 1), bh = Math.max(b[3] - b[1], 1);
    pad = pad == null ? 0.1 : pad;
    var k = Math.min(s.w / bw, s.h / bh) * (1 - pad * 2);
    k = Math.min(k, s.w / this.minW);
    return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, k: k };
  };

  Atlas.prototype.toScreen = function (x, y) {
    var s = this.safe(), k = this.cam.k;
    return { x: (x - this.cam.x) * k + s.cx, y: (y - this.cam.y) * k + s.cy };
  };

  Atlas.prototype.jump = function (cam) { this.cam = { x: cam.x, y: cam.y, k: cam.k }; this.flight = null; this.dirty = true; };

  /* fly the camera; long jumps pull back a little first, like looking up from a map */
  Atlas.prototype.fly = function (cam, opts) {
    opts = opts || {};
    if (ST.reduce || opts.instant) { this.jump(cam); if (opts.done) opts.done(); return 0; }
    var s = this.safe(), S = Math.max(s.w, s.h);
    var f = smoothZoom([this.cam.x, this.cam.y, S / this.cam.k], [cam.x, cam.y, S / cam.k], opts.rho || 1.25);
    var ms = opts.ms || ST.clamp(520 + f.S * 520, 750, 2600);
    this.flight = { f: f, S: S, t0: performance.now(), ms: ms, done: opts.done, ease: opts.ease || ST.ease.io };
    this.dirty = true;
    return ms;
  };

  /* route state per trip: d = distance travelled (km along the polyline), Infinity = all of it */
  Atlas.prototype.set = function (id, props) {
    var st = this.state[id];
    if (!st) return;
    for (var k in props) st[k] = props[k];
    this.dirty = true;
  };
  Atlas.prototype.tween = function (id, prop, to, ms, ease, done) {
    var st = this.state[id];
    if (!st) return;
    this.anims = this.anims.filter(function (a) { return !(a.id === id && a.prop === prop); });
    var from = st[prop] === Infinity ? this.g.trips[id].total : st[prop];
    if (ST.reduce || !ms) { st[prop] = to; this.dirty = true; if (done) done(); return; }
    this.anims.push({ id: id, prop: prop, from: from, to: to, t0: performance.now(), ms: ms, ease: ease || ST.ease.io, done: done });
    this.dirty = true;
  };
  Atlas.prototype.busy = function () { return !!this.flight || this.anims.length > 0; };
  Atlas.prototype.onFrame = function (fn) { this.hooks.push(fn); };

  Atlas.prototype.trip = function (id) { return this.g.trips[id]; };
  Atlas.prototype.stopD = function (id, i) { var t = this.g.trips[id], l = t.legs[i]; return l ? l.start + l.mLen : 0; };
  Atlas.prototype.legEndD = function (id, i) { var l = this.g.trips[id].legs[i]; return l ? l.start + l.len : 0; };
  Atlas.prototype.legStartD = function (id, i) { var l = this.g.trips[id].legs[i]; return l ? l.start : 0; };
  Atlas.prototype.pointAt = function (id, d) {
    var t = this.g.trips[id];
    if (d <= 0) return { x: t.stops[0][0], y: t.stops[0][1] };
    for (var i = 1; i < t.legs.length; i++) {
      var l = t.legs[i];
      if (d <= l.start + l.len || i === t.legs.length - 1) return along(l, d - l.start);
    }
    return null;
  };
  function along(l, dd) {
    var cum = l.cum, p = l.p, n = cum.length;
    if (dd <= 0) return { x: p[0], y: p[1], j: 0 };
    if (dd >= l.len) return { x: p[2 * n - 2], y: p[2 * n - 1], j: n - 1 };
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < dd) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo], f = seg > 0 ? (dd - cum[lo]) / seg : 0;
    return { x: p[2 * lo] + (p[2 * hi] - p[2 * lo]) * f, y: p[2 * lo + 1] + (p[2 * hi + 1] - p[2 * lo + 1]) * f, j: lo };
  }
  Atlas.prototype.legBounds = function (id, i, extra) {
    var t = this.g.trips[id], l = t.legs[i], s = t.stops[i];
    var b = l ? l.b.slice() : [s[0], s[1], s[0], s[1]];
    (extra || []).forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); });
    return b;
  };

  /* ---------------------------------------------------------------- frame */
  Atlas.prototype.tick = function (now) {
    var self = this, moved = false;
    if (this.flight) {
      var fl = this.flight, t = ST.clamp((now - fl.t0) / fl.ms), v = fl.f(fl.ease(t));
      this.cam = { x: v[0], y: v[1], k: fl.S / v[2] };
      moved = true;
      if (t >= 1) { this.flight = null; if (fl.done) fl.done(); }
    }
    if (this.anims.length) {
      var finished = [];
      this.anims.forEach(function (a) {
        var t = ST.clamp((now - a.t0) / a.ms);
        self.state[a.id][a.prop] = a.from + (a.to - a.from) * a.ease(t);
        if (t >= 1) finished.push(a);
      });
      if (finished.length) {
        this.anims = this.anims.filter(function (a) { return finished.indexOf(a) < 0; });
        finished.forEach(function (a) { if (a.done) a.done(); });
      }
      moved = true;
    }
    if ((moved || this.dirty) && this.visible) {
      this.dirty = false;
      this.draw();
      for (var i = 0; i < this.hooks.length; i++) this.hooks[i](this);
    }
  };

  Atlas.prototype.draw = function () {
    var ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr, cam = this.cam, k = cam.k, s = this.safe();
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    var tx = s.cx - cam.x * k, ty = s.cy - cam.y * k;
    var vw = W / k, z = ST.clamp((vw - 320) / 1500), g = this.g, self = this;

    // land: an edge, the fill, then white state lines. It fades back as you zoom in (the outlines are coarse).
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.62 + 0.38 * z;
    ctx.strokeStyle = EDGE; ctx.lineWidth = 2.2 / k; ctx.stroke(g.land);
    ctx.fillStyle = LAND; ctx.fill(g.land);
    ctx.globalAlpha = 0.5 + 0.5 * z;
    ctx.strokeStyle = BORDER; ctx.lineWidth = 1.2 / k; ctx.stroke(g.land);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(" + LABEL + ", .07)"; ctx.lineWidth = 1 / k; ctx.stroke(g.grat);

    // words on the map, in screen space (kept out from under any text panel laid over the map)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var avoid = this.opts.avoid ? this.opts.avoid(this) : [];
    function clear(X, Y) {
      for (var i = 0; i < avoid.length; i++) { var r = avoid[i]; if (X > r.x && X < r.x + r.w && Y > r.y && Y < r.y + r.h) return false; }
      return true;
    }
    var small = W < 600;
    var regionA = small ? 0 : ST.clamp((vw - 700) / 600) * 0.3;
    if (regionA > 0.01 && this.opts.regions !== false) {
      RAW.regions.forEach(function (r) {
        if (self.opts.regions === "ocean" && r.n !== "Pacific Ocean") return;
        var X = (r.x - cam.x) * k + s.cx, Y = (r.y - cam.y) * k + s.cy;
        if (X < -200 || X > W + 200 || Y < -50 || Y > H + 50 || !clear(X, Y)) return;
        ctx.save();
        ctx.translate(X, Y); ctx.rotate(r.r * Math.PI / 180);
        ctx.globalAlpha = regionA * (r.n === "Pacific Ocean" ? 1.5 : 1);
        ctx.font = "italic 380 " + r.s + "px Fraunces, Georgia, serif";
        ctx.fillStyle = "rgb(" + LABEL + ")";
        ctx.fillText(r.n, 0, 0);
        ctx.restore();
      });
    }
    // state names only once the states are big enough on screen to hold them
    var stateA = ST.clamp(Math.min((vw - 240) / 260, (5200 - vw) / 1400)) * ST.clamp((k - 0.105) / 0.05) * 0.42;
    if (stateA > 0.01 && this.opts.states !== false) {
      ctx.globalAlpha = stateA;
      ctx.font = "italic 380 13px Fraunces, Georgia, serif";
      ctx.fillStyle = "rgb(" + LABEL + ")";
      g.states.forEach(function (st) {
        var X = (st.x - cam.x) * k + s.cx, Y = (st.y - cam.y) * k + s.cy;
        if (X > -60 && X < W + 60 && Y > -20 && Y < H + 20 && clear(X, Y)) ctx.fillText(st.n, X, Y);
      });
      ctx.globalAlpha = 1;
    }

    // routes
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    this.order.forEach(function (id) {
      var st = self.state[id], T = g.trips[id];
      if (st.alpha <= 0.01) return;
      ctx.globalAlpha = st.alpha;
      if (st.ahead) {
        ctx.setLineDash([0.1 / k, 6 / k]);
        ctx.strokeStyle = "rgba(" + T.rgb + ", .55)"; ctx.lineWidth = 2.4 / k;
        T.legs.forEach(function (l) { if (l) ctx.stroke(l.path); });
        ctx.setLineDash([]);
      }
      var d = st.d === Infinity ? T.total : st.d;
      if (d <= 0) return;
      var done = new Path2D(), headPt = null;
      for (var i = 1; i < T.legs.length; i++) {
        var l = T.legs[i];
        if (d >= l.start + l.len) { done.addPath(l.path); continue; }
        if (d > l.start) {
          var a = along(l, d - l.start);
          done.moveTo(l.p[0], l.p[1]);
          for (var j = 1; j <= a.j; j++) done.lineTo(l.p[2 * j], l.p[2 * j + 1]);
          done.lineTo(a.x, a.y);
          headPt = a;
        }
        break;
      }
      ctx.strokeStyle = "rgba(248, 248, 245, .92)"; ctx.lineWidth = (st.w + 4) / k; ctx.stroke(done);
      ctx.strokeStyle = T.color; ctx.lineWidth = st.w / k; ctx.stroke(done);
      if (st.head && headPt) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var X = (headPt.x - cam.x) * k + s.cx, Y = (headPt.y - cam.y) * k + s.cy;
        ctx.fillStyle = "rgba(" + T.rgb + ", .16)";
        ctx.beginPath(); ctx.arc(X, Y, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(X, Y, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = T.color;
        ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
      }
    });
    ctx.globalAlpha = 1;
  };

  ST.Atlas = Atlas;
  ST.geo = geo;
})();
