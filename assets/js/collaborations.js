/* Open the selected photographs in the existing full-size portfolio viewer. */
(function () {
  "use strict";
  var ST = window.ST;
  var tiles = ST.$$("[data-collaboration-photo]");
  var photos = tiles.map(function (tile) { return ST.photoById[tile.getAttribute("data-collaboration-photo")]; });
  tiles.forEach(function (tile, index) {
    tile.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      ST.viewer.open(photos, index, tile, {
        findTile: function (photo) { return tiles[photos.indexOf(photo)]; }
      });
    });
  });
})();
