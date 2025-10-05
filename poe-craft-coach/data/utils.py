#!/usr/bin/env python3
"""Shared utilities for PoE Craft Coach data scripts."""
from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

import requests

CACHE_DIR = Path(__file__).resolve().parent / '.cache'
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_paths(name: str) -> Tuple[Path, Path]:
    safe_name = name.replace('/', '_').replace(':', '_')
    meta = CACHE_DIR / f'{safe_name}.meta.json'
    body = CACHE_DIR / f'{safe_name}.body'
    return meta, body


def fetch_with_cache(
    session: requests.Session,
    url: str,
    name: str,
    *,
    timeout: int = 60,
    sleep_seconds: float = 1.0
) -> Tuple[bytes, Dict[str, Any], bool]:
    """Fetch a URL with HTTP cache headers and optional polite delay."""
    meta_path, body_path = _cache_paths(name)
    headers: Dict[str, str] = {}
    if meta_path.exists():
        try:
            cached = json.loads(meta_path.read_text())
        except json.JSONDecodeError:
            cached = {}
        etag = cached.get('etag')
        last_modified = cached.get('last_modified')
        if etag:
            headers['If-None-Match'] = etag
        if last_modified:
            headers['If-Modified-Since'] = last_modified
    else:
        cached = {}

    resp = session.get(url, headers=headers, timeout=timeout)
    if resp.status_code == 304 and body_path.exists():
        # No change; reuse cached body.
        return body_path.read_bytes(), cached, True

    resp.raise_for_status()
    meta = {
        'etag': resp.headers.get('ETag'),
        'last_modified': resp.headers.get('Last-Modified'),
        'content_type': resp.headers.get('Content-Type'),
        'fetched_at': datetime.utcnow().isoformat(),
        'url': url,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    body_path.write_bytes(resp.content)
    if sleep_seconds:
        time.sleep(sleep_seconds)
    return resp.content, meta, False


def polite_sleep(seconds: float) -> None:
    """Sleep for a polite interval when scraping external resources."""
    if seconds > 0:
        time.sleep(seconds)
