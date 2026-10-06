/* Photographs organized as visual collections, with a full-size viewer. */
(function () {
  "use strict";
  var ST = window.ST, $ = ST.$, $$ = ST.$$;
  var host = $("[data-gallery]"), covers = $("[data-gallery-covers]"), tabs = $("[data-gallery-tabs]");
  if (!host || !covers || !tabs) return;
  var choices = [{ id: "all", name: "All collections" }].concat(ST.collections), rows = null;
  tabs.innerHTML = choices.map(function (c) {
    return '<button class="chip" type="button" data-collection="' + c.id + '" aria-pressed="false">' + ST.esc(c.name) + '</button>';
  }).join("");
  covers.innerHTML = ST.collections.map(function (c) {
    var p = ST.photoById[c.cover];
    return '<a class="collection-cover" href="?collection=' + c.id + '" data-album="' + c.id + '" style="--ph:' + p.c + '">' +
      '<img class="fade-img" src="' + ST.src(p, 960) + '" srcset="' + ST.srcset(p, 1600) + '" sizes="(max-width: 700px) 90vw, 46vw" alt="' + ST.esc(p.alt) + '" loading="lazy" decoding="async">' +
      '<span class="collection-cover__name">' + ST.esc(c.name) + ' <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg></span></a>';
  }).join("");
  ST.fadeImages(covers);
  function show(id, changeUrl) {
    var collection = ST.collection(id);
    if (!collection) id = "all";
    covers.hidden = id !== "all";
    host.hidden = id === "all";
    if (rows && rows.destroy) rows.destroy();
    rows = null;
    host.innerHTML = "";
    if (collection) {
      host.innerHTML = '<div class="gal__head"><h2>' + ST.esc(collection.name) + '</h2><p>Open a photo to see it full size.</p></div><div class="gal__rows"></div>';
      rows = ST.jrows($(".gal__rows", host), ST.collectionPhotos(id), {
        onOpen: function (list, i, tile) {
          ST.viewer.open(list, i, tile, { findTile: function (p) { return rows.tiles[list.indexOf(p)]; } });
        }
      });
      if (!ST.reduce) rows.tiles.forEach(function (t, i) { t.style.setProperty("--n", i % 12); t.classList.add("is-in-anim"); });
    }
    $$("[data-collection]", tabs).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-collection") === id ? "true" : "false"); });
    if (changeUrl && history.replaceState) history.replaceState(null, "", location.pathname + (id === "all" ? "" : "?collection=" + encodeURIComponent(id)));
    ST.refresh();
  }
  $$("[data-collection]", tabs).forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-collection"), true); }); });
  $$("[data-album]", covers).forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); show(a.getAttribute("data-album"), true); $(".gh").scrollIntoView({ behavior: ST.reduce ? "auto" : "smooth", block: "start" }); });
  });
  show(ST.param("collection") || "all", false);
})();
