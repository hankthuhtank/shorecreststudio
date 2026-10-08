/* Pointer-depth movement for the Shorecrest Studio homepage only. */
(function () {
  "use strict";
  var hero = document.querySelector("[data-expedition]");
  if (!hero || !window.matchMedia("(hover: hover) and (pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var photos = Array.prototype.slice.call(hero.querySelectorAll(".expedition__photo"));
  var tx = 0, ty = 0, x = 0, y = 0, active = false;
  function frame() {
    x += (tx - x) * .11;
    y += (ty - y) * .11;
    photos.forEach(function (el) {
      var depth = Number(el.getAttribute("data-depth")) || 1;
      el.style.setProperty("--dx", (x * depth * 15).toFixed(2) + "px");
      el.style.setProperty("--dy", (y * depth * 13).toFixed(2) + "px");
    });
    if (Math.abs(tx - x) + Math.abs(ty - y) > .002) {
      window.requestAnimationFrame(frame);
    } else {
      active = false;
    }
  }
  function start() { if (!active) { active = true; window.requestAnimationFrame(frame); } }
  function reset() { tx = 0; ty = 0; start(); }
  hero.addEventListener("pointermove", function (event) {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    var rect = hero.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)));
    ty = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)));
    start();
  }, { passive: true });
  hero.addEventListener("pointerleave", reset);
  window.addEventListener("blur", reset);
})();
