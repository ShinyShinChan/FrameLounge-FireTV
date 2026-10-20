#!/usr/bin/env python3
"""FrameXTV public browse-listing collector, with JavaScript-aware fallback.

A title appears only when listed on a FrameXTV browse page (HTML, bootstrap data,
or data returned to that page). No embed URLs are generated or video streams probed.
The existing catalog is never overwritten on an empty or suspicious scrape.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit
import html
import json
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'framextv-catalog.json'
BASE = 'https://framextv.cc'
HOSTS = {'framextv.cc', 'framextv.xyz'}
TITLE_LINK = re.compile(r'^/(movie|tv)/(\d{1,9})(?:/|$)')
MOVIE_GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37]
TV_GENRES = [10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37]
MAX_PAGES = 90
MAX_TITLES = 5000


def tidy(value):
    if not isinstance(value, str):
        return ''
    value = html.unescape(re.sub(r'\s+', ' ', value)).strip()
    value = re.sub(r'^(?:MOVIE|TV|SERIES|FILM|★\s*[\d.]+)\s*', '', value, flags=re.I)
    value = re.sub(r'\s+\b(?:19|20)\d\d\s*(?:Film|Series)?\s*$', '', value, flags=re.I)
    return value[:170].strip()


def title_record(kind, ident, title):
    if kind not in ('movie', 'tv'):
        return None
    try:
        ident = int(ident)
    except (TypeError, ValueError):
        return None
    title = tidy(title)
    if not 0 < ident < 1_000_000_000 or not title or title.casefold() in ('poster', 'image', 'movie', 'tv', 'no poster'):
        return None
    return {'type': kind, 'id': ident, 'title': title}


def kind_from_page(url):
    return 'tv' if urlsplit(url).path.startswith('/tv') else 'movie'


class ListingParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries = []
        self.navigation = set()
        self.anchor = None
        self.script_chunks = []
        self.in_script = False
        self.script_text = ''

    def handle_starttag(self, tag, attrs):
        at = dict(attrs)
        if tag == 'script':
            self.in_script = True
            self.script_text = ''
        if tag == 'a':
            href = html.unescape(at.get('href') or '').strip()
            if not href:
                return
            u = urlsplit(urljoin(BASE+'/', href))
            if u.hostname not in HOSTS or u.scheme not in ('https','http'):
                return
            m = TITLE_LINK.match(u.path)
            if m:
                if self.anchor:
                    self.entries.append(self.anchor)
                self.anchor = {'type':m.group(1),'id':int(m.group(2)), 'title':'',
                               'label':at.get('aria-label') or at.get('title') or '', 'poster':''}
            else:
                self.add_nav(u)
        elif tag == 'img' and self.anchor is not None:
            self.anchor['poster'] = self.anchor['poster'] or at.get('alt') or ''

    def add_nav(self, uri):
        if uri.path.rstrip('/') not in ('/movies','/tv'):
            return
        params = parse_qs(uri.query)
        if any(k not in ('genre','page','sort','year','search','query') for k in params):
            return
        if len(uri.query) < 140:
            self.navigation.add(BASE+uri.path+('?' + uri.query if uri.query else ''))

    def handle_data(self, value):
        if self.in_script:
            self.script_text += value
        if self.anchor is not None:
            self.anchor['title'] += value + ' '

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_script:
            if self.script_text.strip():
                self.script_chunks.append(self.script_text)
            self.in_script = False
        if tag == 'a' and self.anchor is not None:
            self.entries.append(self.anchor)
            self.anchor = None


def extract_objects(value, default_kind, result, depth=0):
    """Collect TMDB-style objects transported to the public browse page."""
    if depth > 16 or len(result) >= MAX_TITLES:
        return
    if isinstance(value, list):
        for entry in value:
            extract_objects(entry, default_kind, result, depth+1)
    elif isinstance(value, dict):
        kind = value.get('media_type') or value.get('mediaType') or value.get('type') or default_kind
        # A movie/TV object should have recognisable title metadata, not merely an id.
        t = value.get('title') or value.get('name') or value.get('original_title') or value.get('original_name')
        evidence = any(k in value for k in ('poster_path','posterPath','backdrop_path',
                    'release_date','first_air_date','genre_ids','vote_average','overview'))
        if kind in ('movie','tv') and isinstance(t,str) and evidence:
            r = title_record(kind, value.get('id') or value.get('tmdb_id') or value.get('tmdbId'), t)
            if r:
                result[(r['type'], r['id'])] = r
        for v in value.values():
            if isinstance(v,(dict,list)):
                extract_objects(v, default_kind, result, depth+1)


def variants(s):
    yield s
    # Next.js Flight data may encode links/objects inside JavaScript string literals.
    for _ in range(3):
        s2 = s.replace(r'\u002F','/').replace(r'\u002f','/').replace(r'\/','/').replace(r'\\"','"').replace(r'\"','"')
        if s2 == s:
            break
        yield s2
        s = s2


def extract_html(source, url):
    default_kind = kind_from_page(url)
    p = ListingParser()
    p.feed(source)
    found = {}
    for a in p.entries:
        record = title_record(a['type'], a['id'], a['poster'] or a['label'] or a['title'])
        if record:
            found[(record['type'], record['id'])] = record
    # Catch links generated in serialized props, e.g. href: "/movie/123".
    for variant in variants(source):
        for match in re.finditer(r'/(movie|tv)/(\d{1,9})(?=[/?#"\'\\<>\s]|$)', variant):
            kind, ident = match.group(1), int(match.group(2))
            key = (kind,ident)
            if key not in found:
                # Retrieve proper title if the same page's structured content includes it.
                found[key] = {'type':kind, 'id':ident, 'title':f'{"Movie" if kind=="movie" else "Series"} {ident}'}
        # Next __NEXT_DATA__ and inline RSC payloads may include actual TMDB list objects.
        try:
            # Only attempt complete JSON script tags; invalid JavaScript is expected.
            for chunk in p.script_chunks:
                if chunk.lstrip().startswith(('{','[')):
                    try:
                        extract_objects(json.loads(chunk), default_kind, found)
                    except (ValueError,TypeError):
                        pass
        except Exception:
            pass
        # Balanced-ish object candidates with title and id; posters/date ensure these are TMDB cards.
        for m in re.finditer(r'\{[^{}]{20,1800}\}', variant):
            candidate = m.group()
            if not any(k in candidate for k in ('poster_path','posterPath','release_date','first_air_date','backdrop_path')):
                continue
            try:
                obj = json.loads(candidate)
            except (ValueError,TypeError):
                continue
            extract_objects(obj,default_kind,found)
    # For matches with unknown title, do not erase any previously known titles.
    return found, p.navigation, {'html_bytes':len(source),'anchors':len(p.entries),'script_tags':len(p.script_chunks)}


def seed_pages():
    urls = [BASE+'/movies',BASE+'/tv']
    urls += [f'{BASE}/movies?genre={g}' for g in MOVIE_GENRES]
    urls += [f'{BASE}/tv?genre={g}' for g in TV_GENRES]
    urls += [f'{BASE}/{kind}?page={page}' for kind in ('movies','tv') for page in (2,3,4,5)]
    return urls


def read_url(url):
    req = urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
                                                 'Accept':'text/html,application/xhtml+xml'})
    with urllib.request.urlopen(req,timeout=16) as res:
        if res.status != 200:raise RuntimeError('HTTP '+str(res.status))
        content = res.read(6_000_000)
        return content.decode('utf-8','replace')


class BrowserCollector:
    """One Chromium browser used across pages; inspect DOM and public browse responses."""
    def __init__(self):
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(headless=True,args=['--no-sandbox'])
        self.context = self.browser.new_context(user_agent=('Mozilla/5.0 (X11; Linux x86_64) '+
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'),
            viewport={'width':1440,'height':1000},service_workers='block')

    def get(self,url):
        pg = self.context.new_page()
        records = {}
        extra_nav = set()
        response_counts = {'json':0,'tmdb':0}
        def on_response(res):
            try:
                req = res.request
                if req.resource_type not in ('fetch','xhr') or res.status!=200:
                    return
                typ = res.headers.get('content-type','')
                if 'json' not in typ:
                    return
                host = urlsplit(res.url).hostname or ''
                # Only page data requested during FrameXTV browsing, never an unrelated site.
                if host not in HOSTS and host not in ('api.themoviedb.org',):
                    return
                content = res.json()
                response_counts['json'] += 1
                before = len(records)
                extract_objects(content,kind_from_page(url),records)
                if len(records)>before:
                    response_counts['tmdb'] += len(records)-before
            except Exception:
                pass
        pg.on('response',on_response)
        try:
            pg.goto(url,wait_until='domcontentloaded',timeout=22000)
            # Wait for client-driven cards to appear, but do not test any stream.
            pg.wait_for_timeout(1800)
            source = pg.content()
            extracted, extra_nav, metrics = extract_html(source,url)
            for key, value in records.items():
                if key not in extracted or extracted[key]['title'].startswith(('Movie ','Series ')):
                    extracted[key]=value
            metrics['json_responses']=response_counts['json']
            metrics['network_titles']=response_counts['tmdb']
            return extracted, extra_nav,metrics
        finally:
            pg.close()

    def close(self):
        self.browser.close()
        self.pw.stop()


def choose(current,new):
    if current is None:
        return new
    old_placeholder=current['title'].startswith(('Movie ','Series '))
    new_placeholder=new['title'].startswith(('Movie ','Series '))
    if old_placeholder and not new_placeholder:
        return new
    return current


def main():
    existing=json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'items':[]}
    known={(x['type'],int(x['id'])):x for x in existing.get('items',[])
           if x.get('type') in ('movie','tv') and str(x.get('id','')).isdigit()}
    queue=deque(seed_pages())
    visited=set()
    queued=set(queue)
    found={}
    working=0
    browser=None
    used_browser=False
    try:
        while queue and len(visited)<MAX_PAGES and len(found)<MAX_TITLES:
            url=queue.popleft()
            if url in visited:continue
            visited.add(url)
            records={}; navigation=set();method='HTML'; diag={}
            try:
                source=read_url(url)
                records,navigation,diag=extract_html(source,url)
                if len(records) < 12:
                    if browser is None:
                        browser=BrowserCollector()
                        print('Browser fallback enabled: static HTML exposes fewer than 12 listings')
                    records,navigation,diag=browser.get(url)
                    method='Chromium'
                    used_browser=True
            except Exception as ex:
                print(f'{url}: {method} unavailable: {str(ex)[:160]}')
                # Static fetch may be blocked while the browser succeeds.
                if browser is not None:
                    try:
                        records,navigation,diag=browser.get(url)
                        method='Chromium'
                        used_browser=True
                    except Exception as br:
                        print(f'  Browser unavailable: {str(br)[:140]}')
            for key,value in records.items():
                old=known.get(key)
                if value['title'].startswith(('Movie ','Series ')) and old:
                    value=dict(old)
                found[key]=choose(found.get(key),value)
            if records:working+=1
            print(f'{url}: {len(records)} titles via {method} '
                  f'(HTML bytes={diag.get("html_bytes",0)}, anchors={diag.get("anchors",0)}, '
                  f'scripts={diag.get("script_tags",0)}, network={diag.get("network_titles",0)})')
            for link in sorted(navigation):
                if link not in queued and len(queued)<MAX_PAGES*2:
                    queue.append(link); queued.add(link)
            if browser is None and len(visited)<3:
                time.sleep(.12)
    finally:
        if browser is not None:
            browser.close()
    print(f'Scanned {len(visited)} FrameXTV browse URLs; {working} pages with titles; '
          f'{len(found)} distinct titles; browser fallback={used_browser}')
    if not found or working==0 or len(found)<10:
        raise SystemExit('No trustworthy listings found. Existing catalog retained. '
                         'Read HTML/Chromium diagnostics above; do NOT replace the JSON with an empty list.')
    if len(found)<len(known)//3:
        raise SystemExit('Suspicious catalog shrinkage. Existing catalog retained.')
    for k,v in list(found.items()):
        if v['title'].startswith(('Movie ','Series ')) and k in known:
            found[k]=dict(known[k])
    result={'schema':1,'version':datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            'source':'FrameXTV publicly listed titles; not stream-tested',
            'items':sorted(found.values(),key=lambda x:(x['type'],x['title'].casefold(),x['id']))}
    if result['items']==existing.get('items'):
        print('No catalog changes')
        return
    OUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('Updated public catalog:',len(result['items']),'titles')

if __name__=='__main__':
    main()
