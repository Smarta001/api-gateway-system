"""
db.py — MongoDB connection and log fetching utilities.
"""

from pymongo import MongoClient
from datetime import datetime, timezone
from typing import Optional
import os

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "api_gateway")

_client: Optional[MongoClient] = None

def get_db():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client[DB_NAME]

def get_logs(
    from_dt:  Optional[datetime] = None,
    to_dt:    Optional[datetime] = None,
    username: Optional[str]      = None,
    limit:    int                = 10_000,
) -> list[dict]:
    """
    Fetch request logs from MongoDB with optional filters.
    """
    db      = get_db()
    query: dict = {}

    if from_dt or to_dt:
        query["timestamp"] = {}
        if from_dt: query["timestamp"]["$gte"] = from_dt
        if to_dt:   query["timestamp"]["$lte"] = to_dt

    if username:
        query["username"] = username

    cursor = db["request_logs"].find(query).sort("timestamp", 1).limit(limit)
    return list(cursor)

def get_recent_logs(minutes: int = 60, limit: int = 10_000) -> list[dict]:
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return get_logs(from_dt=since, limit=limit)
