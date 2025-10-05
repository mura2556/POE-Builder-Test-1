#!/usr/bin/env python3
import json
import sqlite3
from datetime import datetime, UTC
from pathlib import Path

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from utils import fetch_with_cache

DB_PATH = Path(__file__).resolve().parents[1] / 'db' / 'craftcoach.db'
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

LOCAL_STATIC = Path(__file__).with_name('static') / 'trade_static.json'
LOCAL_STATS = Path(__file__).with_name('static') / 'trade_stats.json'

HEADERS = {
    'User-Agent': 'poe-craft-coach/0.1 (+https://github.com)'
}

STATIC_URL = 'https://www.pathofexile.com/api/trade/data/static'
STATS_URL = 'https://www.pathofexile.com/api/trade/data/stats'


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS trade_static (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               payload TEXT,
               created_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS trade_stats (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               payload TEXT,
               created_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )


@retry(stop=stop_after_attempt(1), wait=wait_exponential(min=1, max=2))
def fetch(session: requests.Session, url: str, cache_key: str, fallback: Path) -> dict:
    try:
        payload, _, _ = fetch_with_cache(session, url, cache_key, timeout=45, sleep_seconds=1.0)
        return json.loads(payload)
    except requests.RequestException:
        if fallback.exists():
            return json.loads(fallback.read_text())
        return {}


def main() -> None:
    session = requests.Session()
    session.headers.update(HEADERS)
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    try:
        static_payload = fetch(session, STATIC_URL, 'trade_static', LOCAL_STATIC)
        stats_payload = fetch(session, STATS_URL, 'trade_stats', LOCAL_STATS)
        conn.execute('INSERT INTO trade_static (payload, created_at) VALUES (?, ?)', (json.dumps(static_payload), datetime.now(UTC).isoformat()))
        conn.execute('INSERT INTO trade_stats (payload, created_at) VALUES (?, ?)', (json.dumps(stats_payload), datetime.now(UTC).isoformat()))
        conn.commit()
    finally:
        conn.close()
    print('Trade static+stats refreshed')


if __name__ == '__main__':
    main()
