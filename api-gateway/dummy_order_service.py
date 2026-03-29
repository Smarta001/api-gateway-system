"""Dummy Order Service - port 8082"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, time

ORDERS = [
    {"id": "o1", "userId": "u1", "product": "Laptop",     "amount": 1200.00, "status": "DELIVERED"},
    {"id": "o2", "userId": "u2", "product": "Phone",      "amount": 699.99,  "status": "SHIPPED"},
    {"id": "o3", "userId": "u1", "product": "Headphones", "amount": 149.99,  "status": "PROCESSING"},
]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[order-svc] {args[0]} {args[1]}")

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
            self.send_json(ORDERS)
        else:
            oid = path.lstrip("/")
            order = next((o for o in ORDERS if o["id"] == oid), None)
            if order:
                self.send_json(order)
            else:
                self.send_json({"id": oid, "userId": "u1", "product": f"Product_{oid}", "amount": 99.99, "status": "PROCESSING"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        body["id"] = f"ord_{int(time.time())}"
        body["status"] = "CREATED"
        self.send_json(body, 201)

    def do_PATCH(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        oid = self.path.strip("/").split("/")[0]
        self.send_json({"id": oid, "status": body.get("status", "UNKNOWN"), "updated": True})

    def do_DELETE(self):
        oid = self.path.lstrip("/")
        self.send_json({"id": oid, "deleted": True})

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8082), Handler)
    print("✅ Order Service running on http://localhost:8082")
    server.serve_forever()
