"""Dummy User Service - port 8081"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, time

USERS = [
    {"id": "u1", "username": "alice", "email": "alice@test.com"},
    {"id": "u2", "username": "bob",   "email": "bob@test.com"},
    {"id": "u3", "username": "charlie", "email": "charlie@test.com"},
]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[user-svc] {args[0]} {args[1]}")

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
            self.send_json(USERS)
        else:
            uid = path.lstrip("/")
            user = next((u for u in USERS if u["id"] == uid), None)
            if user:
                self.send_json(user)
            else:
                self.send_json({"id": uid, "username": f"user_{uid}", "email": f"{uid}@example.com"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        body["id"] = f"u_{int(time.time())}"
        body["created"] = True
        self.send_json(body, 201)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        body["updated"] = True
        self.send_json(body)

    def do_DELETE(self):
        uid = self.path.lstrip("/")
        self.send_json({"id": uid, "deleted": True})

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8081), Handler)
    print("✅ User Service running on http://localhost:8081")
    server.serve_forever()
