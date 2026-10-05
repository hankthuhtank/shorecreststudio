# Shorecrest Studio

The photography portfolio at **shorecrest.studio**: photographs by Helal Safi from two road trips, with the real road routes that connect them.

- `index.html`: home. A slideshow, both trips on one map, a few favorites.
- `45-days.html` and `road-trip-2019.html`: each trip as a route you can follow stop by stop, with that trip's photographs below.
- `photographs.html`: every photograph, filterable by trip.
- `about.html`, `404.html`.

Plain HTML, CSS and JavaScript. Nothing to install or build to serve it: push to `main` and GitHub Pages publishes it.

## Settings

`assets/js/config.js` holds the store link, the "Get in touch" link, and optional email and social links. Leave a value empty (`""`) to hide that link everywhere.

## Changing a trip, a caption, or adding photos

The trips and stories live in `tools/trips.json`: each stop's name, nights, story, which photographs belong to it, and any points that shape the road route. Photo titles, captions and alt text are in `tools/photo-notes.json` (2019) and `tools/scene-notes.json` (the 45 days, shared with the store).

After editing, rebuild the generated files:

```
python tools/build.py
```

This needs Python 3.9+ with `pip install pillow numpy`. It reads the original photos from the folders next to this one (`../Shorecrest` for the 45-day masters, `../road trip 2019` for the 2019 photos), writes web-sized images to `assets/img/photo/`, and regenerates `assets/js/data.js` and `assets/js/geo.js`.

Road routes come from the public OSRM router (OpenStreetMap data). They're cached in `tools/.route-cache.json`, so a rebuild only goes online when a stop or route point changes.

To add a third trip, add another entry to `trips` in `tools/trips.json`, then copy one of the trip pages and change its `data-trip` and text.

## Preview locally

```
python tools/serve.py
```

Then open http://localhost:8418.

## Credits

Road geometry © OpenStreetMap contributors (ODbL), routed with OSRM. State outlines: U.S. Census Bureau. Fonts: Fraunces (SIL Open Font License, see `assets/fonts/Fraunces-OFL.txt`) and Safi, the photographer's own handwriting. Smooth scrolling: Lenis (MIT). Photographs © Helal Safi, all rights reserved.
