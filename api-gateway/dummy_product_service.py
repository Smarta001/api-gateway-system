"""Dummy Product Service - port 8083"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, time

PRODUCTS = [
    {"id": "p1", "name": "Laptop Pro",          "category": "Electronics", "price": 1299.99, "stock": 42},
    {"id": "p2", "name": "Wireless Mouse",       "category": "Accessories", "price": 29.99,   "stock": 200},
    {"id": "p3", "name": "Mechanical Keyboard",  "category": "Accessories", "price": 89.99,   "stock": 75},
    {"id": "p4", "name": "4K Monitor",           "category": "Electronics", "price": 499.99,  "stock": 15},
]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[product-svc] {args[0]} {args[1]}")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path == "" or path == "/":
            self.send_json(PRODUCTS)
        else:
            pid = path.lstrip("/")
            product = next((p for p in PRODUCTS if p["id"] == pid), None)
            if product:
                self.send_json(product)
            else:
                self.send_json({"id": pid, "name": f"Product_{pid}", "category": "General", "price": 49.99, "stock": 100})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        body["id"] = f"prod_{int(time.time())}"
        body["stock"] = 0
        self.send_json(body, 201)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        pid = self.path.lstrip("/")
        body["id"] = pid
        body["updated"] = True
        self.send_json(body)

    def do_DELETE(self):
        pid = self.path.lstrip("/")
        self.send_json({"id": pid, "deleted": True})

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8083), Handler)
    print("✅ Product Service running on http://localhost:8083")
    server.serve_forever()
