#!/usr/bin/env python3
"""Seed the local SQLite database with PoE metadata."""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import requests
from bs4 import BeautifulSoup

from utils import fetch_with_cache

DB_PATH = Path(__file__).resolve().parents[1] / 'db' / 'craftcoach.db'
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

LOCAL_FALLBACK_MODS = Path(__file__).with_name('static') / 'mods.min.json'
LOCAL_PASSIVE_TREE = Path(__file__).with_name('static') / 'passive_skill_tree.json'

HEADERS = {
    'User-Agent': 'poe-craft-coach/0.1 (+https://github.com)'
}

POEDB_PAGES: List[Tuple[str, str]] = [
    ('Prefix', 'https://poedb.tw/us/mod.php?type=Prefix'),
    ('Suffix', 'https://poedb.tw/us/mod.php?type=Suffix'),
]

FALLBACK_MODS = 'https://raw.githubusercontent.com/brather1ng/RePoE/master/data/mods.min.json'
PASSIVE_TREE_URL = 'https://www.poewiki.net/w/images/2/2c/Passive_skill_tree.json'
TRADE_STATS_URL = 'https://www.pathofexile.com/api/trade/data/stats'


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS mods (
               id TEXT PRIMARY KEY,
               base TEXT,
               type TEXT,
               domain TEXT,
               generation_type TEXT,
               full_text TEXT,
               group_id TEXT,
               spawn_weights_json TEXT,
               tags_json TEXT
           )'''
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_mods_base ON mods(base)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_mods_group ON mods(group_id)')

    conn.execute(
        '''CREATE TABLE IF NOT EXISTS mod_groups (
               id TEXT PRIMARY KEY,
               label TEXT,
               type TEXT
           )'''
    )
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS tags (
               id TEXT PRIMARY KEY,
               description TEXT
           )'''
    )
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS bases (
               id TEXT PRIMARY KEY,
               name TEXT,
               tags_json TEXT
           )'''
    )

    conn.execute(
        '''CREATE TABLE IF NOT EXISTS passive_tree (
               id INTEGER PRIMARY KEY,
               version TEXT,
               json TEXT,
               fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )


def fetch_poedb_mods() -> list[dict]:
    session = requests.Session()
    session.headers.update(HEADERS)
    results: list[dict] = []
    for label, url in POEDB_PAGES:
        try:
            payload, _, _ = fetch_with_cache(session, url, f'poedb_{label.lower()}', timeout=60, sleep_seconds=1.5)
            soup = BeautifulSoup(payload.decode('utf-8', errors='ignore'), 'lxml')
            table = soup.find('table')
            if not table:
                continue
            for row in table.select('tbody tr'):
                cols = [c.get_text(strip=True) for c in row.find_all('td')]
                if len(cols) < 4:
                    continue
                mod_id = cols[0]
                text = cols[1]
                domain = cols[2]
                tags = cols[3].split(',') if len(cols) > 3 else []
                results.append(
                    {
                        'id': mod_id,
                        'full_text': text,
                        'domain': domain,
                        'generation_type': label.lower(),
                        'tags': [tag.strip() for tag in tags if tag.strip()],
                        'base': domain,
                        'type': label.lower(),
                        'group_id': None,
                    }
                )
        except requests.RequestException:
            continue
    return results


def fetch_fallback_mods() -> list[dict]:
    session = requests.Session()
    session.headers.update(HEADERS)
    data: dict[str, dict]
    try:
        payload, _, _ = fetch_with_cache(session, FALLBACK_MODS, 'repoe_mods', timeout=90, sleep_seconds=1.0)
        data = json.loads(payload)
    except requests.RequestException:
        if LOCAL_FALLBACK_MODS.exists():
            data = json.loads(LOCAL_FALLBACK_MODS.read_text())
        else:
            raise
    results: list[dict] = []
    for mod_id, payload in data.items():
        text = payload.get('name') or payload.get('desc') or mod_id
        tags = payload.get('tags') or []
        results.append(
            {
                'id': mod_id,
                'full_text': text,
                'domain': payload.get('domain', ''),
                'generation_type': payload.get('generation_type', ''),
                'group_id': payload.get('group'),
                'spawn_weights_json': json.dumps(payload.get('spawn_weights', [])),
                'tags_json': json.dumps(tags),
                'tags': tags,
                'base': payload.get('domain', ''),
                'type': payload.get('type') or payload.get('generation_type', ''),
            }
        )
    return results


def fetch_trade_api_mods() -> list[dict]:
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        payload, _, _ = fetch_with_cache(session, TRADE_STATS_URL, 'trade_stats_seed', timeout=90, sleep_seconds=1.0)
        data = json.loads(payload)
    except requests.RequestException:
        return []
    results: list[dict] = []
    for category in data.get('result', []):
        domain = category.get('id', '')
        label = category.get('label', '')
        for entry in category.get('entries', []):
            mod_id = entry.get('id')
            if not mod_id:
                continue
            text = entry.get('text') or entry.get('name') or mod_id
            entry_type = entry.get('type') or label
            results.append(
                {
                    'id': mod_id,
                    'full_text': text,
                    'domain': domain,
                    'generation_type': entry.get('type') or '',
                    'group_id': entry.get('group'),
                    'spawn_weights_json': json.dumps(entry.get('generation_weights', [])),
                    'tags_json': json.dumps(entry.get('flags', [])),
                    'tags': entry.get('flags', []),
                    'base': domain,
                    'type': entry_type,
                }
            )
    return results


def seed_mods(conn: sqlite3.Connection) -> None:
    mods = fetch_poedb_mods()
    if not mods:
        try:
            mods = fetch_fallback_mods()
        except requests.RequestException:
            mods = []
    if not mods:
        mods = fetch_trade_api_mods()
    if not mods and LOCAL_FALLBACK_MODS.exists():
        data = json.loads(LOCAL_FALLBACK_MODS.read_text())
        mods = [
            {
                'id': mod_id,
                'full_text': payload.get('name') or payload.get('desc') or mod_id,
                'domain': payload.get('domain', ''),
                'generation_type': payload.get('generation_type', ''),
                'group_id': payload.get('group'),
                'spawn_weights_json': json.dumps(payload.get('spawn_weights', [])),
                'tags_json': json.dumps(payload.get('tags', [])),
                'tags': payload.get('tags', []),
                'base': payload.get('domain', ''),
                'type': payload.get('type') or payload.get('generation_type', ''),
            }
            for mod_id, payload in data.items()
        ]
    if not mods:
        raise RuntimeError('Unable to fetch mod data from PoEDB, fallback, or trade API')

    conn.execute('DELETE FROM mods')
    conn.execute('DELETE FROM mod_groups')
    conn.execute('DELETE FROM tags')
    conn.execute('DELETE FROM bases')

    group_records: Dict[str, Dict[str, str]] = {}
    tag_counts: Dict[str, int] = defaultdict(int)
    base_records: Dict[str, Dict[str, str]] = {}

    for mod in mods:
        tags = mod.get('tags') or []
        spawn_weights_json = mod.get('spawn_weights_json') or json.dumps([])
        tags_json = mod.get('tags_json') or json.dumps(tags)
        group_id = mod.get('group_id')
        if group_id and group_id not in group_records:
            group_records[group_id] = {
                'id': group_id,
                'label': mod.get('group_label') or mod.get('full_text', ''),
                'type': mod.get('type') or mod.get('generation_type') or '',
            }
        for tag in tags:
            if isinstance(tag, str) and tag:
                tag_counts[tag] += 1
        base_key = mod.get('base') or mod.get('domain') or ''
        if base_key and base_key not in base_records:
            base_records[base_key] = {
                'id': base_key,
                'name': base_key,
                'tags_json': json.dumps(tags),
            }
        conn.execute(
            '''INSERT OR REPLACE INTO mods (id, base, type, domain, generation_type, full_text, group_id, spawn_weights_json, tags_json)
               VALUES (:id, :base, :type, :domain, :generation_type, :full_text, :group_id, :spawn_weights_json, :tags_json)''',
            {
                'id': mod.get('id'),
                'base': base_key,
                'type': mod.get('type') or '',
                'domain': mod.get('domain') or '',
                'generation_type': mod.get('generation_type') or '',
                'full_text': mod.get('full_text') or '',
                'group_id': group_id or '',
                'spawn_weights_json': spawn_weights_json,
                'tags_json': tags_json,
            },
        )

    for group in group_records.values():
        conn.execute(
            'INSERT OR REPLACE INTO mod_groups (id, label, type) VALUES (:id, :label, :type)',
            group,
        )

    for tag, count in tag_counts.items():
        conn.execute(
            'INSERT OR REPLACE INTO tags (id, description) VALUES (?, ?)',
            (tag, f'Occurrences: {count}'),
        )

    for base in base_records.values():
        conn.execute(
            'INSERT OR REPLACE INTO bases (id, name, tags_json) VALUES (:id, :name, :tags_json)',
            base,
        )


def seed_passive_tree(conn: sqlite3.Connection) -> None:
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        payload, _, _ = fetch_with_cache(session, PASSIVE_TREE_URL, 'passive_tree', timeout=90, sleep_seconds=1.0)
        tree_json = payload.decode('utf-8')
    except requests.RequestException:
        if LOCAL_PASSIVE_TREE.exists():
            tree_json = LOCAL_PASSIVE_TREE.read_text()
        else:
            raise
    try:
        parsed = json.loads(tree_json)
        version = parsed.get('version') or parsed.get('treeVersion') or 'latest'
    except json.JSONDecodeError:
        version = 'latest'
    conn.execute('DELETE FROM passive_tree')
    conn.execute(
        'INSERT INTO passive_tree (id, version, json) VALUES (1, ?, ?)',
        (version, tree_json),
    )


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    try:
        seed_mods(conn)
        seed_passive_tree(conn)
        conn.commit()
    finally:
        conn.close()
    print('Seed complete')


if __name__ == '__main__':
    main()
