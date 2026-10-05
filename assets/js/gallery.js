/* ==========================================================================
   Photographs: both trips, in the order they happened.
   ========================================================================== */
(function () {
  "use strict";
  var ST = window.ST, $ = ST.$, $$ = ST.$$;
  var host = $("[data-gallery]");
  if (!host) return;

  var groups = ST.trips.slice().sort(function (a, b) { return a.id === "2019" ? -1 : b.id === "2019" ? 1 : 0; }).map(function (t) {
    var photos = ST.tripPhotos(t.id);
    var g = document.createElement("section");
    g.className = "gal__group";
    g.setAttribute("data-group", t.id);
    g.style.setProperty("--c", t.color);
    var days = t.id === "2019" ? "Nine days in 2019" : "March 1 to April 14";
    g.innerHTML =
      '<div class="gal__head"><h2><i></i>' + ST.esc(t.name) + "</h2>" +
      "<p>" + photos.length + " photographs. " + days + '. <a class="link" href="' + t.page + '">Follow the route ' + ST.icon.arrow + "</a></p></div>" +
      '<div class="gal__rows"></div>';
    host.appendChild(g);
    var rows = ST.jrows($(".gal__rows", g), photos, {
      onOpen: function (list, i, tile) {
        ST.viewer.open(list, i, tile, { findTile: function (p) { return rows.tiles[list.indexOf(p)]; } });
      }
    });
    return { id: t.id, el: g, rows: rows, n: photos.length };
  });

  var chips = $$("[data-filter]");
  chips.forEach(function (c) {
    var f = c.getAttribute("data-filter"), count = $("small", c);
    if (count) count.textContent = f === "all" ? ST.photos.length : (groups.filter(function (g) { return g.id === f; })[0] || {}).n || 0;
  });
  function apply(f, animate) {
    chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-filter") === f ? "true" : "false"); });
    groups.forEach(function (g) {
      var on = f === "all" || g.id === f;
      g.el.hidden = !on;
      if (on) {
        g.rows.layout();
        if (animate && !ST.reduce) g.rows.tiles.forEach(function (t, i) { t.classList.remove("is-in-anim"); void t.offsetWidth; t.style.setProperty("--n", i % 12); t.classList.add("is-in-anim"); });
      }
    });
    var url = f === "all" ? location.pathname : "?trip=" + encodeURIComponent(f);
    if (history.replaceState) history.replaceState(null, "", url);
    ST.refresh();
  }
  chips.forEach(function (c) { c.addEventListener("click", function () { apply(c.getAttribute("data-filter"), true); }); });
  var start = ST.param("trip");
  apply(groups.some(function (g) { return g.id === start; }) ? start : "all", false);
})();
