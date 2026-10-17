#!/usr/bin/env python3
"""Run the bakery app locally with NO Firebase account, for testing.
Usage:  python3 run-demo.py        then open  http://localhost:8123/index.html  (business)
                                          and  http://localhost:8123/order.html  (customer)
Business login: owner@test.com / pass1234
Data lives in this browser only (use the same browser for both pages). Nothing is sent to Firebase."""
import functools, http.server, os, socketserver, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, 'public')
FAKE = open(os.path.join(HERE, 'demo', 'fake-firebase.js'), 'rb').read()
CONFIG = b'window.FIREBASE_CONFIG={apiKey:"demo-key",authDomain:"demo.local",projectId:"demo",appId:"demo"};'
BANNER = (b"\nwindow.ntfy=function(){return Promise.resolve(false)};"
          b"document.addEventListener('DOMContentLoaded',function(){var d=document.createElement('div');"
          b"d.textContent='DEMO MODE - data stays in this browser only';"
          b"d.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#222;color:#fff;font:11px system-ui;text-align:center;padding:2px;z-index:999;opacity:.8;pointer-events:none';"
          b"document.body.appendChild(d)});")

class Handler(http.server.SimpleHTTPRequestHandler):
    def _send(self, body, ctype='application/javascript'):
        self.send_response(200); self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store'); self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        p = self.path.split('?')[0]
        if p.startswith('/vendor/firebase-'): return self._send(FAKE)
        if p == '/firebase-config.js': return self._send(CONFIG)
        if p == '/shared.js': return self._send(open(os.path.join(ROOT, 'shared.js'), 'rb').read() + BANNER)
        return super().do_GET()
    def log_message(self, *a): pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', port), functools.partial(Handler, directory=ROOT)) as s:
        print(f'Bakery demo running.\n  Business: http://localhost:{port}/index.html  (owner@test.com / pass1234)\n  Customer: http://localhost:{port}/order.html\nPress Ctrl+C to stop.')
        try: s.serve_forever()
        except KeyboardInterrupt: print('\nStopped.')
