#!/usr/bin/env python3
"""Collect publicly linked FrameXTV /movie/{id} and /tv/{id} titles.

This is a *listing* collector, NOT a streaming quality check. It never opens
embed URLs or calls video/CDN providers. Failures retain the last published list.
"""
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
import html
import json
import re
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'framextv-catalog.json'
URLS=[
 'https://framextv.cc/movies', 'https://framextv.cc/tv',
 'https://framextv.cc/movies?genre=878',
 'https://framextv.cc/movies?genre=28',
 'https://framextv.cc/movies?genre=16',
 'https://framextv.cc/tv?genre=18',
 'https://framextv.cc/tv?genre=10765',
]
LINK=re.compile(r'^/(movie|tv)/(\d{1,9})(?:[/?#]|$)')
class LinkParser(HTMLParser):
 def __init__(self):super().__init__();self.entries=[];self.active=None;self.depth=0
 def handle_starttag(self,tag,attrs):
  at=dict(attrs)
  if tag=='a':
   if self.active is not None:self.depth+=1
   else:
    href=html.unescape(at.get('href',''))
    # Only accept links published by the site; no constructed links are scanned.
    m=LINK.match(href)
    if m:
     self.active={'type':m.group(1),'id':int(m.group(2)),'title':'','fallback':at.get('aria-label','') or at.get('title','')}
     self.depth=1
  elif self.active and tag=='img' and not self.active['fallback']:
   self.active['fallback']=at.get('alt','')
 def handle_data(self,data):
  if self.active is not None:
   self.active['title']+=data.strip()+' '
 def handle_endtag(self,tag):
  if tag=='a' and self.active:
   self.depth-=1
   if self.depth<=0:
    self.entries.append(self.active)
    self.active=None;self.depth=0

def clean_title(s):
 s=html.unescape(re.sub(r'\s+',' ',s or '')).strip()
 # Card text can include rating, year, and movie badges; prefer the image alt.
 s=re.sub(r'^(?:MOVIE|TV|SERIES|Film|★\s*[\d.]+)\s*', '',s,flags=re.I)
 s=re.sub(r'\s+\b(?:19|20)\d\d\s*(?:Film|Series)?\s*$', '',s,flags=re.I)
 return s[:170].strip()

def read_url(url):
 req=urllib.request.Request(url,headers={'User-Agent':'FrameLoungeCatalog/1.0 (+noncommercial personal app)','Accept':'text/html'})
 with urllib.request.urlopen(req,timeout=25) as res:
  if int(res.status)!=200:raise RuntimeError(f'HTTP {res.status}')
  data=res.read(4_000_000)
  return data.decode('utf-8','replace')

def main():
 existing=json.loads(OUT.read_text()) if OUT.exists() else {'items':[]}
 known={(v['type'],int(v['id'])):v for v in existing.get('items',[]) if v.get('type') in ('movie','tv') and str(v.get('id','')).isdigit()}
 found={}; good=0
 for url in URLS:
  try:
   source=read_url(url)
   parser=LinkParser();parser.feed(source)
   count=0
   for e in parser.entries:
    k=(e['type'],e['id']);old=known.get(k,{})
    title=clean_title(e['fallback']) or clean_title(e['title']) or old.get('title','')
    if not title: title=f'{"Movie" if e["type"]=="movie" else "Series"} {e["id"]}'
    # Prefer known-quality title text if fallback was an image's "poster" alt.
    if title.lower() in ('poster','no poster','image') and old.get('title'):title=old['title']
    found[k]={'type':e['type'],'id':e['id'],'title':title}
    count+=1
   if count:good+=1
   print(url,':',count,'listed links')
  except Exception as exc:print(url,': unavailable:',str(exc)[:200])
 # Avoid empty/captive portal or site layout changes silently erasing users' catalog.
 if good==0 or len(found)<10:
  raise SystemExit('No trustworthy listings fetched: keeping the previous catalog JSON unchanged.')
 if len(found) < len(known)//3:
  raise SystemExit('Suspicious listing shrinkage: refusing to overwrite last known catalog.')
 # Keep a known title when a new listing link has no readable title.
 for k,v in found.items():
  if v['title'].startswith(('Movie ','Series ')) and k in known:v['title']=known[k]['title']
 result={'schema':1,'version':datetime.now(timezone.utc).strftime('%Y-%m-%d'),'source':'FrameXTV public page links; presumed playable, NOT verified','items':sorted(found.values(),key=lambda x:(x['type'],x['id']))}
 if existing.get('items')==result['items']:
  print('No listings changed');return
 OUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
 print('Published',len(result['items']),'listed titles')
if __name__=='__main__':main()
