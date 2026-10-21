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
# Deliberately bounded per run; subsequent runs resume the remaining public browse URLs.
MAX_PAGES = 90
MAX_TITLES = 8000
PROGRESS = ROOT / 'framextv-crawl-progress.json'
MAX_PENDING = 1800


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


# FRAME_LOUNGE_CATALOG_METADATA_V2 — only public attributes attached to titles
# actually linked/listed on FrameXTV, not results from an unrelated TMDB search.
def public_metadata(record, value):
    out=dict(record)
    if not isinstance(value,dict):return out
    genres=value.get('genre_ids') or value.get('genreIds') or []
    if isinstance(genres,list):
        out['genre_ids']=[x for x in genres if isinstance(x,int) and 0<x<100000][:12]
    released=value.get('release_date') or value.get('first_air_date') or ''
    if isinstance(released,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',released):
        out['release_date']=released
    runtime=value.get('runtime')
    if isinstance(runtime,int) and 1<=runtime<=1000:out['runtime']=runtime
    if isinstance(value.get('episode_run_time'),list):
        times=[v for v in value['episode_run_time'] if isinstance(v,int) and 0<v<=1000]
        if times:out['runtime']=times[0]
    pop=value.get('popularity')
    if isinstance(pop,(int,float)) and 0<=pop<=100000:out['popularity']=round(pop,2)
    poster=value.get('poster_path')
    if isinstance(poster,str) and re.fullmatch(r'/[A-Za-z0-9/_-]+\.(?:jpg|png|webp)',poster):
        out['poster_path']=poster
    return out


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
        if any(k not in ('genre','page','sort','sort_by','year','search','query','q','with_genres','primary_release_year','first_air_date_year') for k in params):
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
                key=(r['type'],r['id'])
                enriched=public_metadata(r,value)
                result[key]=choose(result.get(key),enriched) if 'choose' in globals() else enriched
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
    """Browse distinct catalog slices rather than recrawling a few front-page rows.

    These are *queries against FrameXTV itself*, never guessed playable media IDs.
    URLs that it ignores simply return duplicates, which are deduplicated by ID.
    """
    urls = [BASE+'/movies',BASE+'/tv']
    urls += [f'{BASE}/movies?genre={g}' for g in MOVIE_GENRES]
    urls += [f'{BASE}/tv?genre={g}' for g in TV_GENRES]
    urls += [f'{BASE}/{kind}?page={page}' for kind in ('movies','tv') for page in range(2,12)]
    # Some websites paginate their browse page *within* genre filters.
    urls += [f'{BASE}/movies?genre={g}&page={n}' for g in MOVIE_GENRES for n in (2,3,4)]
    urls += [f'{BASE}/tv?genre={g}&page={n}' for g in TV_GENRES for n in (2,3,4)]
    # Partition older and current titles by year where the website supports it.
    urls += [f'{BASE}/{kind}?year={year}' for kind in ('movies','tv')
             for year in range(datetime.now(timezone.utc).year,1974,-1)]
    # Alphabetical search is a supplemental way to visit *listed* titles.
    # The search parameters are tried conservatively because sites differ.
    for kind in ('movies','tv'):
        for key in ('search','query','q'):
            for letter in 'abcdefghijklmnopqrstuvwxyz':
                urls.append(f'{BASE}/{kind}?{key}={letter}')
    return list(dict.fromkeys(urls))


def load_progress():
    if PROGRESS.exists():
        try:
            state=json.loads(PROGRESS.read_text(encoding='utf-8'))
            if state.get('schema')==1 and isinstance(state.get('pending'),list) and state['pending']:
                pending=[u for u in state['pending'] if isinstance(u,str) and u.startswith(BASE+'/')]
                visited=set(u for u in state.get('visited',[]) if isinstance(u,str) and u.startswith(BASE+'/'))
                if pending:
                    return pending,visited
        except (ValueError,TypeError,OSError):
            pass
    return seed_pages(),set()


def save_progress(queue,visited):
    # A complete pass starts afresh on the next scheduled refresh so new titles can appear.
    pending=list(queue)
    if not pending:
        pending=seed_pages()
        visited=set()
    state={'schema':1,'updated_at':datetime.now(timezone.utc).isoformat(),
           'visited_count':len(visited),'remaining_count':len(pending),
           'visited':sorted(visited),'pending':pending[:MAX_PENDING]}
    PROGRESS.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8')


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
    if current is None:return new
    old_placeholder=current['title'].startswith(('Movie ','Series '))
    new_placeholder=new['title'].startswith(('Movie ','Series '))
    result=dict(new if old_placeholder and not new_placeholder else current)
    # A newer crawl may discover structured metadata where an earlier page
    # exposed only an anchor title; don't discard those public attributes.
    for field in ('genre_ids','release_date','runtime','popularity','poster_path'):
        if field not in result and field in new:result[field]=new[field]
        if field not in result and field in current:result[field]=current[field]
    return result


def main():
    existing=json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'items':[]}
    known={(x['type'],int(x['id'])):x for x in existing.get('items',[])
           if x.get('type') in ('movie','tv') and str(x.get('id','')).isdigit()}
    scheduled,visited=load_progress()
    queue=deque(scheduled)
    queued=set(queue)|visited
    found={}
    working=0
    pages_this_run=0
    browser=None
    used_browser=False
    try:
        while queue and pages_this_run<MAX_PAGES and len(found)<MAX_TITLES:
            url=queue.popleft()
            if url in visited:continue
            visited.add(url)
            pages_this_run+=1
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
                if link not in queued and len(queued)<MAX_PENDING:
                    queue.append(link); queued.add(link)
            # Be considerate of the site's traffic: a small gap between pages.
            if browser is None: time.sleep(.18)
    finally:
        if browser is not None:
            browser.close()
    print(f'Scanned {pages_this_run} new FrameXTV browse URLs; {working} pages with titles; '
          f'{len(found)} seen this pass; {len(known)} previously collected; '
          f'{len(queue)} pages remaining; browser fallback={used_browser}')
    # Track the next browse pages even when the site blocks this particular run.
    save_progress(queue,visited)
    if not found or working==0:
        print('No new listings this pass. Existing catalog retained; later runs resume remaining browse pages.')
        return
    # Build a cumulative collection of links observed at least once on FrameXTV.
    # A blocked browse page must not erase existing VHS shelves or local saved lists.
    for k,v in known.items():
        found[k]=choose(found.get(k),v)
    result={'schema':1,'version':datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            'source':'FrameXTV public browse links collected over multiple passes; video not tested',
            'items':sorted(found.values(),key=lambda x:(x['type'],x['title'].casefold(),x['id']))}
    if len(found)>MAX_TITLES:
        result['items']=result['items'][:MAX_TITLES]
    if result['items']==existing.get('items'):
        print('No new titles on this pass; continuing discovery on next run')
        return
    OUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('Updated cumulative public catalog:',len(result['items']),'titles')

if __name__=='__main__':
    main()
