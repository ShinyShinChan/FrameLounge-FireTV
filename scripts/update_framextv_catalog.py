#!/usr/bin/env python3
"""Build the Frame Lounge catalogue from FrameXTV's publicly linked movies/TV.

The presence of a listing link is the inclusion criterion. We NEVER probe an
embed URL or a media stream. Multiple public browsing/genre/pagination pages
are checked, and a failed or implausibly small scrape never replaces the list.
"""
from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, parse_qs
import html
import json
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'framextv-catalog.json'
BASE = 'https://framextv.cc'
ALLOWED_HOSTS = {'framextv.cc', 'framextv.xyz'}
TITLE_LINK = re.compile(r'^/(movie|tv)/(\d{1,9})(?:/|$)')
MOVIE_GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37]
TV_GENRES = [10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37]
MAX_PAGES = 140
MAX_TITLES = 5000  # Also enforced by the Fire TV client.


class ListingParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries = []
        self.navigation = set()
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            href = html.unescape(attrs.get('href') or '').strip()
            if not href:
                self.anchor = None
                return
            uri = urlsplit(urljoin(BASE + '/', href))
            if uri.scheme not in ('https', 'http') or uri.hostname not in ALLOWED_HOSTS:
                self.anchor = None
                return
            found = TITLE_LINK.match(uri.path)
            if found:
                self.anchor = {
                    'type': found.group(1), 'id': int(found.group(2)),
                    'title': '', 'label': attrs.get('aria-label') or attrs.get('title') or '',
                    'poster': ''
                }
            else:
                self.anchor = None
                self._add_navigation(uri)
        elif tag == 'img' and self.anchor is not None:
            self.anchor['poster'] = self.anchor['poster'] or attrs.get('alt', '')

    def _add_navigation(self, uri):
        # Follow only publicly linked browse/filter/pagination URLs, not movies,
        # embedded players, profile links, or arbitrary outside websites.
        if uri.path.rstrip('/') not in ('/movies', '/tv'):
            return
        params = parse_qs(uri.query)
        if any(k not in ('genre', 'page', 'sort', 'year', 'search', 'query') for k in params):
            return
        if len(uri.query) > 140:
            return
        self.navigation.add(BASE + uri.path + ('?' + uri.query if uri.query else ''))

    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor['title'] += data + ' '

    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor is not None:
            self.entries.append(self.anchor)
            self.anchor = None


def clean_title(s):
    s = html.unescape(re.sub(r'\s+', ' ', s or '')).strip()
    s = re.sub(r'^(?:MOVIE|TV|SERIES|Film|★\s*[\d.]+)\s*', '', s, flags=re.I)
    s = re.sub(r'\s+\b(?:19|20)\d\d\s*(?:Film|Series)?\s*$', '', s, flags=re.I)
    s = re.sub(r'^(?:★\s*[\d.]+)\s*', '', s, flags=re.I)
    return s[:170].strip()


def read_url(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; FrameLoungeCatalog/1.1; personal-frontend)',
        'Accept': 'text/html,application/xhtml+xml'
    })
    with urllib.request.urlopen(req, timeout=18) as response:
        if response.status != 200:
            raise RuntimeError(f'HTTP {response.status}')
        if 'text/html' not in response.headers.get('Content-Type', 'text/html'):
            raise RuntimeError('Not HTML')
        return response.read(5_000_000).decode('utf-8', 'replace')


def seed_pages():
    urls = [BASE + '/movies', BASE + '/tv']
    urls += [f'{BASE}/movies?genre={g}' for g in MOVIE_GENRES]
    urls += [f'{BASE}/tv?genre={g}' for g in TV_GENRES]
    # Some browse pages use client-side Next/Prev controls instead of anchors.
    # These are still the public browse pages, not synthetic movie/embed URLs.
    urls += [f'{BASE}/{kind}?page={page}' for kind in ('movies', 'tv') for page in (2, 3, 4, 5)]
    return urls


def main():
    existing = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'items': []}
    known = {(x['type'], int(x['id'])): x for x in existing.get('items', [])
             if x.get('type') in ('movie', 'tv') and str(x.get('id', '')).isdigit()}
    queue = deque(seed_pages())
    queued = set(queue)
    visited = set()
    found = {}
    working = 0
    while queue and len(visited) < MAX_PAGES and len(found) < MAX_TITLES:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)
        try:
            parser = ListingParser()
            parser.feed(read_url(url))
            new_on_page = 0
            for entry in parser.entries:
                key = (entry['type'], entry['id'])
                old = known.get(key, {})
                title = (clean_title(entry['poster']) or clean_title(entry['label'])
                         or clean_title(entry['title']) or old.get('title', ''))
                if title.lower() in {'poster', 'no poster', 'image', 'movie', 'tv'}:
                    title = old.get('title', '')
                if not title:
                    title = f'{"Movie" if entry["type"] == "movie" else "Series"} {entry["id"]}'
                if key not in found:
                    new_on_page += 1
                found[key] = {'type': entry['type'], 'id': entry['id'], 'title': title}
            if parser.entries:
                working += 1
            print(f'{url}: {len(parser.entries)} listing links, {new_on_page} new')
            for link in sorted(parser.navigation):
                if link not in queued and len(queued) < MAX_PAGES * 2:
                    queued.add(link)
                    queue.append(link)
        except Exception as exc:
            print(f'{url}: unavailable: {str(exc)[:180]}')
        if queue:
            time.sleep(0.1)

    print(f'Scanned {len(visited)} browse URLs; {working} returned listings; {len(found)} distinct titles')
    if working == 0 or len(found) < 10:
        raise SystemExit('No trustworthy listings fetched: last catalog retained')
    if len(found) < len(known) // 3:
        raise SystemExit('Suspicious shrinkage: last catalog retained')
    for key, title in found.items():
        if title['title'].startswith(('Movie ', 'Series ')) and key in known:
            title['title'] = known[key]['title']
    result = {
        'schema': 1, 'version': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'source': 'FrameXTV listed browsing links; presumed playable, no stream checks',
        'items': sorted(found.values(), key=lambda x: (x['type'], x['title'].casefold(), x['id']))
    }
    if result['items'] == existing.get('items'):
        print('No change in title listings')
        return
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('Published', len(result['items']), 'titles')


if __name__ == '__main__':
    main()
