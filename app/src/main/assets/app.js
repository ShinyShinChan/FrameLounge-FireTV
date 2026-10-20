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
  const state = {
    route:'home', detail:null, playing:null, currentSeason:1,
    episodes:null, seasonLoading:false, search:'', searchResults:null,
    key:getStore('tmdbKey',''), domain:getStore('playerDomain','') || startingConfig.defaultSource,
    config:startingConfig, configUrl:getStore('configUrl',defaultConfigUrl), configChecked:getStore('configChecked',0), configStatus:'Using saved player settings',
    favorites:getStore('favorites',[]), history:getStore('history',[]),
    rows:null, loading:false, message:null, lastFocus:null, customSource:getStore('customSource','')
  };
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
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
  };
  function icon(name, size=22) { return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.spark}</svg>`; }
  const keyOf = t => t.type + ':' + t.id;
  const unique = (arr, limit=24) => { const seen=new Set(); return arr.filter(t=> { const k=keyOf(t); if(seen.has(k))return false; seen.add(k); return true; }).slice(0,limit); };
  function normalize(x, kind) {
    const type = kind || x.media_type || (x.first_air_date ? 'tv' : 'movie');
    if (!['movie','tv'].includes(type)) return null;
    return {
      id:x.id, type, title:x.title || x.name || 'Untitled', year:yearOf(x.release_date || x.first_air_date),
      genre:x.genres?.map(y=>y.name).join(' · ') || (type==='tv'?'Series':'Movie'),
      overview:x.overview || '', poster:x.poster_path || null, backdrop:x.backdrop_path || null,
      rating: Number.isFinite(x.vote_average) ? x.vote_average.toFixed(1) : null,
      seasonCount:x.number_of_seasons || 0, seasons:x.seasons || null, demo:false
    };
  }
  function mergeTitle(t) { if (!t || !t.id) return null; const id=keyOf(t), old=library.get(id); const next={...(old||{}),...t}; library.set(id,next); return next; }
  function poster(t, size='w342') { return t.poster ? `https://image.tmdb.org/t/p/${size}/${t.poster.replace(/^\//,'')}` : ''; }
  function backdrop(t) { return t.backdrop ? `https://image.tmdb.org/t/p/w1280/${t.backdrop.replace(/^\//,'')}` : ''; }
  function paint(t) { const h=(Number(t.id)*47)%360; return `--shade1:hsl(${h} 39% 23%);--shade2:hsl(${(h+43)%360} 48% 11%)`; }
  function navItem(id,label,ic) { return `<button class="nav-item ${state.route===id?'selected':''}" data-action="route" data-route="${id}" data-focus="nav-${id}">${icon(ic,24)}<span>${label}</span></button>`; }
  function shell(content) {
    app.innerHTML = `<div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">F<span>✦</span></div><div class="brand-words">FRAME<br><em>LOUNGE</em></div></div>
        <div class="sidebar-heading">DISCOVER</div>
        <nav class="nav">
          ${navItem('home','Home','home')}${navItem('movies','Movies','movies')}${navItem('series','Series','series')}
          ${navItem('search','Search','search')}${navItem('mylist','My List','list')}
        </nav>
        <div class="sidebar-bottom">${navItem('settings','Settings','settings')}
          <div class="source-stamp"><span class="online-dot"></span> ${state.key ? 'TMDB CONNECTED' : 'STARTER LIBRARY'}</div>
        </div>
      </aside>
      <main class="main"><div class="main-inner">${content}</div></main>
      <div id="overlay-root"></div>
      ${state.message ? `<div class="toast" role="status">${html(state.message)}</div>` : ''}
      <div class="remote-help">${icon('keyboard',16)} Use your Fire TV remote • Select to open • Back to return</div>
    </div>`;
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
  function card(t, i=0) {
    const img=poster(t);
    return `<button class="poster-card" data-action="detail" data-type="${t.type}" data-id="${t.id}" data-focus="title-${keyOf(t)}" aria-label="${html(t.title)}">
      <span class="poster-art" style="${paint(t)}">
        ${img?`<img loading="lazy" src="${html(img)}" alt="" onerror="this.style.display='none'">`:''}
        <span class="poster-sky"></span><span class="poster-type">${t.type==='tv'?'SERIES':'MOVIE'}</span>
        <span class="poster-letter">${html(t.title.slice(0,1).toUpperCase())}</span><span class="poster-title-art">${html(t.title)}</span>
      </span>
      <span class="poster-caption"><strong>${html(t.title)}</strong><small>${html(t.year)}${t.rating?` · ★ ${t.rating}`:''}</small></span>
    </button>`;
  }
  function row(title, items, id='') {
    if (!items || !items.length) return '';
    return `<section class="catalog-row"><div class="row-heading"><h2>${html(title)}</h2><span class="row-count">${items.length} titles</span></div>
      <div class="carousel-row" data-row="${html(id||title)}">${unique(items).map(card).join('')}</div></section>`;
  }
  function navPill(title, subtitle='') { return `<div class="top-pill">${icon('spark',15)} ${html(title)}${subtitle?`<span>${html(subtitle)}</span>`:''}</div>`; }
  function hero(t) {
    const bg=backdrop(t);
    return `<section class="hero" style="${paint(t)};${bg?`--hero-bg:url('${bg}');`:''}">
      <div class="hero-abstract"><div class="halo"></div><div class="planet"></div><div class="orbit"></div></div>
      <div class="hero-content">${navPill('TONIGHT’S FEATURE',state.key?'Powered by TMDB':'Explore the starter library')}
        <div class="hero-mini">${t.type==='tv'?'TV SERIES':'FEATURE FILM'} <i></i> ${html(t.year)} <i></i> ${html(t.genre)}</div>
        <h1>${html(t.title)}</h1><p class="hero-overview">${html(t.overview||'Find your next great watch.')}</p>
        <div class="hero-buttons"><button class="action-button primary" data-action="hero-play" data-id="${t.id}" data-type="${t.type}" data-focus="hero-play">${icon('play',22)} ${t.type==='tv'?'View Episodes':'Watch Now'}</button>
        <button class="action-button secondary" data-action="detail" data-id="${t.id}" data-type="${t.type}" data-focus="hero-details">${icon('info',22)} More Info</button></div>
      </div><div class="hero-bottom"></div>
    </section>`;
  }
  function starterRows(route) {
    const movies=movieSeed, shows=showSeed;
    if (route==='movies') return [
      ['Featured Films',movies.slice(0,13)], ['Sci-Fi & Beyond',movies.filter(t=>t.genre==='Sci-Fi'||t.genre==='Adventure')],
      ['Action & Heroes',movies.filter(t=>t.genre==='Action')], ['Animation For All Ages',movies.filter(t=>t.genre==='Animation')],
      ['Critically Loved',movies.filter(t=>['Drama','Crime','Thriller'].includes(t.genre))]
    ];
    if (route==='series') return [
      ['Featured Series',shows.slice(0,12)],['Epic Adventures',shows.filter(t=>['Fantasy','Sci-Fi','Action'].includes(t.genre))],
      ['Drama & Crime',shows.filter(t=>['Drama','Crime','Horror'].includes(t.genre))],['Comedy & Animation',shows.filter(t=>['Comedy','Animation'].includes(t.genre))]
    ];
    return [
      ['Trending Picks', [movies[3],shows[4],movies[23],shows[1],movies[2],shows[2],movies[22],movies[5],shows[0],movies[20]]],
      ['Movies Worth a Night In', movies.slice(0,14)],['Binge-Worthy Series',shows.slice(0,14)],
      ['Out of This World', movies.filter(t=>['Sci-Fi','Adventure','Fantasy'].includes(t.genre)).concat(shows.filter(t=>['Sci-Fi','Fantasy'].includes(t.genre)))],
      ['The Animation Station',movies.filter(t=>t.genre==='Animation').concat(shows.filter(t=>t.genre==='Animation'))]
    ];
  }
  function getRows(route) {
    const rows=starterRows(route);
    if (!state.rows) return rows;
    const remote=state.rows;
    if (route==='movies') return [
      ['Popular Movies',remote.popularMovies],['Top Rated Movies',remote.topMovies],['Sci-Fi',remote.scifi],['Action',remote.action],['Animation',remote.animation],...rows
    ];
    if (route==='series') return [
      ['Popular Series',remote.popularTV],['Top Rated Series',remote.topTV],['Drama Series',remote.dramaTV],...rows
    ];
    return [
      ['Trending Now',remote.trending],['Popular Movies',remote.popularMovies],['Binge-Worthy Series',remote.popularTV],
      ['Sci-Fi Worlds',remote.scifi],['Top Rated Movies',remote.topMovies],['Animation',remote.animation],...rows
    ];
  }
  function catalogScreen(route) {
    const history=historyTitles();
    const first = route==='home' ? (state.rows?.trending?.find(t=>t.type==='movie') || movieSeed[3])
      : route==='movies' ? (state.rows?.popularMovies?.[0] || movieSeed[2])
      : (state.rows?.popularTV?.[0] || showSeed[4]);
    const title=route==='movies'?'Movies':route==='series'?'Series':'Home';
    const rows=getRows(route);
    return `<div class="top-bar"><span>${icon('spark',17)} FRAME LOUNGE / ${title.toUpperCase()}</span><span class="top-date">${nowYear} EDITION</span></div>
      ${hero(first)}
      <div class="rows-wrap">
      ${route==='home' && history.length?row('Continue Watching · Recently Played',history):''}
      ${route==='home' && state.favorites.length?row('Your List',favoriteTitles()):''}
      ${!state.key?`<div class="setup-nudge"><span>${icon('info',22)}</span><div><strong>Discover thousands more titles.</strong><p>Add a free TMDB API key in Settings for live movie posters, fresh categories, search, ratings, and real episode lists. Sample titles work without it.</p></div><button data-action="route" data-route="settings" data-focus="setup-link">Set Up ${icon('chevron',16)}</button></div>`:''}
      ${rows.map(([name,items],idx)=>row(name,items,`${route}-${idx}`)).join('')}
      <div class="footer-note">Poster and title data: TMDB when connected. Playback: external FrameXTV embed. No video is hosted by Frame Lounge. Use sources you are authorized to access.</div>
      </div>`;
  }
  function historyTitles() { return state.history.map(h => library.get(h.key)||h.item).filter(Boolean).slice(0,14); }
  function favoriteTitles() { return state.favorites.map(k=>library.get(k)).filter(Boolean); }
  function myListScreen() {
    const favorites=favoriteTitles();
    return `<div class="top-bar"><span>FRAME LOUNGE / MY LIST</span></div>${header('PERSONAL COLLECTION','My List','Keep your favorites in one place on this Fire Stick.')}
      ${favorites.length?row('Saved for Later',favorites):`<div class="empty-state">${icon('list',48)}<h2>Your list is looking a little empty</h2><p>Open any title and choose “Add to My List.”</p><button class="action-button primary" data-action="route" data-route="home" data-focus="empty-home">Browse Titles</button></div>`}
      ${state.history.length?row('Recently Played',historyTitles()):''}`;
  }
  function searchScreen() {
    return `<div class="top-bar"><span>FRAME LOUNGE / SEARCH</span></div>${header('FIND SOMETHING GOOD','Search the Library',state.key?'Search movies and TV series from TMDB.':'Search starter titles. Connect TMDB in Settings for thousands more.')}
      <div class="search-box">${icon('search',26)}<input id="search-input" data-focus="search-input" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Movie or TV series title…" value="${html(state.search)}"><span>OK / SELECT</span></div>
      <div id="search-result-area">${searchResultsHtml()}</div>`;
  }
  function searchResultsHtml() {
    const terms=state.search.trim().toLowerCase();
    if (!terms) return row('Explore Popular Titles',unique([...movieSeed.slice(0,10),...showSeed.slice(0,10)]));
    let results=state.searchResults || [];
    const local=Array.from(library.values()).filter(t=>t.title.toLowerCase().includes(terms));
    results=unique([...results,...local],60);
    if (results.length) return row(`Search results for “${state.search}”`,results);
    return `<div class="empty-state"><h2>No matching titles yet</h2><p>${state.key?'Try another search term.':'Try another search term, or add a TMDB key to unlock the full catalog.'}</p></div>`;
  }
  function settingsScreen() {
    return `<div class="top-bar"><span>FRAME LOUNGE / SETTINGS</span></div>${header('MAKE IT YOURS','Settings','One-time setup. Your preferences are saved on this device.')}
      <section class="setting-panel"><div class="setting-title">${icon('movies',22)} Live Catalog · TMDB</div>
        <p>Enter your own TMDB API key once to load live movies, posters, genres, and TV episodes. It is saved locally on this Fire Stick and never placed in GitHub or inside the downloadable APK. A TMDB v3 API key or v4 read token works.</p>
        <div class="input-label">YOUR TMDB API KEY / READ ACCESS TOKEN</div>
        <div class="settings-control"><input id="api-key" data-focus="api-key" type="password" autocorrect="off" autocapitalize="none" spellcheck="false" autocomplete="off" placeholder="Paste or type your TMDB key" value=""><button class="action-button primary small" data-action="save-api" data-focus="save-api">Save &amp; Connect</button></div>
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
      <section class="setting-panel"><div class="setting-title">${icon('settings',22)} Storage & Information</div>
        <p>Favorites and recently played items are kept locally on your Fire Stick. This is an independent, unofficial personal interface, not affiliated with TMDB or FrameXTV.</p>
        <div class="settings-control"><button class="action-button secondary small" data-action="clear-history" data-focus="clear-history">Clear Watch History</button><button class="action-button secondary small" data-action="clear-list" data-focus="clear-list">Clear My List</button></div>
        <p class="setting-help">TMDB attribution: This product uses the TMDB API but is not endorsed or certified by TMDB. Video availability and playback are controlled by FrameXTV and its upstream providers. Streams may fail, be unsupported by Fire OS WebView, or be unavailable.</p>
      </section>`;
  }
  function detailScreen(t) {
    const isTV=t.type==='tv';
    const bg=backdrop(t); const favorite=state.favorites.includes(keyOf(t));
    return `<div class="detail-view"><div class="detail-hero" style="${paint(t)};${bg?`--hero-bg:url('${bg}');`:''}">
      <button class="breadcrumb" data-action="close-detail" data-focus="detail-back">${icon('back',21)} Back to ${state.route==='home'?'Home':state.route==='series'?'Series':state.route==='movies'?'Movies':state.route==='search'?'Search':'My List'}</button>
      <div class="detail-flex">
        <div class="detail-poster">${cardArt(t)}</div>
        <div class="detail-info"><div class="hero-mini">${isTV?'TV SERIES':'FEATURE FILM'} <i></i> ${html(t.year||'')} ${t.rating?`<i></i> ★ ${html(t.rating)}/10`:''}</div>
          <h1>${html(t.title)}</h1><div class="detail-genre">${html(t.genre||'Entertainment')}</div>
          <p class="detail-synopsis">${html(t.overview||'Open this title to view available playback sources.')}</p>
          <div class="hero-buttons"><button class="action-button primary" data-action="play" data-focus="detail-play">${icon('play',22)} ${isTV?'Play Selected Episode':'Watch Now'}</button>
            <button class="action-button secondary" data-action="favorite" data-focus="detail-fav">${icon(favorite?'check':'plus',21)} ${favorite?'In My List':'Add to My List'}</button></div>
          ${isTV?`<div class="detail-episode-selected">Selected: Season ${state.currentSeason}, Episode ${state.currentEpisode||1}</div>`:''}
        </div>
      </div>
      </div>${isTV?episodeSection(t):''}
      <div class="detail-bottom">Playback uses an external FrameXTV embed. Video playback is subject to provider availability and permissions.</div></div>`;
  }
  function cardArt(t) {
    const img=poster(t,'w500');
    return `<div class="poster-art poster-large" style="${paint(t)}">${img?`<img src="${html(img)}" alt="">`:''}<div class="poster-sky"></div><span class="poster-type">${t.type==='tv'?'SERIES':'MOVIE'}</span><span class="poster-letter">${html(t.title.slice(0,1))}</span><span class="poster-title-art">${html(t.title)}</span></div>`;
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
  function drawPlayer() {
    const t=state.playing; const isTV=t.type==='tv';
    const id=Number(t.id), season=Math.max(1,Number(state.currentSeason)||1), episode=Math.max(1,Number(state.currentEpisode)||1);
    const source = state.config.sources.find(x=>x.id===state.domain) || state.config.sources[0];
    const template=isTV?source.tv:source.movie;
    const path=template.split('{id}').join(String(id)).split('{season}').join(String(season)).split('{episode}').join(String(episode));
    const saved=state.history.find(h=>h.key===keyOf(t));
    const at=(saved?.time && Number.isFinite(saved.time) && saved.time>10)?'&t='+Math.floor(saved.time):'';
    const player=`${source.origin}${path}?autoplay=1&controls=1&muted=0${at}`;
    const target=$('#overlay-root');
    target.innerHTML=`<div class="player-view" id="player-view" role="dialog" aria-label="Video player">
      <iframe id="player-iframe" title="FrameXTV video player" src="${player}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="player-toolbar"><div><span class="player-kicker">NOW PLAYING</span><h2>${html(t.title)}</h2>${isTV?`<p>Season ${season} · Episode ${episode}</p>`:''}</div>
        <div class="player-actions"><button data-action="next-source" data-focus="player-switch">${icon('spark',16)} Try Other Source</button><button data-action="player-focus" data-focus="player-focus">${icon('play',16)} Player Controls</button><button data-action="close-player" data-focus="player-close">${icon('close',19)} Exit Player</button></div>
      </div><div class="player-hint">Select <strong>Player Controls</strong> to operate the embedded player. Press the Fire TV Back button to return.</div>
    </div>`;
    $('#player-iframe').addEventListener('load',()=>{ $('#player-view')?.classList.add('player-loaded'); });
    focusByKey('player-focus');
  }
  function render(focusKey) {
    let body;
    if (state.detail) body=detailScreen(state.detail);
    else if (state.route==='mylist') body=myListScreen();
    else if (state.route==='search') body=searchScreen();
    else if (state.route==='settings') body=settingsScreen();
    else body=catalogScreen(state.route);
    shell(body); focusDefault(focusKey);
  }
  function changeRoute(r) {
    if(!['home','movies','series','search','mylist','settings'].includes(r))return;
    state.route=r;state.detail=null;state.playing=null;state.lastFocus=null;render();
    if(r==='search') focusByKey('search-input');
  }
  async function openDetail(t) {
    if(!t)return;
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
    state.playing=state.detail;
    const key=keyOf(state.playing);state.history=state.history.filter(h=>h.key!==key);
    state.history.unshift({key,item:state.playing,at:Date.now(),time:0});state.history=state.history.slice(0,45);saveStore('history',state.history);
    drawPlayer();
  }
  function closePlayer() { if(!state.playing)return;const frame=$('#player-iframe');if(frame)frame.src='about:blank';state.playing=null;$('#overlay-root').innerHTML='';focusByKey('detail-play'); }
  function toggleFavorite(){ if(!state.detail)return;const k=keyOf(state.detail);if(state.favorites.includes(k))state.favorites=state.favorites.filter(x=>x!==k);else state.favorites.unshift(k);saveStore('favorites',state.favorites);render('detail-fav'); }
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
    if(state.playing)drawPlayer();
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
      if(state.route==='settings' && !state.playing)render('refresh-config');
      if(force)showMessage('Sources updated: '+config.version);
    }catch(err){
      state.configStatus='Update check unavailable ('+String(err.message||'network error').slice(0,100)+'); using saved sources';
      if(force)showMessage(state.configStatus);
      if(state.route==='settings' && !state.playing)render('refresh-config');
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
        trending:'trending/all/week?language=en-US', popularMovies:'movie/popular?language=en-US',
        popularTV:'tv/popular?language=en-US', topMovies:'movie/top_rated?language=en-US',
        topTV:'tv/top_rated?language=en-US', scifi:'discover/movie?with_genres=878&sort_by=popularity.desc',
        action:'discover/movie?with_genres=28&sort_by=popularity.desc',animation:'discover/movie?with_genres=16&sort_by=popularity.desc',
        dramaTV:'discover/tv?with_genres=18&sort_by=popularity.desc'
      };
      const entries=await Promise.all(Object.entries(queries).map(async ([name,path])=>{
        try { const d=await tmdb(path);const type=name==='trending'?null:name.toLowerCase().includes('tv')?'tv':'movie';
          return [name,unique((d.results||[]).map(x=>mergeTitle(normalize(x,type))).filter(Boolean),24)]; }
        catch(_) {return [name,[]];}
      }));
      state.rows=Object.fromEntries(entries);
      showMessage('TMDB connected. Live catalog loaded.');
    }catch(err){state.rows=null;showMessage('TMDB connection failed. Check your API key and network.');}
    finally{state.loading=false;if(!state.detail&&!state.playing)render();}
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
      state.searchResults=(d.results||[]).map(x=>mergeTitle(normalize(x))).filter(Boolean);
      refreshSearchResults();
    }catch(_){if(serial===searchSerial){state.searchResults=[];refreshSearchResults();}}
  }
  function refreshSearchResults() { const area=$('#search-result-area');if(area)area.innerHTML=searchResultsHtml(); }
  function playerCmd(action,params={}) { const frame=$('#player-iframe');if(!frame||!frame.contentWindow)return;const source=state.config.sources.find(x=>x.id===state.domain)||state.config.sources[0];try{frame.contentWindow.postMessage({action,...params},source.origin);}catch(_){} }
  let mediaPlaying=true;
  window.fireTvMediaKey = action => {
    if(!state.playing)return;
    if(action==='play'){playerCmd('play');mediaPlaying=true;}
    else if(action==='pause'){playerCmd('pause');mediaPlaying=false;}
    else if(action==='rewind')playerCmd('seekBy',{seconds:-10});
    else if(action==='forward')playerCmd('seekBy',{seconds:10});
    else {playerCmd(mediaPlaying?'pause':'play');mediaPlaying=!mediaPlaying;}
  };
  window.fireTvAppPause = () => { if(state.playing)playerCmd('pause'); };
  window.fireTvBack = () => {
    if(state.playing){closePlayer();return true;}
    if(state.detail){state.detail=null;state.episodes=null;render(state.lastFocus);return true;}
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
    if(action==='detail' || action==='hero-play'){
      const t=library.get(`${btn.dataset.type}:${btn.dataset.id}`);if(t){await openDetail(t);if(action==='hero-play'&&t.type==='movie')openPlayer();}return;
    }
    if(action==='close-detail'){window.fireTvBack();return;}
    if(action==='play'){openPlayer();return;}
    if(action==='favorite'){toggleFavorite();return;}
    if(action==='season'){state.currentSeason=Number(btn.dataset.season);state.currentEpisode=1;state.episodes=null;
      if(state.key)loadEpisodes(state.currentSeason);else render(`season-${state.currentSeason}`);return;}
    if(action==='episode'){state.currentEpisode=Number(btn.dataset.episode);render(`episode-${state.currentEpisode}`);return;}
    if(action==='set-episode'){const n=Number($('#ep-number')?.value);if(!Number.isInteger(n)||n<1||n>999){showMessage('Enter an episode number from 1 to 999.');return;}state.currentEpisode=n;render('detail-play');return;}
    if(action==='close-player'){closePlayer();return;}
    if(action==='player-focus'){$('#player-iframe')?.focus();showMessage('Player focused. Press Fire TV Back to leave playback.');return;}
    if(action==='domain'){setDomain(btn.dataset.domain);return;}
    if(action==='next-source'){switchSource();return;}
    if(action==='save-config'){const u=$('#config-url')?.value.trim()||'';state.configUrl=u;saveStore('configUrl',u);state.configChecked=0;render('refresh-config');refreshRemoteConfig(true);return;}
    if(action==='refresh-config'){refreshRemoteConfig(true);return;}
    if(action==='save-api'){
      const key=$('#api-key')?.value.trim()||'';if(!key){showMessage('Enter a TMDB API key first.');return;}
      state.key=key;saveStore('tmdbKey',key);state.rows=null;render('save-api');connectCatalog();return;}
    if(action==='clear-api'){state.key='';state.rows=null;saveStore('tmdbKey','');render('api-key');showMessage('TMDB key removed. Starter library active.');return;}
    if(action==='clear-history'){state.history=[];saveStore('history',[]);showMessage('Watch history cleared.');return;}
    if(action==='clear-list'){state.favorites=[];saveStore('favorites',[]);showMessage('My List cleared.');return;}
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
    if(ev.key==='Escape'||ev.key==='BrowserBack'){ev.preventDefault();window.fireTvBack();return;}
    if(ev.key==='Enter'){
      if(document.activeElement?.id==='search-input'){document.activeElement.blur();const first=$('#search-result-area [data-focus]');first?.focus();ev.preventDefault();return;}
      if(document.activeElement?.id==='ep-number'){state.currentEpisode=Math.max(1,Number(document.activeElement.value)||1);render('detail-play');ev.preventDefault();return;}
      const a=document.activeElement;if(a?.tagName==='BUTTON'){ev.preventDefault();a.click();return;}
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;
    if(state.playing && document.activeElement?.id==='player-iframe')return; // iframe owns the player's D-pad.
    if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      if(ev.key==='ArrowLeft'||ev.key==='ArrowRight')return;
    }
    ev.preventDefault(); spatialNavigate(ev.key);
  },true);
  function spatialNavigate(direction){
    const current=document.activeElement;const curr=current?.getBoundingClientRect?.();
    const nodes=$$('[data-focus]').filter(el=>{
      if(el.disabled || el.getAttribute('aria-hidden')==='true')return false;
      if(state.playing&&!$('#player-view')?.contains(el))return false;
      const r=el.getBoundingClientRect();return r.width>2 && r.height>2;
    });
    if(!nodes.length)return;
    if(!curr||!nodes.includes(current)){nodes[0].focus();return;}
    const cx=curr.left+curr.width/2,cy=curr.top+curr.height/2;
    let best=null,score=Infinity;
    for(const el of nodes){if(el===current)continue;
      const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const dx=x-cx,dy=y-cy;
      const primary=direction==='ArrowRight'?dx:direction==='ArrowLeft'?-dx:direction==='ArrowDown'?dy:-dy;
      if(primary<=5)continue;
      const secondary=direction==='ArrowLeft'||direction==='ArrowRight'?Math.abs(dy):Math.abs(dx);
      // Bias toward targets in the same visual row/column.
      const penalty=secondary>primary*1.35?secondary*1.7:secondary*.7;
      const candidate=primary+penalty;
      if(candidate<score){score=candidate;best=el;}
    }
    if(best){best.focus({preventScroll:true});best.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});}
  }
  // Fire TV local player cannot open external browser windows. Playback controls stay in the embedded source.
  // Check again when Fire TV brings the app back to the foreground, without polling in the background.
  window.fireTvAppResume = () => { refreshRemoteConfig(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRemoteConfig(); });
  render();refreshRemoteConfig();if(state.key)connectCatalog();
})();
