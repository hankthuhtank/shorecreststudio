#!/usr/bin/env python3
"""Preview the site locally with caching turned off:  python tools/serve.py   ->  http://localhost:8418"""
import http.server
import os
import sys
from functools import partial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8418


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml",
                      ".js": "text/javascript", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        if code == 404 and os.path.exists(os.path.join(ROOT, "404.html")):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(os.path.join(ROOT, "404.html"), "rb") as f:
                self.wfile.write(f.read())
            return
        super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    handler = partial(NoCache, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as srv:
        print(f"Shorecrest Studio preview: http://localhost:{PORT}")
        srv.serve_forever()
