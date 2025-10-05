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

LEAGUE = Path(__file__).stem.split('_')[0]
DEFAULT_LEAGUE = 'Settlers'

PRICE_ENDPOINTS = [
    ('ninja', 'item', 'https://poe.ninja/api/data/itemoverview'),
    ('ninja', 'currency', 'https://poe.ninja/api/data/currencyoverview')
]

POEWATCH_ENDPOINT = 'https://api.poe.watch/get'


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS prices (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               item TEXT,
               league TEXT,
               source TEXT,
               chaos_value REAL,
               divine_value REAL,
               payload TEXT,
               created_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prices_item ON prices(item, league)')


def insert_price(conn: sqlite3.Connection, item: str, league: str, source: str, chaos: float, divine: float, payload: dict) -> None:
    conn.execute(
        'INSERT INTO prices (item, league, source, chaos_value, divine_value, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (
            item,
            league,
            source,
            chaos,
            divine,
            json.dumps(payload),
            datetime.utcnow().isoformat()
        )
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def get_json(url: str, params: dict | None = None) -> dict:
    resp = requests.get(url, params=params, headers=HEADERS, timeout=40)
    resp.raise_for_status()
    return resp.json()


def sync_poe_ninja(conn: sqlite3.Connection, league: str) -> None:
    for source, kind, base_url in PRICE_ENDPOINTS:
        url = f'{base_url}?league={league}&type=UniqueArmour'
        if kind == 'currency':
            url = f'{base_url}?league={league}&type=Currency'
        data = get_json(url)
        entries = data.get('lines', [])
        for entry in entries:
            name = entry.get('name') or entry.get('currencyTypeName')
            if not name:
                continue
            chaos = entry.get('chaosValue') or entry.get('chaosEquivalent') or 0.0
            divine = entry.get('divineValue') or (chaos / max(entry.get('divineChaosValue', 150), 1))
            insert_price(conn, name, league, source, chaos, divine, entry)
        time.sleep(1.2)


def sync_poe_watch(conn: sqlite3.Connection, league: str) -> None:
    params = {'category': 'currency', 'league': league}
    data = get_json(POEWATCH_ENDPOINT, params=params)
    for entry in data or []:
        name = entry.get('name')
        if not name:
            continue
        chaos = entry.get('mean') or 0.0
        divine = entry.get('median') or chaos
        insert_price(conn, name, league, 'watch', chaos, divine, entry)
    time.sleep(1.0)


def main() -> None:
    league = DEFAULT_LEAGUE
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    try:
        sync_poe_ninja(conn, league)
        sync_poe_watch(conn, league)
        conn.commit()
    finally:
        conn.close()
    print('Price refresh complete for', league)


if __name__ == '__main__':
    main()
