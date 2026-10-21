/* Frame Lounge — personal Fire OS media browser. No content is hosted, copied, or proxied by this app. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const app = $('#app');
  const STORE = 'frameLounge.v1.';
  const getStore = (k, d) => { try { const s = localStorage.getItem(STORE + k); return s === null ? d : JSON.parse(s); } catch (_) { return d; } };
  const saveStore = (k, v) => { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (_) {} };
  // The user's TMDB credential is entered on their Fire TV, saved only in WebView local storage.
  // No TMDB credential is ever compiled into the publicly built APK.
  const html = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const urlText = s => encodeURIComponent(String(s));
  const yearOf = s => s ? String(s).slice(0, 4) : '';
  const nowYear = new Date().getFullYear();
  const defaultConfigUrl = 'https://raw.githubusercontent.com/ShinyShinChan/FrameLounge-FireTV/main/remote-config.json';
  const frameCatalogUrl = 'https://raw.githubusercontent.com/ShinyShinChan/FrameLounge-FireTV/main/framextv-catalog.json';
  const builtInConfig = {
    schema: 1, version: '1.0.0', defaultSource: 'framextv.xyz',
    sources: [
      {id:'framextv.xyz',label:'FrameXTV · Primary',origin:'https://framextv.xyz',movie:'/embed/{id}',tv:'/embed/{id}/{season}/{episode}'},
      {id:'framextv.cc',label:'FrameXTV · Mirror',origin:'https://framextv.cc',movie:'/embed/{id}',tv:'/embed/{id}/{season}/{episode}'}
    ]
  };
  // Only accept absolute HTTPS origins and strictly constrained embed templates.
  function validateConfig(data) {
    if(!data || data.schema!==1 || !Array.isArray(data.sources) || !data.sources.length || data.sources.length>12) throw new Error('Invalid configuration version');
    const sources = data.sources.map(x=>{
      const u = new URL(String(x.origin||''));
      if(u.protocol!=='https:' || u.username || u.password || u.port || u.pathname!=='/' || u.search || u.hash ||
         !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(u.hostname) ||
         /(?:^|\.)(?:localhost|local|test|invalid)$/.test(u.hostname)) throw new Error('Unsafe source origin');
      const id=String(x.id||'').trim(),label=String(x.label||'').trim(),movie=String(x.movie||''),tv=String(x.tv||'');
      if(!/^[a-z0-9.-]{3,90}$/.test(id) || !label || label.length>70 ||
         !/^\/[a-zA-Z0-9._/{}/-]{1,170}$/.test(movie) || !movie.includes('{id}') ||
         !/^\/[a-zA-Z0-9._/{}/-]{1,170}$/.test(tv) ||
         !['{id}','{season}','{episode}'].every(t=>tv.includes(t))) throw new Error('Invalid source template');
      return {id,label,origin:u.origin,movie,tv};
    });
    if(new Set(sources.map(x=>x.id)).size!==sources.length)throw new Error('Duplicate source IDs');
    const defaultSource=sources.find(x=>x.id===data.defaultSource)?data.defaultSource:sources[0].id;
    return {schema:1,version:String(data.version||'').slice(0,25),defaultSource,sources};
  }
  // The published FrameXTV title listings, NOT playback tests, decide which tapes appear.
  // TMDB provides enrichment, but it must not add unlisted movies to the shelves or search.
  function validFrameCatalog(data) {
    if(!data || data.schema!==1 || !Array.isArray(data.items) || data.items.length>8000) throw new Error('Invalid FrameXTV catalog');
    const seen=new Set(), items=[];
    for(const r of data.items) {
      const type=String(r.type||''), id=Number(r.id), title=String(r.title||'').trim();
      if(!['movie','tv'].includes(type) || !Number.isSafeInteger(id) || id<=0 || id>999999999 || title.length<1 || title.length>170) continue;
      const k=type+':'+id;
      if(seen.has(k))continue;seen.add(k);
      const ids=Array.isArray(r.genre_ids)?r.genre_ids:[];
      items.push({type,id,title,year:String(r.year||(r.release_date||r.first_air_date||'').slice(0,4)).slice(0,4),
        genre:type==='tv'?'Series':'Movie',genreIds:ids.filter(n=>Number.isInteger(n)&&n>0&&n<100000).slice(0,10),
        releaseDate:String(r.release_date||r.first_air_date||'').slice(0,10),
        runtime:Number(r.runtime)||0,popularity:Number(r.popularity)||0,
        poster:/^\/[a-zA-Z0-9/_-]+\.(jpg|png|webp)$/.test(r.poster_path||'')?r.poster_path:null,
        backdrop:null,overview:'',rating:null,demo:false});
    }
    if(items.length===0) throw new Error('No listed FrameXTV titles in feed');
    return {schema:1,version:String(data.version||'unknown').slice(0,60),items};
  }
  const starterFrameCatalog=validFrameCatalog(
{"schema":1,"version":"2026-10-20-starter","source":"FrameXTV publicly listed titles (starter snapshot; not stream-tested)","items":[{"type":"movie","id":1153576,"title":"Street Fighter"},{"type":"movie","id":1148365,"title":"Matchbox the Movie"},{"type":"movie","id":1561726,"title":"Masterplan"},{"type":"movie","id":1108427,"title":"Moana"},{"type":"movie","id":1765072,"title":"You Can See Everything"},{"type":"movie","id":1101412,"title":"Fall 2: Deadpoint"},{"type":"movie","id":299536,"title":"Avengers: Infinity War"},{"type":"movie","id":299534,"title":"Avengers: Endgame"},{"type":"movie","id":157336,"title":"Interstellar"},{"type":"movie","id":24428,"title":"The Avengers"},{"type":"tv","id":1396,"title":"Breaking Bad"},{"type":"tv","id":456,"title":"The Simpsons"},{"type":"tv","id":1399,"title":"Game of Thrones"},{"type":"tv","id":1402,"title":"The Walking Dead"},{"type":"tv","id":2316,"title":"The Office"},{"type":"tv","id":66732,"title":"Stranger Things"},{"type":"tv","id":94997,"title":"House of the Dragon"},{"type":"tv","id":1434,"title":"Family Guy"}]}  );
  let cachedFrameCatalog;
  try {cachedFrameCatalog=validFrameCatalog(getStore('frameCatalog',null));}catch(_) {cachedFrameCatalog=starterFrameCatalog;}
  const cachedRemote = getStore('remoteConfig', null);
  let startingConfig = builtInConfig;
  try { if(cachedRemote) startingConfig=validateConfig(cachedRemote); } catch(_) {}

  const seed = (kind, values) => values.map(([id,title,year,genre,overview]) => ({ id, type: kind, title, year:String(year), genre, overview, poster:null, backdrop:null, rating:null, demo:true }));
  const movieSeed = seed('movie', [
    [550,'Fight Club',1999,'Thriller','An insomniac and an enigmatic stranger create an underground club.'],
    [603,'The Matrix',1999,'Sci-Fi','A hacker discovers that reality is far stranger than it appears.'],
    [27205,'Inception',2010,'Sci-Fi','A skilled thief enters dreams to plant an impossible idea.'],
    [157336,'Interstellar',2014,'Sci-Fi','Explorers venture through a wormhole in search of humanity’s future.'],
    [155,'The Dark Knight',2008,'Action','Batman faces a criminal mastermind who tests Gotham’s limits.'],
    [11,'Star Wars',1977,'Adventure','A farm boy is swept into an interstellar struggle.'],
    [1891,'The Empire Strikes Back',1980,'Adventure','The rebellion faces a renewed threat from the Galactic Empire.'],
    [1892,'Return of the Jedi',1983,'Adventure','A final confrontation will decide the fate of the galaxy.'],
    [120,'The Lord of the Rings: The Fellowship of the Ring',2001,'Fantasy','A fellowship sets out to destroy a powerful ring.'],
    [121,'The Lord of the Rings: The Two Towers',2002,'Fantasy','Separated allies confront darkness across Middle-earth.'],
    [122,'The Lord of the Rings: The Return of the King',2003,'Fantasy','The armies of Middle-earth unite for a final stand.'],
    [862,'Toy Story',1995,'Animation','A group of toys comes to life when people are not looking.'],
    [12,'Finding Nemo',2003,'Animation','A father crosses the ocean searching for his son.'],
    [13,'Forrest Gump',1994,'Drama','A kindhearted man witnesses extraordinary moments in history.'],
    [680,'Pulp Fiction',1994,'Crime','Interwoven stories explore crime and chance in Los Angeles.'],
    [238,'The Godfather',1972,'Crime','A powerful family struggles with succession and loyalty.'],
    [24428,'The Avengers',2012,'Action','A team of heroes assembles to protect Earth.'],
    [299534,'Avengers: Endgame',2019,'Action','The surviving heroes attempt to undo a devastating loss.'],
    [299536,'Avengers: Infinity War',2018,'Action','Heroes unite against a threat to the universe.'],
    [76341,'Mad Max: Fury Road',2015,'Action','A desert escape turns into a high-speed struggle for freedom.'],
    [346698,'Barbie',2023,'Comedy','A journey beyond a perfect world changes everything.'],
    [872585,'Oppenheimer',2023,'Drama','The story of the physicist behind the atomic bomb.'],
    [438631,'Dune',2021,'Sci-Fi','An heir faces a dangerous destiny on a desert planet.'],
    [693134,'Dune: Part Two',2024,'Sci-Fi','A young leader confronts prophecy and political power.'],
    [569094,'Spider-Man: Across the Spider-Verse',2023,'Animation','Miles Morales ventures into a multiverse of Spider-People.'],
    [324857,'Spider-Man: Into the Spider-Verse',2018,'Animation','A teenager discovers an extraordinary multiverse.'],
    [496243,'Parasite',2019,'Thriller','Two families become entangled in unexpected ways.'],
    [98,'Gladiator',2000,'Action','A fallen general fights his way through the arena.'],
    [129,'Spirited Away',2001,'Animation','A girl enters a mysterious realm of spirits.'],
    [508442,'Soul',2020,'Animation','A musician discovers the meaning of a life well lived.']
  ]);
  const showSeed = seed('tv', [
    [1399,'Game of Thrones',2011,'Fantasy','Powerful families compete for control of the Seven Kingdoms.'],
    [1396,'Breaking Bad',2008,'Crime','A chemistry teacher enters a dangerous criminal world.'],
    [66732,'Stranger Things',2016,'Sci-Fi','Unusual events unsettle a small American town.'],
    [94997,'House of the Dragon',2022,'Fantasy','A royal dynasty faces succession and rivalry.'],
    [82856,'The Mandalorian',2019,'Sci-Fi','A lone bounty hunter travels the outer reaches of the galaxy.'],
    [1434,'Family Guy',1999,'Animation','A chaotic family stumbles through life in Quahog.'],
    [1418,'The Big Bang Theory',2007,'Comedy','A group of friends navigates science and everyday life.'],
    [60059,'Better Call Saul',2015,'Crime','An aspiring lawyer transforms his career and identity.'],
    [76479,'The Boys',2019,'Action','A group challenges a world of corrupt superheroes.'],
    [63174,'Lucifer',2016,'Fantasy','A charming devil finds himself solving crimes.'],
    [85271,'WandaVision',2021,'Sci-Fi','Two unusual neighbors find cracks in their idyllic life.'],
    [100088,'The Last of Us',2023,'Drama','Survivors cross a transformed and dangerous America.'],
    [71912,'The Witcher',2019,'Fantasy','A monster hunter navigates destiny and shifting alliances.'],
    [94605,'Arcane',2021,'Animation','Two sisters are torn apart by conflict and invention.'],
    [2316,'The Office',2005,'Comedy','A documentary crew follows office life in Scranton.'],
    [456,'The Simpsons',1989,'Animation','An animated family faces the absurdities of modern life.'],
    [1402,'The Walking Dead',2010,'Horror','Survivors struggle to rebuild a life in a broken world.'],
    [71663,'Invincible',2021,'Animation','A teenager discovers what being a superhero really means.']
  ]);
  const library = new Map([...movieSeed, ...showSeed].map(x => [x.type + ':' + x.id, x]));
  // Keep a small, device-local snapshot of each saved TMDB title. Without this,
  // saved IDs outside the starter catalog would show a blank shelf while offline.
  const cachedShelfItems = getStore('savedShelfItems', {});
  if(cachedShelfItems && typeof cachedShelfItems === 'object' && !Array.isArray(cachedShelfItems)) {
    for(const [k,v] of Object.entries(cachedShelfItems)) {
      if(!/^(movie|tv):[0-9]{1,12}$/.test(k) || !v || !Number.isSafeInteger(Number(v.id)) || k!==v.type+':'+v.id) continue;
      const old=library.get(k);
      library.set(k,{...(old||{}), ...v});
    }
  }
  // FRAME_LOUNGE_FAST_SHELVES_V2 — small persistent TMDB cache; no secrets in the catalog.
  const metadataCache=getStore('titleMetadataV2',{});
  let metadataSaveTimer=null;
  function saveMetadataSoon(){
    clearTimeout(metadataSaveTimer);
    metadataSaveTimer=setTimeout(()=>{
      const entries=Object.entries(metadataCache).slice(-2600);
      saveStore('titleMetadataV2',Object.fromEntries(entries));
    },1800);
  }
  function persistShelfItems() {
    // Only store title metadata for selected items, not all TMDB results or credentials.
    const keys=[...new Set([...state.favorites,...state.likes,...state.dislikes])].slice(0,600);
    const items={};
    for(const k of keys) {
      const t=library.get(k);
      if(!t)continue;
      const {id,type,title,year,genre,overview,poster,backdrop,rating,seasonCount}=t;
      items[k]={id,type,title,year,genre,overview,poster,backdrop,rating,seasonCount};
    }
    saveStore('savedShelfItems',items);
  }

  const state = {
    route:'home', detail:null, playing:null, currentSeason:1,
    episodes:null, seasonLoading:false, search:'', searchResults:null,
    key:getStore('tmdbKey',''), domain:getStore('playerDomain','') || startingConfig.defaultSource,
    config:startingConfig, configUrl:getStore('configUrl',defaultConfigUrl), configChecked:getStore('configChecked',0), configStatus:'Using saved player settings',
    favorites:getStore('favorites',[]), likes:getStore('likes',[]), dislikes:getStore('dislikes',[]), history:getStore('history',[]),
    rows:null, loading:false, message:null, lastFocus:null, customSource:getStore('customSource',''),
    filterLetter:'All',filterGenre:'All',filterRuntime:'All',
    trendingKeys:getStore('trendingKeysV2',[]),
    frameCatalog:cachedFrameCatalog, allowedKeys:new Set(cachedFrameCatalog.items.map(x=>x.type+':'+x.id)),
    catalogStatus:'Using saved FrameXTV title list', catalogChecked:0
  };
  // Prefer cached enriched TMDB art when a listed title has already been saved.
  function mergeFeedTitles(feed) {
    for(const entry of feed.items) {
      const k=entry.type+':'+entry.id;
      const prior=library.get(k);
      const enriched=metadataCache[k];
      // Fresh published listing must retain source title and ID; TMDB cache supplies optional artwork and genres.
      library.set(k,{...entry,...(prior||{}),...(enriched||{}),id:entry.id,type:entry.type,
        title:enriched?.title||entry.title,
        genreIds:enriched?.genreIds?.length?enriched.genreIds:(entry.genreIds||prior?.genreIds||[]),
        poster:enriched?.poster||entry.poster||prior?.poster||null,
        releaseDate:enriched?.releaseDate||entry.releaseDate||prior?.releaseDate||'',
        runtime:enriched?.runtime||entry.runtime||prior?.runtime||0,
        popularity:enriched?.popularity||entry.popularity||prior?.popularity||0});
    }
  }
  mergeFeedTitles(state.frameCatalog);
  function isListed(t) {return !!t && state.allowedKeys.has(keyOf(t));}
  function listedTitles(type) {
    return state.frameCatalog.items.filter(t=>!type || t.type===type).map(x=>library.get(keyOf(x))).filter(Boolean);
  }
  async function refreshFrameCatalog(force=false) {
    // This checks only if a title link appears in FrameXTV's published pages.
    // There are deliberately no per-title HEAD requests, streams probes, or player health checks.
    if(!force && Date.now()-state.catalogChecked<6*60*60*1000) return;
    state.catalogChecked=Date.now();
    try {
      const res=await fetch(frameCatalogUrl+(frameCatalogUrl.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const feed=validFrameCatalog(await res.json());
      state.frameCatalog=feed;state.allowedKeys=new Set(feed.items.map(x=>keyOf(x)));
      mergeFeedTitles(feed);saveStore('frameCatalog',{schema:1,version:feed.version,items:feed.items});
      state.catalogStatus='FrameXTV listed-title feed updated: '+feed.version;
      if(force)showMessage('FrameXTV listings refreshed. No stream testing needed.');
      if(!state.playing && !state.detail)render(document.activeElement?.dataset?.focus);
      if(state.key)setTimeout(enrichListedPosters,2000);
    }catch(err){
      state.catalogStatus='Using saved FrameXTV listings ('+String(err.message||'network error').slice(0,60)+')';
      if(force)showMessage('Could not refresh listings. Saved tapes remain available.');
    }
  }
  // Load artwork only for important/visible tapes, and remember it between launches.
  // Never render or fetch all 1,000+ tapes at once on a small Fire TV Stick.
  let enriching=false, enrichmentStarted=false;
  let lastRemoteActivity=Date.now(), metadataRenderTimer=null;
  function scheduleMetadataRender(){
    clearTimeout(metadataRenderTimer);
    metadataRenderTimer=setTimeout(()=>{
      if(state.playing||state.detail||!['home','movies','series'].includes(state.route))return;
      if(Date.now()-lastRemoteActivity<2500){scheduleMetadataRender();return;}
      render(document.activeElement?.dataset?.focus);
    },2400);
  }
  const KIDS_CLASSIC_TITLES=[
    'matilda','hook','stuart little','the little vampire','home alone','the lion king',
    'the goonies','hocus pocus','the sandlot','the parent trap','casper',
    'the princess bride','a little princess','babe','free willy','the secret garden',
    'honey, i shrunk the kids','the pagemaster','aladdin','beauty and the beast',
    'toy story','the iron giant','a goofy movie','the mighty ducks',
    'the land before time','jumanji','the neverending story','flubber',
    'air bud','the little rascals','labyrinth','the little mermaid',
    '101 dalmatians','a bug\'s life','the borrowers'
  ];
  const KIDS_POPULAR_TITLES=[
    'inside out','frozen','moana','zootopia','encanto','coco', 'sonic the hedgehog',
    'despicable me','minions','kung fu panda','how to train your dragon','the super mario bros.',
    'the wild robot','the bad guys','the incredibles','finding nemo','toy story',
    'puss in boots','turning red','luca','elemental','the lion king'
  ];
  const GENRES=[['Action',28],['Comedy',35],['Adventure',12],['Sci-Fi',878],
    ['Fantasy',14],['Animation',16],['Family',10751],['Horror',27],
    ['Thriller',53],['Mystery',9648],['Drama',18],['Romance',10749],['Crime',80],['Documentary',99]];
  const TV_GENRES=[['Action & Adventure',10759],['Comedy',35],['Drama',18],
    ['Sci-Fi & Fantasy',10765],['Crime',80],['Animation',16],['Family',10751]];
  function genreMatch(t,name){
    if(name==='All')return true;
    const mapping=[...GENRES,...TV_GENRES].find(x=>x[0]===name);
    if(mapping && t.genreIds?.includes(mapping[1]))return true;
    const fallback=String(t.genre||'').toLowerCase();
    return fallback.split(/[·,/]/).some(piece=>piece.trim()===name.toLowerCase())||
           (name==='Sci-Fi'&&fallback.includes('science fiction'));
  }
  function classicKids(t){
    const title=t.title.toLowerCase().replace(/\s*\(\d{4}\)\s*$/,'').trim();
    return t.type==='movie' && KIDS_CLASSIC_TITLES.some(x=>title===x || title.startsWith(x+':') || title.startsWith(x+' '));
  }
  function popularKids(t){
    const title=t.title.toLowerCase();
    return t.type==='movie' && (genreMatch(t,'Family')||genreMatch(t,'Animation')||
      KIDS_POPULAR_TITLES.some(x=>title===x||title.startsWith(x+':')||title.startsWith(x+' ')));
  }
  function titleShuffleScore(t){
    // Stable deterministic backfill avoids alphabetic-order bias while TMDB metadata loads.
    const id=Number(t.id)||0;const week=Math.floor(Date.now()/604800000);
    return ((id*1103515245+week*2654435761)>>>0)%9973;
  }
  function score(t){
    const trend=state.trendingKeys.indexOf(keyOf(t));
    return (trend>=0 ? 20000-trend*125 : 0) +
      Math.log1p(Math.max(0,Number(t.popularity)||0))*100 +
      (Number(t.rating)||0)*9 + titleShuffleScore(t)/100;
  }
  function rank(titles){return titles.slice().sort((a,b)=>score(b)-score(a));}
  function modern(t){
    const date=t.releaseDate;
    if(!/^\d{4}-\d\d-\d\d$/.test(date||''))return false;
    const released=Date.parse(date+'T00:00:00Z');
    return Number.isFinite(released)&&released<=Date.now()&&released>Date.now()-730*86400000;
  }
  function runtimeBucket(t, bucket){
    if(bucket==='All')return true;
    const n=Number(t.runtime)||0;
    if(!n)return false;
    return bucket==='~20'?n<30:bucket==='~40'?n>=30&&n<50:
      bucket==='~60'?n>=50&&n<75:bucket==='~90'?n>=75&&n<120:
      bucket==='120+'?n>=120:false;
  }
  async function enrichListedPosters(){
    if(enriching || !state.key || state.playing)return;
    enriching=true;enrichmentStarted=true;
    try{
      const movies=listedTitles('movie'),series=listedTitles('tv');
      const featured=[...movies.filter(classicKids),...movies.filter(popularKids),
        ...(state.rows?.nowPlaying||[]).filter(isListed),...movies.filter(modern),
        ...rank(movies).slice(0,60),...rank(series).slice(0,32)];
      const all=[...featured,...movies.slice(0,14),...series.slice(0,8)];
      const seen=new Set();
      const pending=all.filter(t=>{const k=keyOf(t);if(seen.has(k)||
        (t.detailLoaded && t.metadataAt))return false;seen.add(k);return true;}).slice(0,90);
      let index=0,completed=0;
      await Promise.all(Array.from({length:2},async()=>{
        while(index<pending.length && state.key && !state.playing){
          const t=pending[index++];
          try{const info=await tmdb(`${t.type}/${t.id}?language=en-US`);
            if(isListed(t))mergeTitle(normalize(info,t.type));
          }catch(_){}
          completed++;
          if(completed%18===0)scheduleMetadataRender();
          await new Promise(resolve=>setTimeout(resolve,220));
        }
      }));
      saveMetadataSoon();
      scheduleMetadataRender();
    }finally{enriching=false;}
  }
  const icons = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    movies:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/>',
    series:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="m8 2 4 3 4-3M8 12h8M17 17h.01"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    list:'<path d="M6 3h12a1 1 0 0 1 1 1v18l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-1.9 1.9-.1-.1A1.7 1.7 0 0 0 16 18.4l-.7.4v2.1h-3v-2.1l-.8-.4a1.7 1.7 0 0 0-1.8.3l-.1.1-1.9-1.9.1-.1A1.7 1.7 0 0 0 8 15l-.4-.7H5.5v-3h2.1L8 10.5a1.7 1.7 0 0 0-.3-1.8l-.1-.1 1.9-1.9.1.1A1.7 1.7 0 0 0 11.5 7l.8-.4V4.5h3v2.1l.7.4a1.7 1.7 0 0 0 1.8-.3l.1-.1 1.9 1.9-.1.1a1.7 1.7 0 0 0-.3 1.8l.4.8h2.1v3h-2.1z" transform="translate(-2 -1) scale(1.02)"/>',
    play:'<path d="m8 5 12 7-12 7z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    check:'<path d="m4 12 5 5L20 6"/>',
    back:'<path d="m14 5-7 7 7 7M7 12h14"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    close:'<path d="M5 5 19 19M19 5 5 19"/>',
    keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h.01M11 13h.01M15 13h.01M6 16h12"/>',
    spark:'<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    like:'<path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3zM7 10l5-8a3 3 0 0 1 2 3v3h6a2 2 0 0 1 2 2l-1.1 9a2 2 0 0 1-2 2H7"/>',
    dislike:'<path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3zM7 14l5 8a3 3 0 0 0 2-3v-3h6a2 2 0 0 0 2-2l-1.1-9a2 2 0 0 0-2-2H7"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'
  };
  function icon(name, size=22) { return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.spark}</svg>`; }
  const keyOf = t => t.type + ':' + t.id;
  const unique = (arr, limit=24) => { const seen=new Set(); return arr.filter(t=> { const k=keyOf(t); if(seen.has(k))return false; seen.add(k); return true; }).slice(0,limit); };
  function normalize(x, kind) {
    const type=kind||x.media_type||(x.first_air_date?'tv':'movie');
    if(!['movie','tv'].includes(type))return null;
    const rawGenres=x.genre_ids||(Array.isArray(x.genres)?x.genres.map(y=>y.id):[]);
    const durations=type==='tv'?(x.episode_run_time||[]):[];
    const duration=type==='tv'?(durations.find(n=>n>0)||x.last_episode_to_air?.runtime||0):(x.runtime||0);
    return {id:x.id,type,title:x.title||x.name||'Untitled',
      year:yearOf(x.release_date||x.first_air_date),releaseDate:x.release_date||x.first_air_date||'',
      genre:x.genres?.map(y=>y.name).join(' · ')||(type==='tv'?'Series':'Movie'),
      genreIds:Array.isArray(rawGenres)?rawGenres.filter(n=>Number.isInteger(n)).slice(0,12):[],
      runtime:duration,popularity:Number(x.popularity)||0,voteCount:Number(x.vote_count)||0,
      overview:x.overview||'',poster:x.poster_path||null,backdrop:x.backdrop_path||null,
      rating:Number.isFinite(x.vote_average)?x.vote_average.toFixed(1):null,
      seasonCount:x.number_of_seasons||0,seasons:x.seasons||null,
      detailLoaded:('runtime' in x)||('number_of_seasons' in x)||Array.isArray(x.genres),
      metadataAt:Date.now(),demo:false};
  }
  function mergeTitle(t) {
    if(!t||!t.id)return null;
    const id=keyOf(t),old=library.get(id),next={...(old||{}),...t};
    library.set(id,next);
    if(t.metadataAt){
      const {type,id,title,year,releaseDate,genre,genreIds,runtime,popularity,
        voteCount,overview,poster,backdrop,rating,seasonCount,metadataAt,detailLoaded}=next;
      metadataCache[keyOf(t)]={type,id,title,year,releaseDate,genre,genreIds,runtime,popularity,
        voteCount,overview,poster,backdrop,rating,seasonCount,metadataAt,detailLoaded};
      saveMetadataSoon();
    }
    if(state.favorites.includes(id)||state.likes.includes(id)||state.dislikes.includes(id))persistShelfItems();
    return next;
  }
  function poster(t, size='w342') { return t.poster ? `https://image.tmdb.org/t/p/${size}/${t.poster.replace(/^\//,'')}` : ''; }
  function backdrop(t) { return t.backdrop ? `https://image.tmdb.org/t/p/w1280/${t.backdrop.replace(/^\//,'')}` : ''; }
  function paint(t) { const h=(Number(t.id)*47)%360; return `--shade1:hsl(${h} 39% 23%);--shade2:hsl(${(h+43)%360} 48% 11%)`; }
  function navItem(id,label,ic) { return `<button class="nav-item ${state.route===id?'selected':''}" data-action="route" data-route="${id}" data-focus="nav-${id}">${icon(ic,24)}<span>${label}</span></button>`; }
  function shell(content) {
    const unsavedApiKey = $('#api-key')?.value;
    const unsavedConfigUrl = $('#config-url')?.value;
    app.innerHTML = `<div class="layout">
      <aside class="sidebar">
        <div class="brand"><img class="brand-logo" src="frame-lounge-logo.png" alt="Frame Lounge TV"></div>
        <div class="sidebar-heading">DISCOVER</div>
        <nav class="nav">
          ${navItem('home','Home','home')}${navItem('movies','Movies','movies')}${navItem('series','Series','series')}
          ${navItem('search','Search','search')}${navItem('mylist','My Shelf','list')}
        </nav>
        <div class="sidebar-bottom">${navItem('settings','Settings','settings')}
          <div class="source-stamp"><span class="online-dot"></span> ${state.key ? 'TMDB CONNECTED' : state.frameCatalog.items.length+' LISTED TITLES'}</div>
        </div>
      </aside>
      <main class="main"><div class="main-inner">${content}</div></main>
      <div id="overlay-root"></div>
      ${state.message ? `<div class="toast" role="status">${html(state.message)}</div>` : ''}
      <div class="remote-help">${icon('keyboard',16)} Use ▲ ▼ to change VHS shelves • ◀ ▶ to move across tapes • Select to open</div>
    </div>`;
    // Preserve in-progress form entries across asynchronous catalog/source refreshes.
    if(unsavedApiKey!==undefined && $('#api-key'))$('#api-key').value=unsavedApiKey;
    if(unsavedConfigUrl!==undefined && $('#config-url'))$('#config-url').value=unsavedConfigUrl;
    if (state.playing) drawPlayer();
  }
  function focusByKey(key) {
    if (!key) return false;
    const match = $$('[data-focus]').find(el=>el.dataset.focus===key);
    if (!match) return false;
    match.focus({preventScroll:true});
    match.scrollIntoView({block:'nearest',inline:'nearest'});
    return true;
  }
  function focusDefault(key) {
    requestAnimationFrame(() => {
      if (!focusByKey(key || state.lastFocus)) {
        const prefer = state.route==='settings'?'api-key':state.route==='search'?'search-input':state.detail?'detail-play':'hero-play';
        if (!focusByKey(prefer)) ($('[data-focus]')||{}).focus?.();
      }
    });
  }
  function rememberFocus() { const el=document.activeElement; if (el?.dataset?.focus) state.lastFocus=el.dataset.focus; }
  function header(eyebrow,title,description) { return `<div class="screen-intro"><p class="eyebrow">${html(eyebrow)}</p><h1>${html(title)}</h1>${description?`<p>${html(description)}</p>`:''}</div>`; }
  // A 3D-inspired VHS rental sleeve. Poster art is the front; the vertical spine carries the title.
  // The same tape art is reused in browse rows and on the full details screen.
  function tapeArt(t, large=false) {
    const img=poster(t,large?'w342':'w185');
    const key=keyOf(t);
    const reaction=state.likes.includes(key)?'LIKE':state.dislikes.includes(key)?'DISLIKE':'';
    const saved=state.favorites.includes(key);
    return `<span class="vhs-case ${large?'vhs-case-large':''}" style="${paint(t)}">
      <span class="vhs-spine" aria-hidden="true"><span class="vhs-spine-brand">FRAME LOUNGE</span><span class="vhs-spine-title">${html(t.title)}</span><span class="vhs-spine-number">${html(t.year||'VHS')}</span></span>
      <span class="vhs-cover">
        <span class="poster-art" style="${paint(t)}">
          ${img?`<img loading="lazy" src="${html(img)}" alt="" onerror="this.style.display='none'">`:''}
          <span class="poster-sky"></span>
          <span class="poster-letter">${html(t.title.slice(0,1).toUpperCase())}</span>
          <span class="poster-title-art">${html(t.title)}</span>
        </span>
        <span class="vhs-header-sticker">HOME VIDEO</span>
        <span class="vhs-bottom-strip"><span>VHS</span><span>${html(t.year|| (t.type==='tv'?'SERIES':'FILM'))}</span></span>
        ${saved?`<span class="vhs-tag">WATCH LATER</span>`:''}
        ${reaction?`<span class="vhs-reaction ${reaction==='LIKE'?'is-liked':'is-disliked'}">${reaction==='LIKE'?'♥':'−'}</span>`:''}
      </span>
    </span>`;
  }
  // FRAME_LOUNGE_COMPACT_PAGES_V2_1 — only focused shelf + two below mount cards.
  // Offscreen headers remain navigable while their posters are removed from the DOM.
  const shelfData=new Map(), shelfTitles=new Map();
  const shelfOrder=[];
  const SHELF_BATCH=16, FULL_PAGE_SIZE=50;
  let activeShelfIndex=0, windowedShelves=false, shelfPage=null;
  function card(t,i=0,shelfId='catalog'){
    const img=poster(t,'w185');
    return `<button class="poster-card vhs-card fast-tape" data-action="detail" data-type="${t.type}" data-id="${t.id}"
      data-focus="title-${html(shelfId)}-${i}-${keyOf(t)}" aria-label="Open ${html(t.title)} details">
      <span class="fast-case" style="${paint(t)}">
        <span class="fast-spine" aria-hidden="true">VHS · ${html(t.year||'TV')}</span>
        <span class="fast-cover">${img?`<img loading="lazy" decoding="async" src="${html(img)}" alt="" onerror="this.style.display='none'">`:''}
          <span class="fast-cover-letter">${html(t.title.slice(0,1).toUpperCase())}</span></span>
      </span>
      <span class="fast-caption"><strong>${html(t.title)}</strong><small>${html(t.year)}${t.runtime?` · ${t.runtime}m`:''}</small></span>
    </button>`;
  }
  function shelfCards(id){
    const items=shelfData.get(id)||[];
    return items.slice(0,SHELF_BATCH).map((t,i)=>card(t,i,id)).join('')+
      (items.length>SHELF_BATCH?moreButton(id,items.length):'');
  }
  function moreButton(id,total){
    return `<button class="vhs-card fast-more" data-action="more-shelf" data-shelf="${html(id)}"
       data-focus="more-${html(id)}" aria-label="Browse all ${total} titles in this shelf">
       <span>▤</span><strong>Browse All</strong><small>${total} titles · 50/page</small></button>`;
  }
  function row(title,items,id=''){
    const listed=unique((items||[]).filter(isListed),8000);
    const shelfId=String(id||title);
    if(!listed.length){
      if(title.startsWith('Recently Released'))return `<section class="catalog-row fast-row"><div class="row-heading"><h2>${html(title)}</h2></div><div class="fast-info">Release dates will appear here when FrameXTV/TMDB metadata becomes available.</div></section>`;
      return '';
    }
    shelfData.set(shelfId,listed);shelfTitles.set(shelfId,title);
    let mount=true,index=-1;
    if(windowedShelves){
      index=shelfOrder.length;shelfOrder.push(shelfId);
      mount=index>=activeShelfIndex && index<=activeShelfIndex+2;
    }
    return `<section class="catalog-row fast-row" data-shelf="${html(shelfId)}" data-shelf-index="${index}">
      <div class="row-heading"><h2>${html(title)}</h2><span class="row-count">${listed.length} tapes</span></div>
      <div class="carousel-row" data-row="${html(shelfId)}">${mount?shelfCards(shelfId):''}</div>
    </section>`;
  }
  function mountShelfWindow(newIndex){
    if(!windowedShelves || !shelfOrder.length)return;
    activeShelfIndex=Math.max(0,Math.min(shelfOrder.length-1,newIndex));
    const mounted=new Set(shelfOrder.slice(activeShelfIndex,activeShelfIndex+3));
    for(const id of shelfOrder){
      const strip=$$('.carousel-row').find(el=>el.dataset.row===id);
      if(!strip)continue;
      if(mounted.has(id)){
        if(!strip.querySelector('.vhs-card'))strip.innerHTML=shelfCards(id);
      }else if(strip.children.length){
        // Three active shelves only: the prior shelf is remounted before Up navigation.
        strip.replaceChildren();
      }
    }
  }
  function showShelfPage(id,pageNumber=0){
    const items=shelfData.get(id);
    if(!items?.length)return;
    const lastPage=Math.max(0,Math.ceil(items.length/FULL_PAGE_SIZE)-1);
    shelfPage={id,page:Math.max(0,Math.min(pageNumber,lastPage))};
    render('page-close');
  }
  function shelfPageScreen(){
    const id=shelfPage?.id,items=shelfData.get(id)||[];
    const title=shelfTitles.get(id)||'VHS Collection';
    const total=Math.max(1,Math.ceil(items.length/FULL_PAGE_SIZE));
    shelfPage.page=Math.max(0,Math.min(total-1,shelfPage.page));
    const first=shelfPage.page*FULL_PAGE_SIZE;
    const visible=items.slice(first,first+FULL_PAGE_SIZE);
    const nav=(bottom=false)=>`<div class="page-toolbar ${bottom?'page-toolbar-bottom':''}">
      <button class="action-button secondary small" data-action="close-shelf-page" data-focus="${bottom?'page-close-bottom':'page-close'}">← Back to Shelves</button>
      <button class="action-button secondary small" data-action="prev-shelf-page" data-focus="${bottom?'page-prev-bottom':'page-prev'}" ${shelfPage.page===0?'disabled':''}>◀ Previous</button>
      <span class="page-indicator">Page ${shelfPage.page+1} of ${total} · ${first+1}–${first+visible.length} / ${items.length}</span>
      <button class="action-button primary small" data-action="next-shelf-page" data-focus="${bottom?'page-next-bottom':'page-next'}" ${shelfPage.page>=total-1?'disabled':''}>Next ▶</button>
    </div>`;
    return `<div class="page-browse">
      <div class="top-bar"><span>FRAME LOUNGE / ${html(title.toUpperCase())}</span><span class="top-date">50 TAPES PER PAGE</span></div>
      <div class="page-title"><h1>${html(title)}</h1><p>${items.length} titles in this collection</p></div>
      ${nav(false)}
      <div class="page-grid">${visible.map((t,i)=>card(t,first+i,`page-${id}`)).join('')}</div>
      ${nav(true)}
    </div>`;
  }
  function navPill(title, subtitle='') { return `<div class="top-pill">${icon('spark',15)} ${html(title)}${subtitle?`<span>${html(subtitle)}</span>`:''}</div>`; }
  function hero(t) {
    const bg=backdrop(t);
    return `<section class="hero" style="${paint(t)};${bg?`--hero-bg:url('${bg}');`:''}">
      <div class="hero-abstract"><div class="halo"></div><div class="planet"></div><div class="orbit"></div></div>
      <div class="hero-content">${navPill('TONIGHT’S FEATURE',state.key?'TMDB DISCOVERY':'FrameXTV Collection')}
        <div class="hero-mini">${t.type==='tv'?'TV SERIES':'FEATURE FILM'} <i></i> ${html(t.year)} <i></i> ${html(t.genre)}</div>
        <h1>${html(t.title)}</h1><p class="hero-overview">${html(t.overview||'Find your next great watch.')}</p>
        <div class="hero-buttons"><button class="action-button primary" data-action="hero-play" data-id="${t.id}" data-type="${t.type}" data-focus="hero-play">${icon('play',22)} Open VHS Tape</button>
        <button class="action-button secondary" data-action="detail" data-id="${t.id}" data-type="${t.type}" data-focus="hero-details">${icon('info',22)} More Info</button></div>
      </div><div class="hero-bottom"></div>
    </section>`;
  }
  function filterChips(label,category,options,selected){
    return `<div class="filter-row"><div class="filter-label">${html(label)}</div><div class="filter-options">
       ${options.map(o=>`<button class="filter-chip ${o===selected?'active':''}"
         data-action="set-filter" data-filter="${category}" data-value="${html(o)}"
         data-focus="filter-${category}-${html(o)}" aria-pressed="${o===selected}">${html(o)}</button>`).join('')}
      </div></div>`;
  }
  function filterPanel(route){
    const opts=route==='series'?TV_GENRES:GENRES;
    return `<section class="fast-filters" aria-label="Browse filters">
      <div class="fast-filter-title"><strong>Find your next ${route==='movies'?'movie':'series'}</strong><span>Genre and runtime require title metadata; unknown durations are excluded from duration filters.</span></div>
      ${filterChips('Starts with','letter',['All','#',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],state.filterLetter)}
      ${filterChips('Genre','genre',['All',...opts.map(x=>x[0])],state.filterGenre)}
      ${filterChips(route==='movies'?'Length':'Episode length','runtime',['All','~20','~40','~60','~90','120+'],state.filterRuntime)}
    </section>`;
  }
  function filteredTitles(type){
    return listedTitles(type).filter(t=>{
      const name=t.title.trim().toUpperCase();
      const initial=(name.match(/[A-Z0-9]/)||['#'])[0];
      const letter=state.filterLetter;
      return (letter==='All'||(letter==='#'?/^[0-9]/.test(initial):initial===letter))&&
        genreMatch(t,state.filterGenre)&&runtimeBucket(t,state.filterRuntime);
    }).sort((a,b)=>a.title.localeCompare(b.title));
  }
  function getRows(route){
    const movies=listedTitles('movie'),series=listedTitles('tv');
    if(route==='movies')return [['All Movies · Filtered',filteredTitles('movie')]];
    if(route==='series')return [['All Shows · Filtered',filteredTitles('tv')]];
    const classic=rank(movies.filter(classicKids));
    const family=rank(movies.filter(popularKids));
    const recent=movies.filter(modern).sort((a,b)=>
      (b.releaseDate||'').localeCompare(a.releaseDate||''));
    const trendingMovies=state.trendingKeys.map(k=>library.get(k)).filter(t=>t?.type==='movie'&&isListed(t));
    const trendingTV=state.trendingKeys.map(k=>library.get(k)).filter(t=>t?.type==='tv'&&isListed(t));
    const popularMovies=rank(movies);
    const rows=[
      [trendingMovies.length?'Trending Now · Movies':'Popular Tonight · Movies',
        trendingMovies.length?trendingMovies:popularMovies.slice(0,45)],
      ['Recently Released · Last Two Years',recent],
      ['Kids · Popular & Trending',family],
      ['Kids · Cult Classics',classic],
      ['Action & Adventure',rank(movies.filter(t=>genreMatch(t,'Action')||genreMatch(t,'Adventure')))],
      ['Comedy Favorites',rank(movies.filter(t=>genreMatch(t,'Comedy')))],
      ['Sci-Fi & Fantasy',rank(movies.filter(t=>genreMatch(t,'Sci-Fi')||genreMatch(t,'Fantasy')))],
      ['Horror & Thrillers',rank(movies.filter(t=>genreMatch(t,'Horror')||genreMatch(t,'Thriller')))],
      ['Animation & Family Films',rank(movies.filter(t=>genreMatch(t,'Animation')||genreMatch(t,'Family')))],
      ['Drama & Mystery',rank(movies.filter(t=>genreMatch(t,'Drama')||genreMatch(t,'Mystery')))],
      ['Romance',rank(movies.filter(t=>genreMatch(t,'Romance')))],
      ['Trending Series',trendingTV.length?trendingTV:rank(series).slice(0,45)],
      ['TV Shows to Binge',rank(series).slice(0,60)]
    ];
    return rows;
  }
  function catalogScreen(route){
    shelfData.clear();shelfTitles.clear();shelfOrder.length=0;
    const history=historyTitles();
    const rows=getRows(route);
    const intro=rows.find(([,items])=>items.length)?.[1]?.[0]||listedTitles('movie')[0]||listedTitles('tv')[0];
    const title=route==='movies'?'Movies':route==='series'?'Series':'Home';
    const filtering=route==='movies'||route==='series';
    return `<div class="top-bar"><span>FRAME LOUNGE / ${title.toUpperCase()}</span><span class="top-date">${state.frameCatalog.items.filter(x=>x.type==='movie').length} MOVIES · ${state.frameCatalog.items.filter(x=>x.type==='tv').length} SERIES</span></div>
      ${!filtering&&intro?hero(intro):''}
      ${filtering?filterPanel(route):''}
      <div class="rows-wrap fast-rows">
      ${route==='home'&&history.length?row('Continue Watching',history,'home-history'):''}
      ${route==='home'&&state.favorites.length?row('Watch Later',favoriteTitles(),'home-later'):''}
      ${route==='home'&&state.likes.length?row('Your Favorites',likedTitles(),'home-liked'):''}
      ${!state.key?`<div class="fast-nudge">Connect your TMDB key in Settings for up-to-date trending rankings, release dates, detailed genre filters and posters. Browsing works without a key.</div>`:''}
      ${rows.map(([name,items],idx)=>row(name,items,`${route}-${idx}`)).join('')}
      ${filtering&&!rows[0][1].length?`<div class="fast-empty">No matching titles with known metadata. Try All genres or All lengths.</div>`:''}
      <div class="footer-note">Only FrameXTV-listed titles appear. Genre, release dates, and runtimes come from published metadata or TMDB. Remote: Up/Down switches shelves; Left/Right selects tapes.</div>
      </div>`;
  }
  function historyTitles() { return state.history.map(h => library.get(h.key)||h.item).filter(isListed).slice(0,14); }
  function favoriteTitles() { return state.favorites.map(k=>library.get(k)).filter(isListed); }
  function likedTitles() { return state.likes.map(k=>library.get(k)).filter(isListed); }
  function dislikedTitles() { return state.dislikes.map(k=>library.get(k)).filter(isListed); }
  function myListScreen() {
    const later=favoriteTitles(), liked=likedTitles(), disliked=dislikedTitles();
    const any=later.length||liked.length||disliked.length||state.history.length;
    return `<div class="top-bar"><span>FRAME LOUNGE / MY SHELF</span></div>${header('YOUR PERSONAL VHS COLLECTION','My Shelf','Your Watch Later queue, likes, and dislikes stay on this Fire Stick.')}
      ${any?`<div class="rows-wrap">${row('Watch Later',later)}${row('Liked Tapes',liked)}${row('Disliked Tapes',disliked)}${state.history.length?row('Recently Played',historyTitles()):''}</div>`:`<div class="empty-state">${icon('list',48)}<h2>Nothing on your shelf yet</h2><p>Open a VHS tape and select Like, Dislike, or Watch Later to organize your collection.</p><button class="action-button primary" data-action="route" data-route="home" data-focus="empty-home">Browse VHS Tapes</button></div>`}`;
  }
  function searchScreen() {
    return `<div class="top-bar"><span>FRAME LOUNGE / SEARCH</span></div>${header('FIND SOMETHING GOOD','Search the Library',state.key?'Search movies and TV series from TMDB.':'Search all titles currently listed by FrameXTV.')}
      <div class="search-box">${icon('search',26)}<input id="search-input" data-focus="search-input" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Movie or TV series title…" value="${html(state.search)}"><span>OK / SELECT</span></div>
      <div id="search-result-area">${searchResultsHtml()}</div>`;
  }
  function searchResultsHtml() {
    const terms=state.search.trim().toLowerCase();
    if (!terms) return row('Explore FrameXTV Titles',listedTitles().slice(0,30));
    let results=state.searchResults || [];
    const local=listedTitles().filter(t=>t.title.toLowerCase().includes(terms));
    results=unique([...results,...local].filter(isListed),5000);
    if (results.length) return shelves(`Search results for “${state.search}”`,results).map(([label,items],idx)=>row(label,items,`search-${idx}`)).join('');
    return `<div class="empty-state"><h2>No matching titles yet</h2><p>${state.key?'Try another search term.':'Try another search term.'}</p></div>`;
  }
  function settingsScreen() {
    return `<div class="top-bar"><span>FRAME LOUNGE / SETTINGS</span></div>${header('MAKE IT YOURS','Settings','One-time setup. Your preferences are saved on this device.')}
      <section class="setting-panel"><div class="setting-title">${icon('movies',22)} Live Catalog · TMDB</div>
        <p>Enter your own TMDB API key once to load live movies, posters, genres, and TV episodes. It is saved locally on this Fire Stick and never placed in GitHub or inside the downloadable APK. A TMDB v3 API key or v4 read token works.</p>
        <div class="input-label">YOUR TMDB API KEY / READ ACCESS TOKEN</div>
        <div class="settings-control"><input id="api-key" data-focus="api-key" type="password" autocorrect="off" autocapitalize="none" spellcheck="false" autocomplete="off" placeholder="Paste or type your TMDB key" value=""><button class="action-button primary small" data-action="save-api" data-focus="save-api">Save &amp; Connect</button></div><p class="setting-help">After entering your key, close the on-screen keyboard, then press RIGHT or DOWN to highlight Save &amp; Connect. Press SELECT to save.</p>
        <p class="setting-help">${state.key?'Catalog credential: saved on this device.':'Catalog credential: not configured; starter library available.'} Tip: use the Fire TV phone app keyboard to paste the key without typing it with a remote. Treat anyone with access to app data as able to retrieve your credential.</p>
        <button class="action-button secondary small" data-action="clear-api" data-focus="clear-api">Remove Saved Key</button>
      </section>
      <section class="setting-panel"><div class="setting-title">${icon('play',22)} Streaming Sources · Auto-updated</div>
        <p>Playback links load from an online configuration file when the app opens, and refresh again after at least 6 hours when you reopen the app. If the service changes its domain or embed path, edit <strong>remote-config.json</strong> on GitHub. The Fire Stick will read the new version automatically. Previously downloaded settings are preserved when offline.</p>
        <div class="settings-control radio-line">${state.config.sources.map((source,i)=>`<button data-action="domain" data-domain="${html(source.id)}" data-focus="domain-${i}" class="choice ${state.domain===source.id?'active':''}">${state.domain===source.id?'●':'○'} ${html(source.label)} <small>(${html(new URL(source.origin).host)})</small></button>`).join('')}</div>
        <div class="input-label">ONLINE UPDATE URL · RAW HTTPS JSON</div>
        <div class="settings-control"><input id="config-url" data-focus="config-url" type="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://raw.githubusercontent.com/.../remote-config.json" value="${html(state.configUrl)}"><button class="action-button primary small" data-action="save-config" data-focus="save-config">Save & Check</button><button class="action-button secondary small" data-action="refresh-config" data-focus="refresh-config">Refresh Now</button></div>
        <p class="setting-help">${html(state.configStatus)} · Local configuration: ${html(state.config.version)} · ${state.config.sources.length} sources configured. Use “Try Other Source” on the playback screen when a provider fails. An iframe cannot always report a broken stream back to the app.</p>
      </section>
      <section class="setting-panel"><div class="setting-title">${icon('movies',22)} FrameXTV Listings</div>
        <p>Only titles with links in FrameXTV's publicly listed movie and TV catalog appear on the VHS shelves. A listed title is presumed playable, without probing video streams or showing verification warnings. The public GitHub listing refreshes daily, and this app downloads the latest list on launch.</p>
        <div class="settings-control"><button class="action-button primary small" data-action="refresh-catalog" data-focus="refresh-catalog">Refresh FrameXTV Listings</button></div>
        <p class="setting-help">${html(state.catalogStatus)} · ${state.frameCatalog.items.length} listed titles · ${html(state.frameCatalog.version)}. A published link is not a guarantee that the upstream video will work.</p>
      </section>
      <section class="setting-panel"><div class="setting-title">${icon('settings',22)} Storage & Information</div>
        <p>Likes, dislikes, Watch Later, and recently played items are kept locally on your Fire Stick. This is an independent, unofficial personal interface, not affiliated with TMDB or FrameXTV.</p>
        <div class="settings-control"><button class="action-button secondary small" data-action="clear-history" data-focus="clear-history">Clear Watch History</button><button class="action-button secondary small" data-action="clear-list" data-focus="clear-list">Clear Watch Later</button></div>
        <p class="setting-help">TMDB attribution: This product uses the TMDB API but is not endorsed or certified by TMDB. Video availability and playback are controlled by FrameXTV and its upstream providers. Streams may fail, be unsupported by Fire OS WebView, or be unavailable.</p>
      </section>`;
  }
  function detailScreen(t) {
    const isTV=t.type==='tv';
    const bg=backdrop(t), k=keyOf(t);
    const later=state.favorites.includes(k), liked=state.likes.includes(k), disliked=state.dislikes.includes(k);
    return `<div class="detail-view"><div class="detail-hero" style="${paint(t)};${bg?`--hero-bg:url('${bg}');`:''}">
      <button class="breadcrumb" data-action="close-detail" data-focus="detail-back">${icon('back',21)} Back to the shelf</button>
      <div class="detail-flex">
        <div class="detail-poster">${tapeArt(t,true)}</div>
        <div class="detail-info"><div class="hero-mini">${isTV?'TV SERIES':'FEATURE FILM'} <i></i> ${html(t.year||'')} ${t.rating?`<i></i> ★ ${html(t.rating)}/10`:''}</div>
          <h1>${html(t.title)}</h1><div class="detail-genre">${html(t.genre||'Entertainment')}</div>
          <p class="detail-synopsis">${html(t.overview||'Choose a tape to see the information and playback options.')}</p>
          <div class="vhs-detail-buttons">
            <button class="action-button primary" data-action="play" data-focus="detail-play">${icon('play',22)} ${isTV?'Play Episode':'Play Movie'}</button>
            <button class="action-button secondary ${later?'action-active':''}" data-action="favorite" data-focus="detail-fav" aria-pressed="${later}">${icon(later?'check':'clock',20)} ${later?'Saved for Later':'Watch Later'}</button>
            <button class="action-button secondary ${liked?'action-active like-active':''}" data-action="like" data-focus="detail-like" aria-pressed="${liked}">${icon('like',20)} ${liked?'Liked':'Like'}</button>
            <button class="action-button secondary ${disliked?'action-active dislike-active':''}" data-action="dislike" data-focus="detail-dislike" aria-pressed="${disliked}">${icon('dislike',20)} ${disliked?'Disliked':'Dislike'}</button>
          </div>
          <p class="vhs-storage-note">Likes, dislikes, and Watch Later are saved locally on this Fire Stick — not uploaded to GitHub.</p>
          ${isTV?`<div class="detail-episode-selected">Selected: Season ${state.currentSeason}, Episode ${state.currentEpisode||1}</div>`:''}
        </div>
      </div>
      </div>${isTV?episodeSection(t):''}
      <div class="detail-bottom">Playback uses an external FrameXTV embed. Stream availability and rights depend on the provider.</div></div>`;
  }
  function episodeSection(t) {
    const seasons=t.seasons?.filter(s=>s.season_number>0) || null;
    const max=Math.min(40,Math.max(1,t.seasonCount||1));
    const buttons=seasons?seasons.map(s=>({number:s.season_number,label:s.name||`Season ${s.season_number}`})):
      Array.from({length:max},(_,i)=>({number:i+1,label:`Season ${i+1}`}));
    let eps='';
    if (state.episodes?.length) {
      eps=`<div class="episode-grid">${state.episodes.map(ep=>`<button class="episode-tile ${state.currentEpisode===ep.episode_number?'active':''}" data-action="episode" data-episode="${ep.episode_number}" data-focus="episode-${ep.episode_number}"><span class="episode-count">EP ${String(ep.episode_number).padStart(2,'0')}</span><strong>${html(ep.name||`Episode ${ep.episode_number}`)}</strong><small>${html(ep.overview||'Select to play this episode.').slice(0,130)}</small></button>`).join('')}</div>`;
    } else if (state.seasonLoading) eps='<p class="info-note">Loading episode list…</p>';
    else eps=`<div class="episode-manual"><p>${state.key?'Choose a season to load the episode list.':'Connect a TMDB key to load real episode titles. You can still enter an episode number manually below.'}</p>
      <label for="ep-number">Episode number</label><input id="ep-number" data-focus="ep-number" type="number" min="1" max="999" value="${state.currentEpisode||1}" inputmode="numeric">
      <button class="action-button primary small" data-action="set-episode" data-focus="set-episode">Use Episode</button></div>`;
    return `<section class="episodes-section"><div class="row-heading"><h2>Episodes</h2><span>Pick a season, then choose an episode</span></div>
      <div class="season-row">${buttons.map(s=>`<button class="season-button ${state.currentSeason===s.number?'active':''}" data-action="season" data-season="${s.number}" data-focus="season-${s.number}">${html(s.label)}</button>`).join('')}</div>
      ${eps}</section>`;
  }
  // App-owned transport controls stay usable even when an embedded video iframe
  // cannot receive/return Fire TV D-pad focus. Controls are hidden at rest.
  const PLAYER_IDLE_MS=5000;
  let playerHideTimer=null, playerControlsVisible=false, playerControlIndex=1;
  let playerTheater=false;
  let mediaPlaying=true;
  const PLAYER_BUTTONS=['player-rewind','player-pause','player-forward','player-fullscreen','player-switch','player-close'];
  function playerControlButtons(){return PLAYER_BUTTONS.map(k=>$('#player-view [data-focus="'+k+'"]')).filter(Boolean);}
  function setPlayerControlIndex(next){
    const buttons=playerControlButtons();
    if(!buttons.length)return;
    playerControlIndex=Math.max(0,Math.min(buttons.length-1,next));
    buttons[playerControlIndex].focus({preventScroll:true});
  }
  function hidePlayerControls(){
    if(!state.playing)return;
    playerControlsVisible=false;
    const view=$('#player-view');if(view)view.classList.remove('controls-visible');
    const idle=$('#player-idle-focus');
    if(idle)idle.focus({preventScroll:true});
  }
  function wakePlayerControls(focusControls=false){
    if(!state.playing)return;
    playerControlsVisible=true;
    const view=$('#player-view');if(view)view.classList.add('controls-visible');
    clearTimeout(playerHideTimer);
    playerHideTimer=setTimeout(hidePlayerControls,PLAYER_IDLE_MS);
    if(focusControls){requestAnimationFrame(()=>{if(state.playing && playerControlsVisible)setPlayerControlIndex(playerControlIndex);});}
  }
  function playerDo(action){
    if(action==='player-rewind')playerCmd('seekBy',{seconds:-10});
    else if(action==='player-forward')playerCmd('seekBy',{seconds:10});
    else if(action==='player-pause'){
      playerCmd(mediaPlaying?'pause':'play');mediaPlaying=!mediaPlaying;
      updatePlayerPauseButton();
    }
    else if(action==='player-fullscreen'){
      playerTheater=!playerTheater;
      $('#player-view')?.classList.toggle('theater-view',playerTheater);
      updatePlayerViewButton();
    }
    else if(action==='player-switch'){switchSource();return;}
    else if(action==='player-close'){closePlayer();return;}
    wakePlayerControls(true);
  }
  function updatePlayerPauseButton(){
    const b=$('#player-view [data-action="player-pause"]');
    if(b){b.innerHTML=mediaPlaying?'⏸ Pause':'▶ Play';b.setAttribute('aria-label',mediaPlaying?'Pause video':'Play video');}
  }
  function updatePlayerViewButton(){
    const b=$('#player-view [data-action="player-fullscreen"]');
    if(b){b.textContent=playerTheater?'⛶ Fullscreen':'▣ Theater view';b.setAttribute('aria-label',playerTheater?'Fill screen with video':'Use inset theater view');}
  }
  function playerRemoteKey(key){
    if(!state.playing)return false;
    if(key==='ArrowDown'){
      if(!playerControlsVisible){playerControlIndex=1;} // highlight Play/Pause first
      wakePlayerControls(true);return true;
    }
    if(key==='ArrowUp'){
      if(playerControlsVisible){hidePlayerControls();}return true;
    }
    if(key==='ArrowLeft'||key==='ArrowRight'){
      if(!playerControlsVisible){wakePlayerControls(true);return true;}
      setPlayerControlIndex(playerControlIndex+(key==='ArrowRight'?1:-1));
      wakePlayerControls(true);return true;
    }
    if(key==='Enter'||key==='Select'){
      if(!playerControlsVisible){wakePlayerControls(true);return true;}
      const b=playerControlButtons()[playerControlIndex];
      if(b)b.click();return true;
    }
    return false;
  }
  function drawPlayer() {
    if(!state.playing)return;
    const t=state.playing; const isTV=t.type==='tv';
    const id=Number(t.id), season=Math.max(1,Number(state.currentSeason)||1), episode=Math.max(1,Number(state.currentEpisode)||1);
    const source = state.config.sources.find(x=>x.id===state.domain) || state.config.sources[0];
    const template=isTV?source.tv:source.movie;
    const path=template.split('{id}').join(String(id)).split('{season}').join(String(season)).split('{episode}').join(String(episode));
    const saved=state.history.find(h=>h.key===keyOf(t));
    const at=(saved?.time && Number.isFinite(saved.time) && saved.time>10)?'&t='+Math.floor(saved.time):'';
    // Hide the embed's own chrome; our controls handle D-pad and media keys.
    // Embed API documents both controls=0 and postMessage playback commands.
    const player=`${source.origin}${path}?autoplay=1&controls=0&muted=0${at}`;
    clearTimeout(playerHideTimer);
    mediaPlaying=true;playerControlsVisible=false;
    const target=$('#overlay-root');
    target.innerHTML=`<div class="player-view ${playerTheater?'theater-view':''}" id="player-view" role="dialog" aria-label="Video player">
      <iframe tabindex="-1" id="player-iframe" title="FrameXTV video player" src="${player}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <button id="player-idle-focus" tabindex="-1" aria-label="Video playing. Press Down for player controls." class="player-idle-focus"></button>
      <div class="player-overlay" id="player-overlay">
        <div class="player-heading"><span class="player-kicker">NOW PLAYING</span><h2>${html(t.title)}</h2>${isTV?`<p>Season ${season} · Episode ${episode}</p>`:''}</div>
        <div class="player-bottom"><span class="player-help">▼ Show controls · ◀ ▶ Select · Fire TV media keys to seek / pause · Back to exit</span>
          <div class="player-controls" role="toolbar" aria-label="Playback controls">
            <button data-action="player-rewind" data-focus="player-rewind" aria-label="Rewind ten seconds">↶ 10s</button>
            <button data-action="player-pause" data-focus="player-pause" aria-label="Pause video">⏸ Pause</button>
            <button data-action="player-forward" data-focus="player-forward" aria-label="Forward ten seconds">10s ↷</button>
            <button data-action="player-fullscreen" data-focus="player-fullscreen" aria-label="Use inset theater view">▣ Theater view</button>
            <button data-action="player-switch" data-focus="player-switch" aria-label="Switch source">⇄ Source</button>
            <button data-action="player-close" data-focus="player-close" aria-label="Close player">✕ Exit</button>
          </div>
        </div>
      </div>
    </div>`;
    const iframe=$('#player-iframe');
    iframe?.addEventListener('load',()=>{$('#player-view')?.classList.add('player-loaded');});
    $('#player-idle-focus')?.focus({preventScroll:true});
    updatePlayerViewButton();
    wakePlayerControls(false);
  }
  function render(focusKey) {
    let body;
    windowedShelves=!shelfPage&&!state.detail&&['home','movies','series'].includes(state.route);
    if (state.detail) body=detailScreen(state.detail);
    else if (shelfPage) body=shelfPageScreen();
    else if (state.route==='mylist') body=myListScreen();
    else if (state.route==='search') body=searchScreen();
    else if (state.route==='settings') body=settingsScreen();
    else body=catalogScreen(state.route);
    shell(body); focusDefault(focusKey);
  }
  function changeRoute(r) {
    if(!['home','movies','series','search','mylist','settings'].includes(r))return;
    state.route=r;state.detail=null;state.playing=null;state.lastFocus=null;
    shelfPage=null;activeShelfIndex=0;render();
    if(r==='search') focusByKey('search-input');
  }
  async function openDetail(t) {
    if(!isListed(t)){showMessage('This title is not in the FrameXTV published listings.');return;}
    rememberFocus();state.detail=mergeTitle(t); state.currentSeason=1;state.currentEpisode=1;state.episodes=null;
    render('detail-play');
    if (state.key) {
      try {
        const data=await tmdb(`${t.type}/${t.id}`);
        if(state.detail && keyOf(state.detail)===keyOf(t)) {
          state.detail=mergeTitle(normalize(data,t.type));
          render('detail-play');
          if(t.type==='tv') loadEpisodes(1);
        }
      } catch(err) { showMessage('TMDB detail unavailable. Showing available title information.'); }
    }
  }
  function openPlayer() {
    if(!state.detail)return;
    playerTheater=false;playerControlIndex=1;
    state.playing=state.detail;
    const key=keyOf(state.playing);state.history=state.history.filter(h=>h.key!==key);
    state.history.unshift({key,item:state.playing,at:Date.now(),time:0});state.history=state.history.slice(0,45);saveStore('history',state.history);
    drawPlayer();
  }
  function closePlayer() { if(!state.playing)return;clearTimeout(playerHideTimer);const frame=$('#player-iframe');if(frame)frame.src='about:blank';state.playing=null;playerControlsVisible=false;$('#overlay-root').innerHTML='';focusByKey('detail-play'); }
  function toggleFavorite(){
    if(!state.detail)return;
    const k=keyOf(state.detail);
    state.favorites=state.favorites.includes(k)?state.favorites.filter(x=>x!==k):[k,...state.favorites];
    saveStore('favorites',state.favorites);persistShelfItems();render('detail-fav');
  }
  function toggleReaction(kind){
    if(!state.detail)return;
    const k=keyOf(state.detail);
    const on=kind==='like'?'likes':'dislikes', opposite=kind==='like'?'dislikes':'likes';
    state[on]=state[on].includes(k)?state[on].filter(x=>x!==k):[k,...state[on]];
    if(state[on].includes(k))state[opposite]=state[opposite].filter(x=>x!==k);
    saveStore('likes',state.likes);saveStore('dislikes',state.dislikes);persistShelfItems();
    render('detail-'+kind);
  }
  function showMessage(text) { state.message=text;let toast=$('.toast');if(toast)toast.textContent=text;else { toast=document.createElement('div');toast.className='toast';toast.textContent=text;$('.layout')?.appendChild(toast); }clearTimeout(showMessage.t);showMessage.t=setTimeout(()=>{state.message=null;toast?.remove();},4200); }
  function setDomain(value) {
    if(!state.config.sources.some(x=>x.id===value))return;
    state.domain=value;saveStore('playerDomain',value);
    const index=state.config.sources.findIndex(x=>x.id===value);
    render('domain-'+index);
  }
  function switchSource(){
    if(!state.config.sources.length)return;
    const index=state.config.sources.findIndex(x=>x.id===state.domain);
    const next=state.config.sources[(index+1)%state.config.sources.length];
    state.domain=next.id;saveStore('playerDomain',next.id);
    if(state.playing){drawPlayer();playerControlIndex=4;wakePlayerControls(true);}
    showMessage('Trying '+next.label);
  }
  async function refreshRemoteConfig(force=false){
    if(!state.configUrl)return;
    if(!force && Date.now()-state.configChecked < 6*60*60*1000)return;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8500);
    try {
      const u=new URL(state.configUrl);
      if(u.protocol!=='https:' || u.username || u.password || u.port || !['raw.githubusercontent.com','gist.githubusercontent.com'].includes(u.hostname)) throw new Error('Use a GitHub raw HTTPS URL');
      const res=await fetch(u.toString(),{cache:'no-store',signal:controller.signal});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const content=await res.text();if(content.length>24000)throw new Error('Configuration too large');
      const config=validateConfig(JSON.parse(content));
      const previous=state.domain;state.config=config;saveStore('remoteConfig',config);
      const manuallySelected=!!getStore('playerDomain','');
      state.domain=manuallySelected && config.sources.some(x=>x.id===previous)?previous:config.defaultSource;
      state.configChecked=Date.now();saveStore('configChecked',state.configChecked);
      state.configStatus='Updated '+new Date(state.configChecked).toLocaleDateString()+' '+new Date(state.configChecked).toLocaleTimeString();
      if(state.route==='settings' && !state.playing)render(document.activeElement?.dataset?.focus || 'refresh-config');
      if(force)showMessage('Sources updated: '+config.version);
    }catch(err){
      state.configStatus='Update check unavailable ('+String(err.message||'network error').slice(0,100)+'); using saved sources';
      if(force)showMessage(state.configStatus);
      if(state.route==='settings' && !state.playing)render(document.activeElement?.dataset?.focus || 'refresh-config');
    }finally{clearTimeout(timer);}
  }
  function apiHeaders() { return state.key.startsWith('eyJ')?{Authorization:'Bearer '+state.key}:{ }; }
  async function tmdb(path) {
    if(!state.key)throw new Error('No TMDB API key configured');
    const separator=path.includes('?')?'&':'?';
    const extra=state.key.startsWith('eyJ')?'':separator+'api_key='+encodeURIComponent(state.key);
    const url=`https://api.themoviedb.org/3/${path}${extra}`;
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(url,{headers:apiHeaders(),signal:controller.signal});
      if(!response.ok)throw new Error('TMDB HTTP '+response.status);
      return response.json();
    }finally{clearTimeout(timeout);}
  }
  async function connectCatalog() {
    if(!state.key){state.rows=null;render();return;}
    if(state.loading)return;
    state.loading=true;
    try {
      const test=await tmdb('configuration');
      if (!test?.images) throw new Error('TMDB did not return valid configuration');
      const queries={
        trending:'trending/all/week?language=en-US',
        nowPlaying:'movie/now_playing?language=en-US&region=US',
        popularMovies:'movie/popular?language=en-US',
        popularTV:'tv/popular?language=en-US'
      };
      const entries=await Promise.all(Object.entries(queries).map(async ([name,path])=>{
        try { const d=await tmdb(path);const type=name==='trending'?null:name.toLowerCase().includes('tv')?'tv':'movie';
          return [name,unique((d.results||[]).map(x=>normalize(x,type)).filter(isListed).map(mergeTitle).filter(Boolean),24)]; }
        catch(_) {return [name,[]];}
      }));
      state.rows=Object.fromEntries(entries);
      const trend=state.rows.trending||[];
      if(trend.length){state.trendingKeys=trend.map(keyOf);saveStore('trendingKeysV2',state.trendingKeys);}
      showMessage('TMDB connected. Artwork and categories are loading progressively.');
    }catch(err){state.rows=null;showMessage('TMDB connection failed. Check your API key and network.');}
    finally{state.loading=false;if(!state.detail&&!state.playing)render();
      if(state.key)setTimeout(enrichListedPosters,1600);}
  }
  async function loadEpisodes(season) {
    if(!state.detail||state.detail.type!=='tv'||!state.key)return;
    const id=state.detail.id;state.episodes=null;state.seasonLoading=true;render('season-'+season);
    try {const d=await tmdb(`tv/${id}/season/${season}?language=en-US`);
      if(state.detail?.id===id && state.currentSeason===season){state.episodes=(d.episodes||[]).filter(e=>e.episode_number>0);}}
    catch(_){if(state.detail?.id===id)showMessage('Episode list unavailable. You can enter an episode manually.');}
    finally{if(state.detail?.id===id){state.seasonLoading=false;render('season-'+season);}}
  }
  function searchLocal(term) {
    const q=term.trim().toLowerCase();return q?Array.from(library.values()).filter(t=>t.title.toLowerCase().includes(q)):[];
  }
  let searchSerial=0;
  async function searchRemote(term,serial) {
    if(!state.key || !term.trim()){state.searchResults=null;refreshSearchResults();return;}
    try {const d=await tmdb('search/multi?query='+urlText(term)+'&include_adult=false&language=en-US');
      if(serial!==searchSerial || state.route!=='search')return;
      state.searchResults=(d.results||[]).map(x=>normalize(x)).filter(isListed).map(mergeTitle).filter(Boolean);
      refreshSearchResults();
    }catch(_){if(serial===searchSerial){state.searchResults=[];refreshSearchResults();}}
  }
  function refreshSearchResults() { const area=$('#search-result-area');if(area)area.innerHTML=searchResultsHtml(); }
  function playerCmd(action,params={}) {
    const frame=$('#player-iframe');if(!frame||!frame.contentWindow)return;
    // The primary .xyz address may redirect to .cc. Target both trusted configured
    // player origins, never '*'; only the iframe's real origin receives the action.
    const origins=new Set(state.config.sources.map(x=>x.origin));
    for(const origin of origins){
      try{frame.contentWindow.postMessage({action,...params},origin);}catch(_){}
    }
  }
  window.fireTvMediaKey = action => {
    if(!state.playing)return false;
    if(action==='play'){playerCmd('play');mediaPlaying=true;}
    else if(action==='pause'){playerCmd('pause');mediaPlaying=false;}
    else if(action==='rewind')playerCmd('seekBy',{seconds:-10});
    else if(action==='forward')playerCmd('seekBy',{seconds:10});
    else {playerCmd(mediaPlaying?'pause':'play');mediaPlaying=!mediaPlaying;}
    updatePlayerPauseButton();wakePlayerControls(false);return true;
  };
  // Used directly by native Fire OS key dispatch: guarantees the D-pad works
  // even if the third-party iframe attempts to capture focus.
  window.fireTvRemoteKey = key => {
    lastRemoteActivity=Date.now();
    if(state.playing)return playerRemoteKey(key);
    const active=document.activeElement;
    if(key==='Enter'){
      if(active?.tagName==='BUTTON'){active.click();return true;}
      if(active?.tagName==='INPUT'){active.focus();active.click();return true;}
    }
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
      // TV-remotes have no Tab key: Right/Down must exit settings fields.
      // Use explicit targets so focus cannot skip Save & Connect.
      const target = active?.id==='api-key' ? 'save-api' :
                     active?.id==='config-url' ? 'save-config' : null;
      if(target && (key==='ArrowRight'||key==='ArrowDown')){
        active.blur();
        moveFocusTo($('[data-focus="'+target+'"]'));
        return true;
      }
      // Left still supports correcting text without accidentally exiting it.
      if(active?.tagName==='INPUT' && key==='ArrowLeft' &&
         ['text','password','search','tel'].includes(active.type)){
        const pos=active.selectionStart||0;
        active.setSelectionRange(Math.max(0,pos-1),Math.max(0,pos-1));
        return true;
      }
      spatialNavigate(key);return true;
    }
    return false;
  };
  // Called only by the native Fire Stick UI. In cursor mode, keep the app's
  // control strip hidden so user taps can reach embedded player prompts.
  window.fireTvCursorModeChanged = enabled => {
    if (!state.playing) return;
    clearTimeout(playerHideTimer);
    hidePlayerControls();
  };
  window.fireTvAppPause = () => { if(state.playing)playerCmd('pause'); };
  window.fireTvBack = () => {
    if(state.playing){closePlayer();return true;}
    if(state.detail){state.detail=null;state.episodes=null;render(state.lastFocus);return true;}
    if(shelfPage){const id=shelfPage.id;shelfPage=null;render('more-'+id);return true;}
    if(state.route!=='home'){changeRoute('home');return true;}
    return false;
  };
  window.addEventListener('message',ev=>{
    if (!state.playing || !state.config.sources.some(x=>x.origin===ev.origin))return;
    const data=ev.data;
    if(data?.event==='frameXTV:timeupdate'){
      const current=Number(data.currentTime)||0;
      const entry=state.history.find(h=>h.key===keyOf(state.playing));
      if(entry && current>0 && Math.abs(current-(entry.time||0))>=15){entry.time=current;saveStore('history',state.history);}
    }
  });
  // Button delegation allows browser preview as well as a no-mouse Fire TV remote.
  document.addEventListener('click',async ev=>{
    const btn=ev.target.closest('[data-action]');if(!btn)return;
    const action=btn.dataset.action;
    if(action==='route'){changeRoute(btn.dataset.route);return;}
    if(action==='more-shelf'){showShelfPage(btn.dataset.shelf);return;}
    if(action==='close-shelf-page'){
      const id=shelfPage?.id;shelfPage=null;render(id?'more-'+id:undefined);return;
    }
    if(action==='prev-shelf-page'||action==='next-shelf-page'){
      showShelfPage(shelfPage?.id,(shelfPage?.page||0)+(action==='next-shelf-page'?1:-1));return;
    }
    if(action==='set-filter'){
      const key=btn.dataset.filter;
      if(key==='letter')state.filterLetter=btn.dataset.value;
      if(key==='genre')state.filterGenre=btn.dataset.value;
      if(key==='runtime')state.filterRuntime=btn.dataset.value;
      render(btn.dataset.focus);return;
    }
    if(action==='detail' || action==='hero-play'){
      const t=library.get(`${btn.dataset.type}:${btn.dataset.id}`);if(t){await openDetail(t);}return;
    }
    if(action==='close-detail'){window.fireTvBack();return;}
    if(action==='play'){openPlayer();return;}
    if(action==='favorite'){toggleFavorite();return;}
    if(action==='like' || action==='dislike'){toggleReaction(action);return;}
    if(action==='season'){state.currentSeason=Number(btn.dataset.season);state.currentEpisode=1;state.episodes=null;
      if(state.key)loadEpisodes(state.currentSeason);else render(`season-${state.currentSeason}`);return;}
    if(action==='episode'){state.currentEpisode=Number(btn.dataset.episode);render(`episode-${state.currentEpisode}`);return;}
    if(action==='set-episode'){const n=Number($('#ep-number')?.value);if(!Number.isInteger(n)||n<1||n>999){showMessage('Enter an episode number from 1 to 999.');return;}state.currentEpisode=n;render('detail-play');return;}
    if(action?.startsWith('player-')){playerDo(action);return;}
    if(action==='domain'){setDomain(btn.dataset.domain);return;}
    if(action==='next-source'){switchSource();return;}
    if(action==='save-config'){const u=$('#config-url')?.value.trim()||'';state.configUrl=u;saveStore('configUrl',u);state.configChecked=0;render('refresh-config');refreshRemoteConfig(true);return;}
    if(action==='refresh-config'){refreshRemoteConfig(true);return;}
    if(action==='refresh-catalog'){refreshFrameCatalog(true);return;}
    if(action==='save-api'){
      const key=$('#api-key')?.value.trim()||'';if(!key){showMessage('Enter a TMDB API key first.');return;}
      state.key=key;saveStore('tmdbKey',key);state.rows=null;render('save-api');connectCatalog();return;}
    if(action==='clear-api'){state.key='';state.rows=null;saveStore('tmdbKey','');render('api-key');showMessage('TMDB key removed. Starter library active.');return;}
    if(action==='clear-history'){state.history=[];saveStore('history',[]);render('clear-history');showMessage('Watch history cleared.');return;}
    if(action==='clear-list'){state.favorites=[];saveStore('favorites',[]);persistShelfItems();render('clear-list');showMessage('Watch Later cleared.');return;}
  });
  let searchTimer;
  document.addEventListener('input',ev=>{
    if(ev.target.id!=='search-input')return;
    state.search=ev.target.value;state.searchResults=null;
    refreshSearchResults();
    clearTimeout(searchTimer);const serial=++searchSerial;
    if(state.search.trim())searchTimer=setTimeout(()=>searchRemote(state.search,serial),350);
  });
  document.addEventListener('keydown',ev=>{
    lastRemoteActivity=Date.now();
    if(ev.key==='Escape'||ev.key==='BrowserBack'){ev.preventDefault();window.fireTvBack();return;}
    if(state.playing && ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Enter',' '].includes(ev.key)){
      ev.preventDefault();ev.stopPropagation();playerRemoteKey(ev.key===' '?'Enter':ev.key);return;
    }
    if(ev.key==='Enter'){
      if(document.activeElement?.id==='search-input'){document.activeElement.blur();const first=$('#search-result-area [data-focus]');first?.focus();ev.preventDefault();return;}
      if(document.activeElement?.id==='ep-number'){state.currentEpisode=Math.max(1,Number(document.activeElement.value)||1);render('detail-play');ev.preventDefault();return;}
      const a=document.activeElement;if(a?.tagName==='BUTTON'){ev.preventDefault();a.click();return;}
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;
    // Player D-pad keys are handled above so the iframe never traps navigation.
    const focused=document.activeElement;
    const saveTarget=focused?.id==='api-key'?'save-api':
                     focused?.id==='config-url'?'save-config':null;
    if(saveTarget && (ev.key==='ArrowRight'||ev.key==='ArrowDown')){
      ev.preventDefault();focused.blur();moveFocusTo($('[data-focus="'+saveTarget+'"]'));return;
    }
    if(['INPUT','TEXTAREA'].includes(focused?.tagName)) {
      if(ev.key==='ArrowLeft'||ev.key==='ArrowRight')return;
    }
    ev.preventDefault(); spatialNavigate(ev.key);
  },true);
  // D-pad navigation prioritises shelf structure, not the coordinates of
  // off-screen carousel items (those used to trap focus on Fire TV).
  function moveFocusTo(el) {
    if (!el) return false;
    el.focus({preventScroll:true});
    const strip=el.closest('.carousel-row');
    if(strip){
      const cr=el.getBoundingClientRect(),sr=strip.getBoundingClientRect();
      strip.scrollLeft+=cr.left+cr.width/2-(sr.left+sr.width/2);
    }
    const main=$('.main');
    if(main && main.contains(el)){
      const r=el.getBoundingClientRect(),m=main.getBoundingClientRect();
      if(r.top<m.top+26)main.scrollTop+=r.top-m.top-55;
      else if(r.bottom>m.bottom-40)main.scrollTop+=r.bottom-m.bottom+55;
    }
    return true;
  }
  function spatialNavigate(direction){
    const current=document.activeElement;
    const inRow=current?.closest?.('.carousel-row');
    const rows=windowedShelves ? $$('.carousel-row[data-row]') :
      $$('.carousel-row').filter(r=>r.querySelector('.vhs-card'));
    if(inRow){
      const cards=$$('.vhs-card',inRow);
      const idx=Math.max(0,cards.indexOf(current));
      const shelfIndex=rows.indexOf(inRow);
      if(direction==='ArrowLeft'){
        if(idx>0){moveFocusTo(cards[idx-1]);return;}
        const selected=$('.nav-item.selected')||$('.nav-item');
        moveFocusTo(selected);return;
      }
      if(direction==='ArrowRight'){
        if(idx<cards.length-1)moveFocusTo(cards[idx+1]);
        return;
      }
      if(direction==='ArrowUp'||direction==='ArrowDown'){
        const nextRow=rows[shelfIndex+(direction==='ArrowDown'?1:-1)];
        if(nextRow){
          if(windowedShelves)mountShelfWindow(shelfIndex+(direction==='ArrowDown'?1:-1));
          const nextCards=$$('.vhs-card',nextRow);
          moveFocusTo(nextCards[Math.min(idx,nextCards.length-1)]);
        }else if(direction==='ArrowUp'){
          moveFocusTo($('.hero-buttons [data-focus]')||$('.nav-item.selected'));
        }
        return;
      }
    }
    const inNav=current?.closest?.('.sidebar');
    if(inNav){
      const nav=$$('.sidebar .nav-item');
      const idx=nav.indexOf(current);
      if(direction==='ArrowDown'||direction==='ArrowUp'){
        moveFocusTo(nav[Math.max(0,Math.min(nav.length-1,idx+(direction==='ArrowDown'?1:-1)))]);
        return;
      }
      if(direction==='ArrowRight'){
        moveFocusTo($('.hero-buttons [data-focus]')||$('.rows-wrap .vhs-card')||$('.main [data-focus]'));
        return;
      }
      if(direction==='ArrowLeft')return;
    }
    if(current?.closest?.('.hero') && direction==='ArrowDown'){
      if(moveFocusTo(rows[0]?.querySelector('.vhs-card')))return;
    }
    if(direction==='ArrowDown' && !current?.closest?.('.catalog-row') &&
       current?.closest?.('.main') && rows.length &&
       !current?.closest?.('.setting-panel,.detail-hero,.search-panel')){
      if(moveFocusTo(rows[0].querySelector('.vhs-card')))return;
    }
    // Spatial fallback is reserved for details, settings, search, and overlays.
    const curr=current?.getBoundingClientRect?.();
    const nodes=$$('[data-focus]').filter(el=>{
      if(el.disabled || el.getAttribute('aria-hidden')==='true')return false;
      if(state.playing&&!$('#player-view')?.contains(el))return false;
      const r=el.getBoundingClientRect();return r.width>2 && r.height>2;
    });
    if(!nodes.length)return;
    if(!curr || !nodes.includes(current)){moveFocusTo(nodes[0]);return;}
    const cx=curr.left+curr.width/2,cy=curr.top+curr.height/2;
    let best=null,score=Infinity;
    for(const el of nodes){if(el===current)continue;
      const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const dx=x-cx,dy=y-cy;
      const primary=direction==='ArrowRight'?dx:direction==='ArrowLeft'?-dx:direction==='ArrowDown'?dy:-dy;
      if(primary<=5)continue;
      const secondary=direction==='ArrowLeft'||direction==='ArrowRight'?Math.abs(dy):Math.abs(dx);
      const candidate=primary+secondary*(secondary>primary*1.35?1.7:.7);
      if(candidate<score){score=candidate;best=el;}
    }
    moveFocusTo(best);
  }
  // Fire TV local player cannot open external browser windows. Playback controls stay in the embedded source.
  // Check again when Fire TV brings the app back to the foreground, without polling in the background.
  window.fireTvAppResume = () => { refreshRemoteConfig(); refreshFrameCatalog(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) {refreshRemoteConfig();refreshFrameCatalog();} });
  render();refreshRemoteConfig();refreshFrameCatalog();if(state.key)connectCatalog();
})();
