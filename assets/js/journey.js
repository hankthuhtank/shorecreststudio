/* ==========================================================================
   Trip page: the route explorer, the trip's photographs.
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST;
  var root = ST.$(".ex");
  if (!root || !ST.Atlas) return;

  var tripId = root.getAttribute("data-trip"), trip = ST.trip(tripId);
  if (!trip) return;
  var n = trip.stops.length;
  var canvas = ST.$("canvas", root), layer = ST.$(".mlayer", root), card = ST.$(".card", root);
  var body = ST.$(".card__body", card), media = ST.$(".card__media", card);
  var track = ST.$(".rail__track", root), fill = ST.$(".rail__fill", root), tip = ST.$(".rail__tip", root);
  var where = ST.$(".rail__where", root), playBtn = ST.$(".rail__play", root);
  var prevBtn = ST.$("[data-prev]", card), nextBtn = ST.$("[data-next]", card), wholeBtn = ST.$("[data-whole]", card);
  var tripPhotos = ST.tripPhotos(tripId);
  var cur = -1, playing = false, playT = 0, introRunning = false, introDone = false;
  var mq = window.matchMedia("(min-width: 1081px)");
  root.style.setProperty("--c", trip.color);

  function headerH() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 80; }
  function gutter() { return Math.max(20, Math.min(64, window.innerWidth * 0.042)); }

  var atlas = new ST.Atlas(canvas, {
    trips: [tripId],
    minWidth: 260,
    padding: function (a) {
      var hh = headerH();
      if (!mq.matches) return { l: 18, t: hh + 10, r: 18, b: 22 };
      if (root.classList.contains("is-touring")) return { l: 40, t: hh + 20, r: card.offsetWidth + gutter() + 40, b: 118 };
      return { l: Math.min(a.W * 0.42, 640), t: hh + 40, r: 56, b: 120 };
    },
    avoid: function () { return introRect() ? [introRect()] : []; }
  });
  var introEl = ST.$(".ex__intro", root);
  // in the overview on wide screens, the title sits over the map: keep map words out from under it
  function introRect() {
    if (!mq.matches || cur >= 0 || !introEl) return null;
    var ir = introEl.getBoundingClientRect(), mr = canvas.getBoundingClientRect();
    return { x: ir.left - mr.left - 30, y: ir.top - mr.top - 30, w: ir.width + 60, h: ir.height + 60 };
  }
  var G = atlas.trip(tripId);

  /* ---------------------------------------------------------------- map overlay: stops, photo pins, place names */
  var marks = trip.stops.map(function (s, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.tabIndex = -1;  // the rail and the arrows cover keyboard use; 38 extra tab stops would get in the way
    b.className = "mk is-off";
    b.setAttribute("aria-label", "Stop " + (i + 1) + ": " + s.name);
    b.innerHTML = "<i></i><span class=\"mk__label\">" + ST.esc(s.name) + "</span>";
    b.addEventListener("click", function () { pause(); select(i); });
    layer.appendChild(b);
    return { el: b, x: G.stops[i][0], y: G.stops[i][1], w: s.name.length * 8.2 + 34, photos: s.photos.length };
  });
  var pins = [];
  trip.stops.forEach(function (s, i) {
    var lead = s.photos.filter(function (id) { return !G.spots[id]; })[0];
    if (lead) pins.push(makePin(lead, i, G.stops[i]));
    s.photos.forEach(function (id) { if (G.spots[id]) pins.push(makePin(id, i, G.spots[id])); });
  });
  function makePin(id, i, at) {
    var p = ST.photoById[id], b = document.createElement("button");
    b.type = "button";
    b.tabIndex = -1;
    b.className = "pin is-off";
    b.setAttribute("aria-label", p.title + ", " + trip.stops[i].name + ". Show this stop");
    b.innerHTML = '<span class="pin__img"><img src="' + ST.src(p, 60) + '" alt="" loading="lazy" decoding="async"></span>';
    b.addEventListener("click", function () { pause(); select(i, { photo: id }); });
    layer.appendChild(b);
    return { el: b, id: id, i: i, x: at[0], y: at[1] };
  }
  var labels = (G.labels || []).map(function (l) {
    var e = document.createElement("span");
    e.className = "lbl is-off" + (l.k === "peak" ? " lbl--peak" : "");
    e.textContent = l.n;
    e.setAttribute("aria-hidden", "true");
    layer.appendChild(e);
    return { el: e, x: l.x, y: l.y, w: l.n.length * 7.4 + 16, k: l.k };
  });

  function overlaps(r, list) {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) return true;
    }
    return false;
  }

  function layout() {
    var a = atlas, W = a.W, H = a.H, vw = W / a.cam.k, s = a.safe(), st = a.state[tripId];
    var d = st.d === Infinity ? G.total : st.d, touring = cur >= 0;
    var right = mq.matches && touring ? W - card.offsetWidth - gutter() - 10 : W - 6;
    var limits = { l: 6, t: mq.matches ? headerH() : headerH() - 6, r: right, b: mq.matches ? H - 96 : H - 4 };
    var taken = [], ir = introRect();
    if (ir) taken.push(ir);
    // where everything is on screen
    marks.forEach(function (m, i) {
      var p = a.toScreen(m.x, m.y);
      m.sx = p.x; m.sy = p.y;
      m.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)";
      var reached = i === 0 ? (d > 0 || introDone || touring) : d >= a.stopD(tripId, i) - 0.05;
      m.reached = reached;
      m.el.classList.toggle("is-off", !reached && !introDone);
      m.el.classList.toggle("is-done", reached && i !== cur);
      m.el.classList.toggle("is-cur", i === cur);
      m.on = p.x > limits.l && p.x < limits.r && p.y > limits.t && p.y < limits.b;
      if (m.on && (reached || introDone)) taken.push({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 });
    });
    // What gets a name or a photo when space is tight: where you are, its photos, the neighbours,
    // then photos nearby, then everything else.
    var c = cur >= 0 ? marks[cur] : null, showPins = introDone && !introRunning;
    function far(i) { return c ? Math.hypot(marks[i].sx - c.sx, marks[i].sy - c.sy) : 0; }
    var queue = [];
    marks.forEach(function (m, i) {
      var pr;
      if (i === cur) pr = 0;
      else if (touring && (i === cur - 1 || i === cur + 1)) pr = 2;
      else if (!touring && (i === 0 || i === n - 1)) pr = 0;
      else pr = (m.photos ? 4 : 6) + far(i) / 1e4 - m.photos / 100;
      queue.push({ kind: "mark", i: i, pr: pr });
    });
    pins.forEach(function (p) {
      var pr = p.i === cur ? 1 : 3 + (touring ? far(p.i) / 1e4 : -trip.stops[p.i].photos.length / 100);
      queue.push({ kind: "pin", p: p, pr: pr });
    });
    queue.sort(function (x, y) { return x.pr - y.pr; });
    var shown = 0, maxLabels = touring ? 14 : 12;
    queue.forEach(function (q) {
      if (q.kind === "mark") {
        var m = marks[q.i], want = false, flip = false;
        if (m.on && (m.reached || introDone) && shown < maxLabels) {
          var r = { x: m.sx + 12, y: m.sy - 11, w: m.w, h: 22 };
          if (r.x + r.w < limits.r && !overlaps(r, taken)) want = true;
          else {
            r = { x: m.sx - 12 - m.w, y: m.sy - 11, w: m.w, h: 22 };
            if (r.x > limits.l && !overlaps(r, taken)) { want = true; flip = true; }
          }
          if (want) { taken.push(r); shown++; }
        }
        m.el.classList.toggle("has-label", want);
        m.el.classList.toggle("flip", flip);
      } else {
        var p = q.p, pt = a.toScreen(p.x, p.y), on = false;
        p.el.style.transform = "translate3d(" + pt.x.toFixed(1) + "px," + pt.y.toFixed(1) + "px,0)";
        if (showPins && pt.x > limits.l + 26 && pt.x < limits.r - 26 && pt.y - 64 > limits.t && pt.y < limits.b) {
          var pr2 = { x: pt.x - 27, y: pt.y - 66, w: 54, h: 56 };
          if (!overlaps(pr2, taken)) { taken.push(pr2); on = true; }
        }
        p.el.classList.toggle("is-off", !on);
        p.el.classList.toggle("is-cur", p.i === cur);
      }
    });
    // place names along the way, only when zoomed in
    labels.forEach(function (l) {
      var pt = a.toScreen(l.x, l.y), want = false;
      l.el.style.transform = "translate3d(" + pt.x.toFixed(1) + "px," + pt.y.toFixed(1) + "px,0)";
      if (vw < 1100 && introDone && pt.x > limits.l && pt.x + l.w < limits.r && pt.y > limits.t + 10 && pt.y < limits.b) {
        var r = { x: pt.x - 6, y: pt.y - 10, w: l.w, h: 20 };
        if (!overlaps(r, taken)) { taken.push(r); want = true; }
      }
      l.el.classList.toggle("is-off", !want);
    });
  }
  var lastLayout = 0;
  atlas.onFrame(function () {
    var t = performance.now();
    if (atlas.busy() && t - lastLayout < 33) {
      // positions every frame, decisions a few times a second
      marks.forEach(function (m) { var p = atlas.toScreen(m.x, m.y); m.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)"; });
      pins.forEach(function (p) { var q = atlas.toScreen(p.x, p.y); p.el.style.transform = "translate3d(" + q.x.toFixed(1) + "px," + q.y.toFixed(1) + "px,0)"; });
      labels.forEach(function (l) { var q = atlas.toScreen(l.x, l.y); l.el.style.transform = "translate3d(" + q.x.toFixed(1) + "px," + q.y.toFixed(1) + "px,0)"; });
      return;
    }
    lastLayout = t;
    layout();
  });

  /* ---------------------------------------------------------------- the stop card */
  // the leg that brought you here, plus the next stop when it's close enough to show where you're headed
  function stopBounds(i) {
    var b = atlas.legBounds(tripId, i === 0 ? 1 : i);
    if (i > 0 && i < n - 1) {
      var a = G.stops[i], z = G.stops[i + 1];
      if (Math.hypot(z[0] - a[0], z[1] - a[1]) < 380) b = [Math.min(b[0], z[0]), Math.min(b[1], z[1]), Math.max(b[2], z[0]), Math.max(b[3], z[1])];
    }
    return b;
  }
  function distText(i) {
    var s = trip.stops[i];
    if (!i || !s.dist) return "";
    var note = s.distNote || "";
    if (/from /.test(note)) return "About " + ST.miles(s.dist) + " miles, " + note + ".";
    return "About " + ST.miles(s.dist) + " miles from " + trip.stops[i - 1].name + (note ? ", " + note : "") + ".";
  }

  var shownPhotos = [], photoIdx = 0, frameDir = 1;
  function setPhoto(k, dir) {
    if (!shownPhotos.length) return;
    photoIdx = (k + shownPhotos.length) % shownPhotos.length;
    var p = shownPhotos[photoIdx], old = ST.$$(".card__frame", media);
    var f = document.createElement("div");
    f.className = "card__frame" + (ST.reduce ? "" : " is-enter" + (dir < 0 ? " back" : ""));
    f.innerHTML = '<img alt="' + ST.esc(p.alt) + '" srcset="' + ST.srcset(p, 1600) + '" sizes="' + Math.ceil(card.offsetWidth || 420) + 'px" decoding="async">';
    var nav = ST.$(".card__pnav", media);
    media.insertBefore(f, nav);
    var img = f.querySelector("img");
    function go() {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          f.classList.add("is-go");
          setTimeout(function () { old.forEach(function (o) { o.remove(); }); }, 1050);
        });
      });
    }
    if (img.complete) go(); else { img.addEventListener("load", go, { once: true }); img.addEventListener("error", go, { once: true }); setTimeout(go, 900); }
    ST.$(".card__pcap", media).textContent = p.title + (p.place && trip.stops[cur] && p.place.indexOf(trip.stops[cur].name) !== 0 ? " · " + p.place : "");
    ST.$(".card__pcount", media).textContent = shownPhotos.length > 1 ? (photoIdx + 1) + " / " + shownPhotos.length : "";
    ST.$$(".card__pnav button", media).forEach(function (b) { b.hidden = shownPhotos.length < 2; });
    pins.forEach(function (pn) { pn.el.classList.toggle("is-shown", pn.id === p.id); });
  }

  function renderCard(i, prev, o) {
    var s = trip.stops[i], first = prev < 0 || !card.classList.contains("is-ready");
    var dir = prev < 0 || i >= prev ? 1 : -1;
    shownPhotos = s.photos.map(function (id) { return ST.photoById[id]; }).filter(Boolean);
    card.classList.toggle("no-photo", !shownPhotos.length);
    if (shownPhotos.length) {
      var start = o && o.photo ? Math.max(0, s.photos.indexOf(o.photo)) : 0;
      setPhoto(start, dir);
    } else ST.$$(".card__frame", media).forEach(function (f) { f.remove(); });
    function fillBody() {
      body.innerHTML =
        '<p class="card__meta"><span>Stop ' + (i + 1) + " of " + n + "</span><span>" + ST.esc(s.region) + "</span></p>" +
        '<h2 class="card__name">' + ST.esc(s.name) + "</h2>" +
        (s.stay ? '<p class="card__stay">' + ST.esc(s.stay) + "</p>" : "") +
        '<p class="card__story">' + ST.esc(s.story) + "</p>" +
        (distText(i) ? '<p class="card__dist">' + ST.esc(distText(i)) + "</p>" : "");
      body.scrollTop = 0;
      card.classList.remove("is-out");
      card.classList.remove("is-in");
      void card.offsetWidth;
      card.classList.add("is-in");
    }
    if (first) { fillBody(); card.classList.add("is-ready"); }
    else { card.classList.add("is-out"); setTimeout(fillBody, 170); }
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === n - 1;
  }
  ST.$("[data-pprev]", media).addEventListener("click", function (e) { e.stopPropagation(); setPhoto(photoIdx - 1, -1); });
  ST.$("[data-pnext]", media).addEventListener("click", function (e) { e.stopPropagation(); setPhoto(photoIdx + 1, 1); });
  media.addEventListener("click", function (e) {
    var f = e.target.closest(".card__frame");
    if (!f || !shownPhotos.length) return;
    pause();
    var p = shownPhotos[photoIdx];
    openViewer(tripPhotos.indexOf(p), f);
  });
  prevBtn.addEventListener("click", function () { pause(); if (cur > 0) select(cur - 1); });
  nextBtn.addEventListener("click", function () { pause(); if (cur < n - 1) select(cur + 1); });
  wholeBtn.addEventListener("click", function () { pause(); overview(); });

  /* ---------------------------------------------------------------- rail */
  var dots = trip.stops.map(function (s, i) {
    var d = document.createElement("span");
    d.className = "rail__dot" + (s.photos.length ? " has-photo" : "");
    d.style.left = (n > 1 ? i / (n - 1) * 100 : 0) + "%";
    track.appendChild(d);
    return d;
  });
  function railTo(i) {
    dots.forEach(function (d, k) { d.classList.toggle("is-done", i >= 0 && k < i); d.classList.toggle("is-cur", k === i); });
    fill.style.width = (i > 0 ? i / (n - 1) * 100 : 0) + "%";
    track.setAttribute("aria-valuenow", i >= 0 ? i + 1 : 0);
    track.setAttribute("aria-valuetext", i >= 0 ? trip.stops[i].name : "The whole trip");
    where.innerHTML = i >= 0
      ? "<b>" + ST.esc(trip.stops[i].name) + "</b><span>Stop " + (i + 1) + " of " + n + "</span>"
      : "<b>The whole trip</b><span>" + n + " stops</span>";
  }
  function railIndex(clientX) {
    var r = track.getBoundingClientRect();
    return Math.round(ST.clamp((clientX - r.left) / r.width) * (n - 1));
  }
  function showTip(i) {
    tip.textContent = trip.stops[i].name;
    tip.style.left = (n > 1 ? i / (n - 1) * 100 : 0) + "%";
  }
  var scrubbing = false;
  track.addEventListener("pointermove", function (e) {
    track.classList.add("is-hover");
    var i = railIndex(e.clientX);
    showTip(i);
    if (scrubbing && i !== cur) select(i, { quick: true });
  });
  track.addEventListener("pointerleave", function () { if (!scrubbing) track.classList.remove("is-hover"); });
  track.addEventListener("pointerdown", function (e) {
    pause();
    scrubbing = true;
    track.setPointerCapture && track.setPointerCapture(e.pointerId);
    track.classList.add("is-hover");
    var i = railIndex(e.clientX);
    showTip(i);
    if (i !== cur) select(i, { quick: e.pointerType !== "mouse" });
  });
  function endScrub() { if (!scrubbing) return; scrubbing = false; setTimeout(function () { track.classList.remove("is-hover"); }, 500); }
  track.addEventListener("pointerup", endScrub);
  track.addEventListener("pointercancel", endScrub);
  track.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); pause(); select(Math.min(n - 1, cur + 1)); }
    else if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); pause(); if (cur > 0) select(cur - 1); }
    else if (k === "Home") { e.preventDefault(); pause(); select(0); }
    else if (k === "End") { e.preventDefault(); pause(); select(n - 1); }
  });

  /* ---------------------------------------------------------------- moving between stops */
  function select(i, o) {
    o = o || {};
    if (i < 0 || i >= n) return;
    if (introRunning) finishIntro(true);
    var prev = cur;
    cur = i;
    var wasTouring = root.classList.contains("is-touring");
    root.classList.add("is-touring");
    var stepFwd = prev >= 0 && i === prev + 1 && !o.instant && !o.quick;
    var endD = i === 0 ? 0 : atlas.legEndD(tripId, i);
    var target = atlas.fit(stopBounds(i), 0.08);
    var ms = 0;
    atlas.set(tripId, { ahead: true });
    if (stepFwd) {
      var leg = G.legs[i];
      atlas.set(tripId, { d: atlas.legStartD(tripId, i), head: true });
      ms = atlas.fly(target, { ms: ST.clamp(900 + leg.len * 1.1, 1300, 2600) });
      atlas.tween(tripId, "d", endD, Math.max(ms, 1200), ST.ease.sine, function () { atlas.set(tripId, { head: false }); });
    } else {
      atlas.set(tripId, { head: false });
      if (o.instant) atlas.jump(target);
      else ms = atlas.fly(target, o.quick ? { ms: 650 } : null);
      atlas.tween(tripId, "d", endD, o.instant ? 0 : o.quick ? 450 : 900, ST.ease.io);
    }
    renderCard(i, wasTouring ? prev : -1, o);
    railTo(i);
    if (history.replaceState) history.replaceState(null, "", "?stop=" + encodeURIComponent(trip.stops[i].id));
    if (playing) schedule(Math.max(ms, 1200) + (trip.stops[i].photos.length ? 3600 : 2400));
    return ms;
  }

  function overview(o) {
    o = o || {};
    cur = -1;
    root.classList.remove("is-touring");
    card.classList.remove("is-ready");
    atlas.set(tripId, { ahead: false, head: false });
    atlas.tween(tripId, "d", G.total, o.instant ? 0 : 900, ST.ease.io);
    var target = atlas.fit(G.bounds, 0.04);
    if (o.instant) atlas.jump(target); else atlas.fly(target);
    railTo(-1);
    if (history.replaceState) history.replaceState(null, "", location.pathname);
  }

  /* play: step through the trip on its own */
  function schedule(ms) { clearTimeout(playT); playT = setTimeout(function () { if (!playing) return; if (cur < n - 1) select(cur + 1); else pause(); }, ms); }
  function pause() { playing = false; clearTimeout(playT); root.classList.remove("is-playing"); playBtn.setAttribute("aria-label", "Play the trip"); }
  function play() {
    playing = true;
    root.classList.add("is-playing");
    playBtn.setAttribute("aria-label", "Pause");
    if (cur < 0 || cur >= n - 1) select(0);
    else schedule(250);
    if (cur === 0) schedule(1800);
  }
  playBtn.addEventListener("click", function () { playing ? pause() : play(); });

  /* keys: arrows step while the map is on screen */
  var exVisible = true;
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { exVisible = es[0].intersectionRatio > 0.35; }, { threshold: [0, 0.35, 0.6] }).observe(root);
  document.addEventListener("keydown", function (e) {
    if (!exVisible || (ST.viewer && ST.viewer.isOpen()) || e.target === track) return;
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); pause(); select(Math.min(n - 1, cur + 1)); }
    else if (e.key === "ArrowLeft") { if (cur > 0) { e.preventDefault(); pause(); select(cur - 1); } }
    else if (e.key === "Escape" && cur >= 0) { pause(); overview(); }
  });

  /* ---------------------------------------------------------------- photographs below the map */
  function openViewer(i, from) {
    ST.viewer.open(tripPhotos, Math.max(0, i), from, {
      onMap: function (p) {
        var at = ST.stopOf(p);
        if (!at || at.trip.id !== tripId) return;
        ST.scrollTo(0, { duration: 1.1 });
        setTimeout(function () { pause(); select(at.index, { photo: p.id }); }, 250);
      },
      findTile: function (p) {
        if (cur >= 0 && shownPhotos[photoIdx] === p && root.getBoundingClientRect().bottom > 0) return ST.$(".card__frame:last-of-type", media);
        return grid ? grid.tiles[tripPhotos.indexOf(p)] || null : null;
      }
    });
  }
  // the first few rows under the map; the rest on request, so the page doesn't run on forever
  var gridEl = ST.$("[data-trip-photos]"), grid = null, LIMIT = 18;
  function renderGrid(all) {
    var list = all ? tripPhotos : tripPhotos.slice(0, LIMIT);
    grid = ST.jrows(gridEl, list, { onOpen: function (l, i, el) { openViewer(tripPhotos.indexOf(l[i]), el); } });
  }
  if (gridEl) {
    var partial = tripPhotos.length > LIMIT + 4;
    renderGrid(!partial);
    if (partial) {
      var more = document.createElement("div");
      more.className = "sel-foot";
      more.innerHTML = '<button class="btn btn--ghost" type="button">Show all ' + tripPhotos.length + " photographs " + ST.icon.arrow + "</button>";
      gridEl.parentNode.insertBefore(more, gridEl.nextSibling);
      more.querySelector("button").addEventListener("click", function () {
        renderGrid(true);
        more.remove();
        ST.refresh();
      });
    }
  }

  /* ---------------------------------------------------------------- the opening: the route draws itself */
  function finishIntro(skipLayout) {
    introRunning = false;
    introDone = true;
    atlas.set(tripId, { head: false });
    if (!skipLayout) layout();
  }
  function intro() {
    var facts = ST.$("[data-facts]", root);
    if (facts) facts.textContent = n + " stops and about " + trip.miles.toLocaleString("en-US") + " miles of road, give or take a few detours.";
    railTo(-1);
    var deep = ST.param("stop"), di = -1;
    trip.stops.forEach(function (s, i) { if (s.id === deep) di = i; });
    if (di >= 0) {
      introDone = true;
      ST.$$(".ex__intro [data-split], .ex__intro [data-reveal]").forEach(function (e) { e.classList.add("is-in"); });
      select(di, { instant: true });
      return;
    }
    atlas.jump(atlas.fit(G.bounds, 0.04));
    if (ST.reduce) { atlas.set(tripId, { d: Infinity }); finishIntro(); return; }
    atlas.set(tripId, { d: 0, head: true });
    introRunning = true;
    setTimeout(function () {
      ST.$$(".ex__intro [data-split], .ex__intro [data-reveal]").forEach(function (e) { e.classList.add("is-in"); });
    }, 120);
    setTimeout(function () {
      if (!introRunning) return;
      atlas.tween(tripId, "d", G.total, ST.clamp(G.total * 0.42, 2800, 4600), ST.ease.sine, function () {
        if (introRunning) { finishIntro(); atlas.set(tripId, { d: Infinity }); }
      });
    }, 450);
  }
  ST.$$("[data-start]", root).forEach(function (b) { b.addEventListener("click", function () { pause(); select(0); }); });
  ST.$$("[data-play]", root).forEach(function (b) { b.addEventListener("click", function () { play(); }); });

  mq.addEventListener ? mq.addEventListener("change", function () { atlas.resize(); if (cur >= 0) atlas.jump(atlas.fit(stopBounds(cur), 0.08)); else atlas.jump(atlas.fit(G.bounds, 0.04)); }) : null;
  window.addEventListener("resize", ST.debounce(function () {
    if (atlas.busy()) return;
    atlas.jump(cur >= 0 ? atlas.fit(stopBounds(cur), 0.08) : atlas.fit(G.bounds, 0.04));
  }, 160));

  ST.onReady(intro);
})();
