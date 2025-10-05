#!/usr/bin/env python3
"""Refresh local price tables from poe.ninja and poe.watch."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, UTC
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from utils import fetch_with_cache

DB_PATH = Path(__file__).resolve().parents[1] / 'db' / 'craftcoach.db'
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

HEADERS = {
    'User-Agent': 'poe-craft-coach/0.1 (+https://github.com)'
}

DEFAULT_LEAGUE = 'Standard'

POE_NINJA_BASE = 'https://poe.ninja/api/data'
POE_NINJA_ITEM_TYPES = [
    'UniqueArmour',
    'UniqueWeapon',
    'UniqueAccessory',
    'DivinationCard',
    'SkillGem',
    'Map',
    'ClusterJewel',
    'DeliriumOrb',
]
POE_NINJA_CURRENCY_TYPES = ['Currency', 'Fragment']

POEWATCH_ENDPOINT = 'https://api.poe.watch/get'

SourceTable = Literal['prices_ninja', 'prices_watch']


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS prices_ninja (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               item TEXT,
               league TEXT,
               chaos_value REAL,
               divine_value REAL,
               payload TEXT,
               created_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS prices_watch (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               item TEXT,
               league TEXT,
               chaos_value REAL,
               divine_value REAL,
               payload TEXT,
               created_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prices_ninja_item_league ON prices_ninja(item, league)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prices_watch_item_league ON prices_watch(item, league)')


def insert_price(
    conn: sqlite3.Connection,
    table: SourceTable,
    item: str,
    league: str,
    chaos: float,
    divine: float,
    payload: dict
) -> None:
    conn.execute(
        f'INSERT INTO {table} (item, league, chaos_value, divine_value, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        (
            item,
            league,
            chaos,
            divine,
            json.dumps(payload),
            datetime.now(UTC).isoformat()
        ),
    )


@retry(stop=stop_after_attempt(1), wait=wait_exponential(min=1, max=2))
def get_json(session: requests.Session, url: str, cache_key: str, params: dict | None = None) -> dict:
    query = f"{url}?{urlencode(params)}" if params else url
    payload, _, _ = fetch_with_cache(session, query, cache_key, timeout=45, sleep_seconds=1.0)
    return json.loads(payload)


def sync_poe_ninja(conn: sqlite3.Connection, league: str, session: requests.Session) -> None:
    for item_type in POE_NINJA_ITEM_TYPES:
        try:
            data = get_json(
                session,
                f'{POE_NINJA_BASE}/itemoverview',
                f'poeninja_item_{league}_{item_type}',
                params={'league': league, 'type': item_type},
            )
        except Exception:
            break
        for entry in data.get('lines', []):
            name = entry.get('name') or entry.get('baseType')
            if not name:
                continue
            chaos = entry.get('chaosValue') or 0.0
            divine = entry.get('divineValue') or (chaos / max(entry.get('divineChaosValue', 150), 1))
            insert_price(conn, 'prices_ninja', name, league, float(chaos), float(divine or 0.0), entry)

    for currency_type in POE_NINJA_CURRENCY_TYPES:
        try:
            data = get_json(
                session,
                f'{POE_NINJA_BASE}/currencyoverview',
                f'poeninja_currency_{league}_{currency_type}',
                params={'league': league, 'type': currency_type},
            )
        except Exception:
            break
        for entry in data.get('lines', []):
            name = entry.get('currencyTypeName')
            if not name:
                continue
            chaos = entry.get('chaosEquivalent') or entry.get('chaosValue') or 0.0
            divine = entry.get('divineValue') or (chaos / max(entry.get('divineChaosValue', 150), 1))
            insert_price(conn, 'prices_ninja', name, league, float(chaos), float(divine or 0.0), entry)


def sync_poe_watch(conn: sqlite3.Connection, league: str, session: requests.Session) -> None:
    params = {'category': 'currency', 'league': league}
    try:
        data = get_json(session, POEWATCH_ENDPOINT, f'poewatch_{league}', params=params)
    except Exception:
        data = []
    for entry in data or []:
        name = entry.get('name')
        if not name:
            continue
        chaos = entry.get('mean') or 0.0
        divine = entry.get('median') or chaos
        insert_price(conn, 'prices_watch', name, league, float(chaos), float(divine or 0.0), entry)


def main() -> None:
    league = os.environ.get('LEAGUE', DEFAULT_LEAGUE)
    session = requests.Session()
    session.headers.update(HEADERS)
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    try:
        sync_poe_ninja(conn, league, session)
        sync_poe_watch(conn, league, session)
        conn.commit()
    finally:
        conn.close()
    print('Price refresh complete for', league)


if __name__ == '__main__':
    main()
