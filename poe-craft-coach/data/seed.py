#!/usr/bin/env python3
import json
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

DB_PATH = Path(__file__).resolve().parents[1] / 'db' / 'craftcoach.db'
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

HEADERS = {
    'User-Agent': 'poe-craft-coach/0.1 (+https://github.com)'
}

POEDB_PAGES = [
    ('Prefix', 'https://poedb.tw/us/mod.php?type=Prefix'),
    ('Suffix', 'https://poedb.tw/us/mod.php?type=Suffix'),
]

FALLBACK_MODS = 'https://raw.githubusercontent.com/brather1ng/RePoE/master/data/mods.min.json'
PASSIVE_TREE_URL = 'https://www.poewiki.net/w/images/2/2c/Passive_skill_tree.json'


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
            resp = session.get(url, timeout=40)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, 'lxml')
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
                        'tags': tags,
                        'base': domain
                    }
                )
            time.sleep(1.5)
        except requests.RequestException:
            continue
    return results


def fetch_fallback_mods() -> list[dict]:
    resp = requests.get(FALLBACK_MODS, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    data = resp.json()
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
                'base': payload.get('domain', '')
            }
        )
    return results


def seed_mods(conn: sqlite3.Connection) -> None:
    mods = fetch_poedb_mods()
    if not mods:
        mods = fetch_fallback_mods()
    conn.execute('DELETE FROM mods')
    for mod in mods:
        conn.execute(
            '''INSERT OR REPLACE INTO mods (id, base, type, domain, generation_type, full_text, group_id, spawn_weights_json, tags_json)
               VALUES (:id, :base, :type, :domain, :generation_type, :full_text, :group_id, :spawn_weights_json, :tags_json)''',
            {
                'id': mod.get('id'),
                'base': mod.get('base') or '',
                'type': mod.get('type') or '',
                'domain': mod.get('domain') or '',
                'generation_type': mod.get('generation_type') or '',
                'full_text': mod.get('full_text') or '',
                'group_id': mod.get('group_id') or '',
                'spawn_weights_json': mod.get('spawn_weights_json') or json.dumps([]),
                'tags_json': mod.get('tags_json') or json.dumps(mod.get('tags', []))
            }
        )
    conn.commit()


def seed_passive_tree(conn: sqlite3.Connection) -> None:
    resp = requests.get(PASSIVE_TREE_URL, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    version = payload.get('version') or payload.get('treeVersion') or 'unknown'
    conn.execute('DELETE FROM passive_tree')
    conn.execute(
        'INSERT INTO passive_tree (version, json) VALUES (?, ?)',
        (version, json.dumps(payload))
    )
    conn.commit()


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    seed_mods(conn)
    seed_passive_tree(conn)
    conn.close()
    print('Seed complete ->', DB_PATH)


if __name__ == '__main__':
    main()
