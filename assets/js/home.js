/* ==========================================================================
   Home: the two trips on one map, a few favorites.
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST, $ = ST.$, $$ = ST.$$;

  /* ---------------------------------------------------------------- two trips, one map */
  function tripsMap() {
    var box = $("[data-atlas]");
    if (!box || !ST.Atlas) return;
    var canvas = $("canvas", box), layer = $(".mlayer", box);
    var ids = ["45-days", "2019"];
    var atlas = new ST.Atlas(canvas, {
      trips: ids, minWidth: 400, regions: false,
      padding: function (a) { return a.W < 600 ? { l: 14, t: 30, r: 46, b: 40 } : { l: 24, t: 28, r: 104, b: 44 }; }
    });
    var all = [Infinity, Infinity, -Infinity, -Infinity];
    ids.forEach(function (id) {
      var b = atlas.trip(id).bounds;
      all = [Math.min(all[0], b[0]), Math.min(all[1], b[1]), Math.max(all[2], b[2]), Math.max(all[3], b[3])];
      atlas.set(id, { d: 0, w: 2.4 });
    });
    atlas.fitTo = all;
    atlas.fitPad = 0.03;
    atlas.jump(atlas.fit(all, 0.03));

    // a few names: where each trip started, where both ended
    var marks = [];
    function mark(tripId, i, label, cls) {
      var t = atlas.trip(tripId), s = t.stops[i], el = document.createElement("span");
      el.className = "lbl lbl--end is-off " + (cls || "");
      el.innerHTML = /is-(above|below|left)/.test(cls || "") ? "<b>" + ST.esc(label) + "</b>" : ST.esc(label);
      el.style.setProperty("--c", t.color);
      layer.appendChild(el);
      marks.push({ el: el, x: s[0], y: s[1], trip: tripId });
    }
    var t19 = ST.trip("2019"), t45 = ST.trip("45-days");
    mark("2019", 0, t19.stops[0].name, "is-left");
    mark("45-days", 0, t45.stops[0].name, "is-above");
    mark("45-days", t45.stops.length - 1, "Paris, Texas", "is-shared is-below");
    // every stop, as a small dot, shown for the trip you're looking at
    var dots = [];
    ids.forEach(function (id) {
      atlas.trip(id).stops.forEach(function (s, i) {
        var d = document.createElement("i");
        d.className = "adot is-off";
        d.style.setProperty("--c", atlas.trip(id).color);
        layer.appendChild(d);
        dots.push({ el: d, x: s[0], y: s[1], trip: id, i: i });
      });
    });
    var focus = null, drawn = false;
    atlas.onFrame(function () {
      marks.forEach(function (m) {
        var p = atlas.toScreen(m.x, m.y);
        m.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)";
        m.el.classList.toggle("is-off", !drawn || (focus && m.trip !== focus && !m.el.classList.contains("is-shared")));
      });
      dots.forEach(function (d) {
        var p = atlas.toScreen(d.x, d.y);
        d.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)";
        d.el.classList.toggle("is-off", !drawn || (focus ? d.trip !== focus : false));
      });
    });

    function draw() {
      if (drawn) return;
      ids.forEach(function (id, k) {
        atlas.set(id, { head: true });
        setTimeout(function () {
          atlas.tween(id, "d", atlas.trip(id).total, k ? 2600 : 3800, ST.ease.sine, function () { atlas.set(id, { head: false, d: Infinity }); if (k === 0) { drawn = true; atlas.dirty = true; } });
        }, k * 500);
      });
      if (ST.reduce) { drawn = true; atlas.dirty = true; }
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { draw(); io.disconnect(); } }, { threshold: 0.35 });
      io.observe(box);
    } else draw();

    function highlight(id) {
      focus = id;
      ids.forEach(function (t) { atlas.tween(t, "alpha", !id || t === id ? 1 : 0.16, 500, ST.ease.out); });
      atlas.fitTo = id ? atlas.trip(id).bounds : all;
      atlas.fitPad = id ? 0.08 : 0.03;
      atlas.fly(atlas.fit(atlas.fitTo, atlas.fitPad), { ms: 1100, rho: 0.9 });
      $$(".trow").forEach(function (r) { r.classList.toggle("is-dim", !!id && r.getAttribute("data-trip") !== id); });
    }
    var leaveT;
    $$(".trow").forEach(function (row) {
      var id = row.getAttribute("data-trip");
      function on() { clearTimeout(leaveT); if (focus !== id) highlight(id); }
      function off() { clearTimeout(leaveT); leaveT = setTimeout(function () { highlight(null); }, 350); }
      row.addEventListener("pointerenter", on);
      row.addEventListener("focus", on);
      row.addEventListener("pointerleave", off);
      row.addEventListener("blur", off);
    });
  }

  /* ---------------------------------------------------------------- a few favorites */
  var FAVORITES = ["SC-001", "new-crescentlake", "new-animal2", "SC-021", "new-toketee-falls2", "SC-041", "SC-003", "new-animal4", "SC-014", "SC-005", "SC-028", "SC-058", "SC-039"];
  function favorites() {
    var el = $("[data-selection]"), tabs = $("[data-collection-tabs]");
    if (!el || !tabs) return;
    var choices = [{ id: "favorites", name: "Favorites" }].concat(ST.collections), g = null;
    tabs.innerHTML = choices.map(function (c) {
      return '<button class="chip" type="button" data-collection="' + c.id + '" aria-pressed="false">' + ST.esc(c.name) + '</button>';
    }).join("");
    function show(id) {
      var collection = ST.collection(id);
      if (collection && collection.page) { location.href = collection.page; return; }
      var list = id === "favorites" ? FAVORITES.map(function (pid) { return ST.photoById[pid]; }).filter(Boolean) : ST.collectionPhotos(id).slice(0, 8);
      if (g && g.destroy) g.destroy();
      g = ST.jrows(el, list, {
        height: function (W) { return W < 600 ? 160 : W < 1000 ? 240 : 330; },
        onOpen: function (photos, i, tile) {
          ST.viewer.open(photos, i, tile, { findTile: function (p) { return g.tiles[photos.indexOf(p)]; } });
        }
      });
      $$("[data-collection]", tabs).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-collection") === id ? "true" : "false"); });
      var link = $(".sel-foot a");
      if (link) {
        link.href = "photographs.html" + (id === "favorites" ? "" : "?collection=" + encodeURIComponent(id));
        link.firstChild.textContent = id === "favorites" ? "Browse the collections " : "See the full collection ";
      }
      if (!ST.reduce) g.tiles.forEach(function (t, i) { t.style.setProperty("--n", i % 12); t.classList.add("is-in-anim"); });
      ST.refresh();
    }
    $$("[data-collection]", tabs).forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-collection")); }); });
    show("favorites");
  }

  ST.onReady(function () {
    tripsMap();
    favorites();
  });
})();
