/* ==========================================================================
   Shorecrest Studio core: smooth scroll, reveals, header, menu, photo helpers.
   ========================================================================== */
(function () {
  "use strict";

  var ST = (window.ST = window.ST || {});
  var html = document.documentElement;
  html.classList.add("js");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  ST.reduce = reduce;
  ST.fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  ST.cfg = window.ST_CONFIG || {};

  /* ---------------------------------------------------------------- utils */
  ST.clamp = function (v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return v < a ? a : v > b ? b : v; };
  ST.lerp = function (a, b, t) { return a + (b - a) * t; };
  ST.ease = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    io: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    sine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  };
  ST.$ = function (s, c) { return (c || document).querySelector(s); };
  ST.$$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  ST.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  ST.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  ST.param = function (k) { return new URLSearchParams(location.search).get(k); };
  ST.icon = {
    arrow: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
    back: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4M10 6l-6 6 6 6"/></svg>',
    close: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    play: '<svg class="i i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg class="i i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/></svg>',
    whole: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    pin: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>'
  };
  ST.miles = function (m) {
    var mi = m / 1609.344;
    mi = mi >= 100 ? Math.round(mi / 10) * 10 : Math.max(5, Math.round(mi / 5) * 5);
    return mi.toLocaleString("en-US");
  };

  /* ---------------------------------------------------------------- photographs + trips */
  ST.photos = window.ST_PHOTOS || [];
  ST.trips = window.ST_TRIPS || [];
  ST.photoById = {};
  ST.photos.forEach(function (p) { ST.photoById[p.id] = p; });
  ST.trip = function (id) { for (var i = 0; i < ST.trips.length; i++) if (ST.trips[i].id === id) return ST.trips[i]; return null; };
  ST.stopOf = function (p) {
    var t = ST.trip(p.trip);
    if (!t || !p.stop) return null;
    for (var i = 0; i < t.stops.length; i++) if (t.stops[i].id === p.stop) return { trip: t, stop: t.stops[i], index: i };
    return null;
  };
  ST.tripPhotos = function (tripId) { return ST.photos.filter(function (p) { return p.trip === tripId; }); };
  var PATH = "assets/img/photo/";
  ST.src = function (p, w) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), want = w * dpr, pick = p.s[p.s.length - 1];
    for (var i = 0; i < p.s.length; i++) { if (p.s[i] >= want) { pick = p.s[i]; break; } }
    return PATH + p.id + "-" + pick + ".webp";
  };
  ST.srcset = function (p, max) {
    return p.s.filter(function (w) { return !max || w <= max; }).map(function (w) { return PATH + p.id + "-" + w + ".webp " + w + "w"; }).join(", ");
  };
  ST.largest = function (p) { return PATH + p.id + "-" + p.s[p.s.length - 1] + ".webp"; };

  /* ---------------------------------------------------------------- frame loop + smooth scroll */
  var tasks = [];
  ST.raf = function (fn) { tasks.push(fn); return function () { var i = tasks.indexOf(fn); if (i > -1) tasks.splice(i, 1); }; };

  var lenis = null;
  if (!reduce && typeof window.Lenis === "function") {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    html.classList.add("lenis");
  }
  ST.lenis = lenis;

  ST.scroll = { y: window.scrollY, last: window.scrollY, dir: 1 };
  var dirty = true;
  function onScroll(y) {
    if (Math.abs(y - ST.scroll.last) > 0.5) ST.scroll.dir = y > ST.scroll.last ? 1 : -1;
    ST.scroll.last = y;
    ST.scroll.y = y;
    dirty = true;
  }
  if (lenis) lenis.on("scroll", function (e) { onScroll(e.scroll); });
  else window.addEventListener("scroll", function () { onScroll(window.scrollY); }, { passive: true });

  ST.scrollTo = function (target, opts) {
    opts = opts || {};
    if (lenis) { lenis.scrollTo(target, { duration: opts.duration || 1.3, offset: opts.offset || 0, immediate: !!opts.immediate }); return; }
    var y = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY + (opts.offset || 0);
    window.scrollTo({ top: y, behavior: reduce || opts.immediate ? "auto" : "smooth" });
  };
  ST.lockScroll = function (on) {
    if (lenis) on ? lenis.stop() : lenis.start();
    html.style.overflow = on ? "hidden" : "";
  };

  var lastT = performance.now();
  function frame(t) {
    var dt = Math.min(64, t - lastT);
    lastT = t;
    if (lenis) lenis.raf(t);
    if (dirty) { dirty = false; runScenes(); updateHeader(); }
    for (var i = 0; i < tasks.length; i++) tasks[i](t, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------------------------------------------------------------- scroll scenes: fn(progress 0..1) while el crosses the viewport */
  var scenes = [];
  ST.scene = function (el, fn) {
    if (!el) return null;
    var s = { el: el, fn: fn, top: 0, h: 0, p: -1 };
    scenes.push(s);
    measure(s);
    dirty = true;
    return s;
  };
  function measure(s) { var r = s.el.getBoundingClientRect(); s.top = r.top + ST.scroll.y; s.h = s.el.offsetHeight; }
  function runScenes() {
    var vh = window.innerHeight, y = ST.scroll.y;
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i], p = ST.clamp((y + vh - s.top) / (vh + s.h));
      if (p !== s.p) { s.p = p; s.fn(p); }
    }
  }
  ST.refresh = function () { scenes.forEach(measure); scenes.forEach(function (s) { s.p = -1; }); measureThemes(); dirty = true; };
  var refreshSoon = ST.debounce(ST.refresh, 150);
  window.addEventListener("resize", refreshSoon);
  window.addEventListener("load", ST.refresh);
  if ("ResizeObserver" in window) new ResizeObserver(refreshSoon).observe(document.body);

  /* ---------------------------------------------------------------- text splitting (line rises) */
  function tokens(node, wraps, out) {
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          out.push(/^\s+$/.test(part) ? { space: true } : { word: part, wraps: wraps.slice() });
        });
      } else if (n.nodeType === 1) {
        if (n.tagName === "BR") out.push({ br: true });
        else tokens(n, wraps.concat([n]), out);
      }
    });
    return out;
  }
  function wordHTML(t) {
    var h = ST.esc(t.word);
    for (var i = t.wraps.length - 1; i >= 0; i--) { var el = t.wraps[i].cloneNode(false); el.innerHTML = h; h = el.outerHTML; }
    return h;
  }
  ST.split = function (el) {
    if (!el._src) el._src = el.innerHTML;
    var holder = document.createElement("div");
    holder.innerHTML = el._src;
    var toks = tokens(holder, [], []);
    el.innerHTML = toks.map(function (t) {
      if (t.space) return " ";
      if (t.br) return '<br class="sw-br">';
      return '<span class="sw">' + wordHTML(t) + "</span>";
    }).join("");
    var lines = [], cur = null, lastTop = null;
    ST.$$(".sw, .sw-br", el).forEach(function (w) {
      if (w.classList.contains("sw-br")) { cur = null; lastTop = null; return; }
      var top = w.offsetTop;
      if (!cur || lastTop === null || Math.abs(top - lastTop) > 4) { cur = []; lines.push(cur); lastTop = top; }
      cur.push(w.innerHTML);
    });
    el.innerHTML = lines.map(function (ws, i) {
      return '<span class="ln" style="--i:' + i + '"><span class="ln__in">' + ws.join(" ") + "</span> </span>";
    }).join("");
    el._splitW = el.clientWidth;
    el.classList.add("is-split");
  };
  var resplit = ST.debounce(function () {
    ST.$$("[data-split].is-split").forEach(function (el) { if (el.clientWidth && Math.abs(el.clientWidth - el._splitW) > 2) ST.split(el); });
  }, 200);
  window.addEventListener("resize", resplit);

  /* ---------------------------------------------------------------- reveals */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }) : null;
  ST.observe = function (el) { if (!el) return; if (io && !reduce) io.observe(el); else el.classList.add("is-in"); };
  ST.reveal = function (scope) { ST.$$("[data-reveal]:not([data-manual]), [data-split]:not([data-manual]), [data-wipe]:not([data-manual])", scope).forEach(ST.observe); };

  /* ---------------------------------------------------------------- logo */
  ST.logoSVG = function () {
    var L = window.SC_LOGO;
    if (!L) return "";
    return '<svg viewBox="' + L.viewBox + '" role="img" aria-label="Shorecrest"><title>Shorecrest</title>' +
      '<path class="logo-a" fill-rule="evenodd" d="' + L.tide + '"/><path class="logo-b" fill-rule="evenodd" d="' + L.pine + '"/></svg>';
  };

  /* ---------------------------------------------------------------- header */
  var hdr, themed = [], hidden = false, anchorY = 0;
  function measureThemes() {
    themed = ST.$$("[data-header]").map(function (el) {
      var r = el.getBoundingClientRect();
      return { top: r.top + ST.scroll.y, bottom: r.bottom + ST.scroll.y, theme: el.getAttribute("data-header") };
    });
  }
  function themeAt(y) {
    for (var i = themed.length - 1; i >= 0; i--) if (y >= themed[i].top && y < themed[i].bottom) return themed[i].theme;
    return html.getAttribute("data-default-header") || "light";
  }
  function updateHeader() {
    if (!hdr) return;
    var y = ST.scroll.y;
    hdr.setAttribute("data-theme", themeAt(y + 36));
    hdr.classList.toggle("is-scrolled", y > 30 || html.classList.contains("hdr-solid"));
    var locked = html.classList.contains("menu-open") || html.classList.contains("hdr-pin");
    if (locked || y < 160) { hidden = false; anchorY = y; }
    else if (y - anchorY > 60) { hidden = true; anchorY = y; }
    else if (anchorY - y > 30) { hidden = false; anchorY = y; }
    else if ((ST.scroll.dir > 0 && y < anchorY) || (ST.scroll.dir < 0 && y > anchorY)) anchorY = y;
    hdr.classList.toggle("is-hidden", hidden);
  }
  ST.headerDirty = function () { dirty = true; };

  function initMenu() {
    var btn = ST.$(".menu-btn");
    if (!btn) return;
    function set(open) {
      html.classList.toggle("menu-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (lenis) open ? lenis.stop() : lenis.start();
      dirty = true;
    }
    btn.addEventListener("click", function () { set(!html.classList.contains("menu-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && html.classList.contains("menu-open")) { set(false); btn.focus(); } });
    ST.$$(".menu a").forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  /* ---------------------------------------------------------------- anchors */
  function initAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      ST.scrollTo(t, { offset: -10 });
    });
    ST.$$("[data-totop]").forEach(function (b) { b.addEventListener("click", function () { ST.scrollTo(0, { duration: 1.8 }); }); });
  }

  /* ---------------------------------------------------------------- images fade in once decoded */
  ST.fadeImages = function (scope) {
    ST.$$("img.fade-img:not(.is-loaded)", scope).forEach(function (img) {
      if (img.complete && img.naturalWidth) img.classList.add("is-loaded");
      else {
        img.addEventListener("load", function () { img.classList.add("is-loaded"); }, { once: true });
        img.addEventListener("error", function () { img.classList.add("is-loaded", "is-broken"); }, { once: true });
      }
    });
  };

  /* ---------------------------------------------------------------- config-driven links */
  function initConfigBits() {
    var c = ST.cfg;
    ST.$$("[data-store]").forEach(function (el) { if (c.storeUrl) el.href = c.storeUrl; else (el.closest("li") || el).hidden = true; });
    ST.$$("[data-contact]").forEach(function (el) { if (c.contactUrl) el.href = c.contactUrl; else (el.closest("li") || el).hidden = true; });
    ST.$$("[data-email]").forEach(function (el) {
      if (c.email) { el.href = "mailto:" + c.email; if (el.hasAttribute("data-show")) el.textContent = c.email; }
      else (el.closest("li") || el).hidden = true;
    });
    ST.$$("[data-social]").forEach(function (el) {
      var u = (c.social || {})[el.getAttribute("data-social")];
      if (u) el.href = u; else (el.closest("li") || el).hidden = true;
    });
    ST.$$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* ---------------------------------------------------------------- topographic contours (brand motif) */
  ST.contours = function (svg) {
    var rings = +svg.getAttribute("data-contours") || 6, seed = rings * 7919 + 17;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function smooth(pts) {
      var n = pts.length, d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (var i = 0; i < n; i++) {
        var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        d += "C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + " " +
          (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
      }
      return d + "Z";
    }
    var out = "";
    for (var c = 0; c < 3; c++) {
      var cx = 120 + rnd() * 760, cy = 120 + rnd() * 760, base = 40 + rnd() * 60, k1 = rnd() * 6, k2 = rnd() * 6;
      for (var r = 0; r < rings; r++) {
        var r0 = base + r * (34 + rnd() * 10), pts = [];
        for (var a = 0; a < 48; a++) {
          var t = a / 48 * Math.PI * 2;
          var rr = r0 * (1 + 0.2 * Math.sin(3 * t + k1 + r * 0.18) + 0.09 * Math.sin(5 * t + k2 - r * 0.12) + 0.04 * Math.sin(9 * t + k1 * 2));
          pts.push([cx + Math.cos(t) * rr * 1.15, cy + Math.sin(t) * rr * 0.85]);
        }
        out += '<path d="' + smooth(pts) + '"/>';
      }
    }
    svg.setAttribute("viewBox", "0 0 1000 1000");
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="1">' + out + "</g>";
  };

  /* ---------------------------------------------------------------- justified photo rows
     ST.jrows(el, photos, { height: fn(width) -> target row px, gap, onOpen(photos, index, tileEl) }) */
  ST.jrows = function (el, list, opts) {
    opts = opts || {};
    el.classList.add("jrows");
    el.innerHTML = list.map(function (p, i) {
      return '<a class="jph" href="' + ST.largest(p) + '" data-i="' + i + '" style="--ph:' + p.c + ';--n:' + (i % 12) + '" aria-label="' + ST.esc(p.title + ", " + p.place) + '">' +
        '<img class="jph__lq" src="' + p.q + '" alt="" aria-hidden="true">' +
        '<img class="fade-img" alt="' + ST.esc(p.alt) + '" loading="lazy" decoding="async" srcset="' + ST.srcset(p, 1600) + '">' +
        '<span class="jph__cap"><b>' + ST.esc(p.title) + "</b><span>" + ST.esc(p.place) + "</span></span></a>";
    }).join("");
    var tiles = ST.$$(".jph", el);
    function layout() {
      var W = el.clientWidth;
      if (!W) return;
      var gap = opts.gap != null ? opts.gap : W < 600 ? 6 : 12;
      el.style.setProperty("--jgap", gap + "px");
      var H = opts.height ? opts.height(W) : W < 600 ? 170 : W < 1000 ? 230 : 300;
      var row = [], sum = 0;
      function flush(last) {
        if (!row.length) return;
        var h = (W - gap * (row.length - 1)) / sum;
        if (last && h > H * 1.15) h = H;
        row.forEach(function (t, k) {
          var w = t.a * h;
          if (!last && k === row.length - 1) {
            // give the last tile the rounding remainder so the row is flush
            var used = 0;
            row.forEach(function (u, j) { if (j < k) used += Math.floor(u.a * h); });
            w = W - used - gap * (row.length - 1);
          } else w = Math.floor(w);
          t.el.style.width = w + "px";
          t.el.style.height = Math.round(h) + "px";
          var img = t.el.querySelector("img.fade-img");
          img.sizes = Math.ceil(w) + "px";
        });
        row = []; sum = 0;
      }
      tiles.forEach(function (t, i) {
        var p = list[i], a = p.w / p.h;
        row.push({ el: t, a: a });
        sum += a;
        if (sum * H + gap * (row.length - 1) >= W) flush(false);
      });
      flush(true);
    }
    layout();
    ST.fadeImages(el);
    var lw = el.clientWidth;
    window.addEventListener("resize", ST.debounce(function () { if (Math.abs(el.clientWidth - lw) > 1) { lw = el.clientWidth; layout(); } }, 120));
    el.addEventListener("click", function (e) {
      var a = e.target.closest(".jph");
      if (!a || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      var i = +a.getAttribute("data-i");
      if (opts.onOpen) opts.onOpen(list, i, a);
      else if (ST.viewer) ST.viewer.open(list, i, a);
    });
    if (opts.animate !== false) {
      tiles.forEach(function (t) {
        if (!io || reduce) return;
        var o = new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { t.classList.add("is-in-anim"); o.disconnect(); }
        }, { rootMargin: "0px 0px -4% 0px" });
        t.style.opacity = "0";
        o.observe(t);
        t.addEventListener("animationstart", function () { t.style.opacity = ""; }, { once: true });
      });
    }
    return { layout: layout, tiles: tiles };
  };

  /* ---------------------------------------------------------------- boot */
  function boot() {
    hdr = ST.$(".hdr");
    ST.$$("svg[data-contours]").forEach(ST.contours);
    ST.$$("[data-logo]").forEach(function (el) { var svg = ST.logoSVG(); if (svg) el.innerHTML = svg; });
    initMenu();
    initAnchors();
    initConfigBits();
    ST.fadeImages();
    measureThemes();
    var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    if (!reduce) {
      ST.$$("[data-parallax]").forEach(function (img) {
        var f = parseFloat(img.getAttribute("data-parallax")) || 0.1;
        ST.scene(img.parentElement, function (p) { img.style.transform = "translate3d(0," + ((p - 0.5) * f * 100).toFixed(2) + "%,0)"; });
      });
    }
    fontsReady.then(function () {
      ST.$$("[data-split]").forEach(ST.split);
      ST.reveal();
      ST.refresh();
      ST.ready = true;
      document.dispatchEvent(new CustomEvent("st:ready"));
    });
  }
  ST.onReady = function (fn) { if (ST.ready) fn(); else document.addEventListener("st:ready", fn, { once: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
