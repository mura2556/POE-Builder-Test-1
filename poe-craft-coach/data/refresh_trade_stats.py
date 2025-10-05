#!/usr/bin/env python3
import json
import sqlite3
import time
from datetime import datetime
from pathlib import Path

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

DB_PATH = Path(__file__).resolve().parents[1] / 'db' / 'craftcoach.db'
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

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


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def fetch(url: str) -> dict:
    resp = requests.get(url, headers=HEADERS, timeout=40)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    try:
        static_payload = fetch(STATIC_URL)
        stats_payload = fetch(STATS_URL)
        conn.execute('INSERT INTO trade_static (payload, created_at) VALUES (?, ?)', (json.dumps(static_payload), datetime.utcnow().isoformat()))
        conn.execute('INSERT INTO trade_stats (payload, created_at) VALUES (?, ?)', (json.dumps(stats_payload), datetime.utcnow().isoformat()))
        conn.commit()
    finally:
        conn.close()
    print('Trade static+stats refreshed')


if __name__ == '__main__':
    main()
