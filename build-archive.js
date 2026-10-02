#!/usr/bin/env node
/*
 * Photo Archive builder — runs on every Netlify deploy (see netlify.toml).
 *
 * Put each event's photos in its own folder:
 *   archive/photos/2025-12-06 Miklavz/
 *   archive/photos/2025-11-04 Melbourne Cup/
 * info.txt: line 1 = title; optional lines "sl: Slovenian title" and "cover: photo-file-name.jpg"
 *
 * Folder name = date (YYYY-MM-DD, YYYY-MM or YYYY) + event name.
 * Optional in a folder:
 *   cover.jpg  — used as the event's tile image (otherwise the first photo)
 *   info.txt   — line 1: title to show instead of the folder name
 *                lines 2+: a short description shown on the event page
 *
 * archive/order.txt — optional: folder names, one per line, to pin events to the top.
 *
 * Generates archive/index.html and one archive/<event>.html per folder.
 * No dependencies — plain Node.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ARCHIVE = path.join(ROOT, 'archive');
const PHOTOS = path.join(ARCHIVE, 'photos');
const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LOGO = '../images/ed502fafe657.jpg';

// Slovenian event titles (folder name → title). A line "sl: ..." in info.txt overrides.
const SL_TITLES = {
  'anzac-day':'Dan Anzac','australia-day':'Dan Avstralije','awards':'Nagrade in priznanja','boxing-day-bbq':'Piknik na Boxing Day',
  'bus-trip-to-oktoberfest':'Avtobusni izlet na Oktoberfest','chestnut-roasting':'Peka kostanja','club-work':'Delo v klubu',
  'denis-novato':'Denis Novato','ekaterina-leposa-preseren-day':'Ekaterina Leposa + Prešernov dan','folklore-dance-workshop':'Delavnica folklornega plesa',
  'function-room-setup':'Priprava dvorane','hearts-and-hands-function':'Prireditev Hearts and Hands','helen-blagne-preseren-day':'Helen Blagne + Prešernov dan',
  'international-womens-day':'Mednarodni dan žena','miklavz':'Miklavž','ministry-visit-from-slovenia':'Obisk ministrstva iz Slovenije',
  'multicultural-festival':'Multikulturni festival','natasa-konc-lorenzutti':'Nataša Konc Lorenzutti','new-years-eve':'Silvestrovo','pust':'Pust',
  'sewing-bee':'Šivalna delavnica','statehood-day':'Dan državnosti','working-bee':'Delovna akcija',
};
const MONTHS_SL = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'];
// bilingual text: both versions in the page, CSS shows the chosen one
const L = (en, sl) => `<span class="en">${en}</span><span class="sl">${sl}</span>`;
const plural = (n, one, two, few, many) => n % 100 === 1 ? one : n % 100 === 2 ? two : (n % 100 === 3 || n % 100 === 4) ? few : many;
const photosLabel = n => L(`${n} photo${n === 1 ? '' : 's'}`, `${n} ${plural(n,'fotografija','fotografiji','fotografije','fotografij')}`);
const eventsLabel = n => L(`${n} event${n === 1 ? '' : 's'}`, `${n} ${plural(n,'dogodek','dogodka','dogodki','dogodkov')}`);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const urlPath = (...parts) => parts.map(p => encodeURIComponent(p)).join('/');
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'event';

function parseFolder(name) {
  let m = name.match(/^(\d{4})-(\d{2})-(\d{2})[\s_-]+(.+)$/);
  if (m) return { sort: `${m[1]}${m[2]}${m[3]}`, date: `${+m[3]} ${MONTHS[+m[2]-1]} ${m[1]}`, dateSl: `${+m[3]}. ${MONTHS_SL[+m[2]-1]} ${m[1]}`, title: m[4] };
  m = name.match(/^(\d{4})-(\d{2})[\s_-]+(.+)$/);
  if (m) return { sort: `${m[1]}${m[2]}00`, date: `${MONTHS[+m[2]-1]} ${m[1]}`, dateSl: `${MONTHS_SL[+m[2]-1]} ${m[1]}`, title: m[3] };
  m = name.match(/^(\d{4})[\s_-]+(.+)$/);
  if (m) return { sort: `${m[1]}0000`, date: m[1], title: m[2] };
  return { sort: '00000000', date: '', title: name };
}

function loadEvents() {
  if (!fs.existsSync(PHOTOS)) return [];
  const used = new Set();
  return fs.readdirSync(PHOTOS, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
      const dir = path.join(PHOTOS, d.name);
      const files = fs.readdirSync(dir).filter(f => IMG_RE.test(f) && !f.startsWith('.')).sort(natural);
      if (!files.length) return null;
      const meta = parseFolder(d.name);
      let title = meta.title.replace(/[_]+/g, ' ').trim();
      let description = '';
      let titleSl = SL_TITLES[d.name.toLowerCase()] || '';
      let coverPick = '';
      const info = path.join(dir, 'info.txt');
      if (fs.existsSync(info)) {
        const lines = fs.readFileSync(info, 'utf8').split(/\r?\n/);
        if (lines[0].trim()) title = lines[0].trim();
        const slLine = lines.slice(1).find(l => /^sl\s*:/i.test(l.trim()));
        if (slLine) titleSl = slLine.replace(/^\s*sl\s*:\s*/i, '').trim();
        const coverLine = lines.slice(1).find(l => /^cover\s*:/i.test(l.trim()));
        if (coverLine) coverPick = coverLine.replace(/^\s*cover\s*:\s*/i, '').trim();
        description = lines.slice(1).filter(l => l !== slLine && l !== coverLine).join('\n').trim();
      }
      const coverFile = (coverPick && files.includes(coverPick) ? coverPick : null) || files.find(f => /^cover\.(jpe?g|png|webp)$/i.test(f)) || files[0];
      let slug = slugify(d.name); let n = 2;
      while (used.has(slug) || slug === 'index') slug = `${slugify(d.name)}-${n++}`;
      used.add(slug);
      return {
        folder: d.name, slug, title, titleSl: titleSl || title, date: meta.date, dateSl: meta.dateSl || meta.date, sort: meta.sort, description,
        photos: files.map(f => urlPath('photos', d.name, f)),
        files, cover: urlPath('photos', d.name, coverFile),
      };
    })
    .filter(Boolean)
    .sort((a, b) => rank(a) - rank(b) || b.sort.localeCompare(a.sort) || natural(a.title, b.title));
}

// archive/order.txt — one folder name per line; listed events show first, in that order.
// Anything not listed follows, newest date first, then A–Z.
const ORDER = (() => {
  const f = path.join(ARCHIVE, 'order.txt');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.toLowerCase());
})();
function rank(e) { const i = ORDER.indexOf(e.folder.toLowerCase()); return i === -1 ? ORDER.length : i; }

const CSS = `
:root{--blue:#1d3f6e;--blue-mid:#2a5298;--blue-pale:#f0f6fd;--gold:#c8a84b;--text:#1a2533;--text-mid:#344a63;--text-muted:#637d99;--border-light:#e3edf8;--bg:#fafbfd;--card:#fff}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0f1826;--card:#172338;--text:#e8eef6;--text-mid:#c3d0e0;--text-muted:#8ea3bc;--border-light:#243552;--blue-pale:#1a2a44}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
a{color:inherit}
header{background:#fff;border-bottom:1px solid #e3edf8;position:sticky;top:0;z-index:10}
.bar{max-width:1200px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#1d3f6e}
.brand img{width:42px;height:42px;border-radius:50%;object-fit:cover}
.brand b{font-family:'Playfair Display',serif;font-size:16px;line-height:1.2;display:block}
.brand small{font-size:11px;letter-spacing:.5px;color:#637d99;text-transform:uppercase}
.back{font-size:14px;font-weight:600;color:#1d3f6e;text-decoration:none;border:1px solid #ccdaec;border-radius:8px;padding:8px 14px;white-space:nowrap}
.back:hover{border-color:var(--gold)}
.lang{display:inline-flex;border:1px solid #ccdaec;border-radius:999px;overflow:hidden}
.lang button{all:unset;cursor:pointer;font-size:12.5px;font-weight:700;padding:6px 12px;color:#637d99}
.lang button.on{background:#1d3f6e;color:#fff}
.right{display:flex;align-items:center;gap:10px}
html[lang=sl] .en{display:none} html:not([lang=sl]) .sl{display:none}
@media (max-width:600px){.back .bt{display:none}}
.hero{background:linear-gradient(135deg,#1d3f6e 0%,#2a5298 100%);color:#fff;padding:44px 0 40px}
.hero-in{max-width:1200px;margin:0 auto;padding:0 16px}
.crumb{font-size:13px;opacity:.8;margin-bottom:10px}.crumb a{text-decoration:none}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(28px,5vw,42px);line-height:1.15;margin-bottom:8px}
.hero p{opacity:.9;max-width:720px}
.meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.chip{background:rgba(255,255,255,.14);border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:#1a1a1a;border:0;border-radius:8px;padding:11px 20px;font:700 14px 'DM Sans',sans-serif;cursor:pointer;text-decoration:none}
.btn[disabled]{opacity:.7;cursor:wait}
main{max-width:1200px;margin:0 auto;padding:32px 16px 64px}
.events{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
.ev{background:var(--card);border:1px solid var(--border-light);border-radius:12px;overflow:hidden;text-decoration:none;transition:transform .15s,box-shadow .15s;display:block}
.ev:hover{transform:translateY(-3px);box-shadow:0 8px 32px rgba(29,63,110,.12)}
.ev img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:var(--blue-pale)}
.ev div{padding:14px 16px 16px}
.ev .d{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)}
.ev h2{font-family:'Playfair Display',serif;font-size:19px;color:var(--text);margin:4px 0 2px;line-height:1.3}
.ev .n{font-size:13px;color:var(--text-muted)}
.search{width:100%;max-width:420px;padding:11px 14px;border:1px solid var(--border-light);border-radius:8px;font:15px 'DM Sans',sans-serif;margin-bottom:24px;background:var(--card);color:var(--text)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
@media (min-width:700px){.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}}
.ph{position:relative;border-radius:10px;overflow:hidden;background:var(--blue-pale);aspect-ratio:1}
.ph button{all:unset;cursor:zoom-in;display:block;width:100%;height:100%}
.ph img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s}
.ph:hover img{transform:scale(1.04)}
.ph a{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.6);color:#fff;border-radius:999px;width:34px;height:34px;display:grid;place-items:center;text-decoration:none;font-size:16px;opacity:0;transition:opacity .15s}
.ph:hover a,.ph a:focus{opacity:1}
@media (hover:none){.ph a{opacity:1}}
.empty{text-align:center;color:var(--text-muted);padding:60px 0}
.lb{position:fixed;inset:0;background:rgba(8,14,24,.97);display:none;z-index:50;align-items:center;justify-content:center}
.lb.open{display:flex}
.lb img{max-width:94vw;max-height:82vh;object-fit:contain;border-radius:6px;user-select:none}
.lb .top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;color:#fff;font-size:14px;gap:10px}
.lb .top div{display:flex;gap:8px}
.lb .ic{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:8px;padding:9px 14px;font:600 14px 'DM Sans',sans-serif;cursor:pointer;text-decoration:none}
.lb .nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.14);color:#fff;border:0;width:48px;height:48px;border-radius:50%;font-size:24px;cursor:pointer}
.lb .prev{left:14px}.lb .next{right:14px}
@media (max-width:600px){.lb .nav{display:none}.bar .brand small{display:none}}
footer{text-align:center;font-size:13px;color:var(--text-muted);padding:24px 16px 40px}
`;

function page({ title, description, heroHtml, body, script = '' }) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${LOGO}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>
<header><div class="bar">
  <a class="brand" href="../index.html#home"><img src="${LOGO}" alt=""><span><b>${L('Slovenian Australian<br>Association Canberra','Slovensko-avstralska<br>zveza Canberra')}</b><small>${L('Photo Archive','Foto arhiv')}</small></span></a>
  <div class="right"><div class="lang" role="group" aria-label="Language"><button id="b-en" onclick="setLang('en')">EN</button><button id="b-sl" onclick="setLang('sl')">SL</button></div>
  <a class="back" href="../index.html#memories-moments">← <span class="bt">${L('Back to website','Nazaj na spletno stran')}</span></a></div>
</div></header>
<section class="hero"><div class="hero-in">${heroHtml}</div></section>
<main>${body}</main>
<footer>© ${new Date().getFullYear()} Slovenian-Australian Association Canberra Inc · 19 Irving St, Phillip ACT 2606</footer>
<script>
function setLang(l){document.documentElement.lang=l;try{localStorage.setItem('saa_lang',l)}catch(e){}
document.getElementById('b-en').className=l==='sl'?'':'on';document.getElementById('b-sl').className=l==='sl'?'on':'';
document.querySelectorAll('[data-ph-sl]').forEach(function(i){if(!i.dataset.phEn)i.dataset.phEn=i.placeholder;i.placeholder=l==='sl'?i.dataset.phSl:i.dataset.phEn;});}
var _l='en';try{_l=localStorage.getItem('saa_lang')||'en'}catch(e){}setLang(_l);
function t(en,sl){return document.documentElement.lang==='sl'?sl:en;}
</script>
${script}
</body></html>`;
}

function buildIndex(events) {
  const total = events.reduce((n, e) => n + e.photos.length, 0);
  const cards = events.map(e => `
    <a class="ev" href="${e.slug}.html" data-q="${esc((e.title + ' ' + e.titleSl + ' ' + e.date).toLowerCase())}">
      <img loading="lazy" src="${e.cover}" alt="${esc(e.title)}">
      <div><span class="d">${L(esc(e.date), esc(e.dateSl))}</span><h2>${L(esc(e.title), esc(e.titleSl))}</h2><span class="n">${photosLabel(e.photos.length)}</span></div>
    </a>`).join('');
  const body = events.length ? `
    <input class="search" type="search" placeholder="Search events…" data-ph-sl="Iskanje dogodkov…" aria-label="Search events" oninput="var q=this.value.toLowerCase();document.querySelectorAll('.ev').forEach(function(c){c.style.display=c.dataset.q.indexOf(q)>-1?'':'none'})">
    <div class="events">${cards}</div>`
    : `<p class="empty">${L('Photos are on their way — check back soon.','Fotografije so na poti — preverite znova kmalu.')}</p>`;
  return page({
    title: 'Photo Archive — Slovenian Australian Association Canberra',
    description: 'Browse and download photos from events at the Slovenian Australian Association Canberra.',
    heroHtml: `<div class="crumb"><a href="../index.html#home">${L('Home','Domov')}</a> / ${L('Members','Člani')} / ${L('Photo Archive','Foto arhiv')}</div>
      <h1>${L('Photo Archive','Foto arhiv')}</h1>
      <p>${L('Browse and download photos from our club events, celebrations and gatherings over the years. Tap an event to see every photo — download them one at a time, or the whole set at once.','Prebrskajte in prenesite fotografije s klubskih prireditev, praznovanj in srečanj skozi leta. Tapnite dogodek za ogled vseh fotografij — prenesite jih posamezno ali vse naenkrat.')}</p>
      <div class="meta"><span class="chip">📁 ${eventsLabel(events.length)}</span><span class="chip">📷 ${photosLabel(total)}</span></div>`,
    body,
  });
}

function buildEvent(e) {
  const grid = e.photos.map((p, i) => `
    <div class="ph"><button onclick="openLb(${i})" aria-label="View photo ${i + 1}"><img loading="lazy" src="${p}" alt="${esc(e.title)} — photo ${i + 1}"></button><a href="${p}" download="${esc(e.files[i])}" aria-label="Download photo ${i + 1}" title="Download">⬇</a></div>`).join('');
  const script = `
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Photo viewer">
  <div class="top"><span id="lbc"></span><div><a class="ic" id="lbd" download>⬇ ${L('Download','Prenesi')}</a><button class="ic" onclick="closeLb()" aria-label="Close">✕</button></div></div>
  <button class="nav prev" onclick="step(-1)" aria-label="Previous">‹</button>
  <img id="lbi" alt="">
  <button class="nav next" onclick="step(1)" aria-label="Next">›</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
var P=${JSON.stringify(e.photos)},F=${JSON.stringify(e.files)},cur=0,lb=document.getElementById('lb'),lbi=document.getElementById('lbi');
function show(){lbi.src=P[cur];lbi.alt=${JSON.stringify(e.title)}+' — photo '+(cur+1);document.getElementById('lbc').textContent=(cur+1)+' / '+P.length;var d=document.getElementById('lbd');d.href=P[cur];d.setAttribute('download',F[cur]);}
function openLb(i){cur=i;show();lb.classList.add('open');document.body.style.overflow='hidden';}
function closeLb(){lb.classList.remove('open');document.body.style.overflow='';}
function step(n){cur=(cur+n+P.length)%P.length;show();}
document.addEventListener('keydown',function(ev){if(!lb.classList.contains('open'))return;if(ev.key==='Escape')closeLb();if(ev.key==='ArrowLeft')step(-1);if(ev.key==='ArrowRight')step(1);});
lb.addEventListener('click',function(ev){if(ev.target===lb)closeLb();});
var sx=null;lb.addEventListener('touchstart',function(ev){sx=ev.touches[0].clientX;},{passive:true});
lb.addEventListener('touchend',function(ev){if(sx===null)return;var dx=ev.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)step(dx<0?1:-1);sx=null;});
function downloadAll(btn){
  if(typeof JSZip==='undefined'){alert(t('Sorry, the download could not start. Please check your connection and try again.','Prenos se žal ni mogel začeti. Preverite povezavo in poskusite znova.'));return;}
  var label=btn.innerHTML,zip=new JSZip(),done=0;btn.disabled=true;
  Promise.all(P.map(function(p,i){return fetch(p).then(function(r){if(!r.ok)throw 0;return r.blob();}).then(function(b){zip.file(F[i],b);done++;btn.textContent=t('Preparing ','Pripravljam ')+done+' / '+P.length+'…';});}))
  .then(function(){btn.textContent=t('Zipping…','Stiskam…');return zip.generateAsync({type:'blob'});})
  .then(function(blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=${JSON.stringify(e.slug + '.zip')};document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},4000);})
  .catch(function(){alert(t('Sorry, something went wrong preparing the download. Please try again.','Pri pripravi prenosa je šlo nekaj narobe. Poskusite znova.'));})
  .then(function(){btn.disabled=false;btn.innerHTML=label;});
}
</script>`;
  return page({
    title: `${e.title} — Photo Archive — Slovenian Australian Association Canberra`,
    description: `${e.photos.length} photos from ${e.title}${e.date ? ', ' + e.date : ''}.`,
    heroHtml: `<div class="crumb"><a href="../index.html#home">${L('Home','Domov')}</a> / <a href="index.html">${L('Photo Archive','Foto arhiv')}</a> / ${L(esc(e.title), esc(e.titleSl))}</div>
      <h1>${L(esc(e.title), esc(e.titleSl))}</h1>
      ${e.description ? `<p>${esc(e.description).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="meta">${e.date ? `<span class="chip">📅 ${L(esc(e.date), esc(e.dateSl))}</span>` : ''}<span class="chip">📷 ${photosLabel(e.photos.length)}</span></div>
      <div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:10px"><button class="btn" onclick="downloadAll(this)">⬇ ${L('Download all','Prenesi vse')} (${e.photos.length})</button><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="index.html">← ${L('All events','Vsi dogodki')}</a></div>`,
    body: `<div class="grid">${grid}</div>`,
    script,
  });
}

// Remove previously generated pages, then write fresh ones
fs.mkdirSync(ARCHIVE, { recursive: true });
for (const f of fs.readdirSync(ARCHIVE)) if (f.endsWith('.html')) fs.unlinkSync(path.join(ARCHIVE, f));
const events = loadEvents();
fs.writeFileSync(path.join(ARCHIVE, 'index.html'), buildIndex(events));
for (const e of events) fs.writeFileSync(path.join(ARCHIVE, `${e.slug}.html`), buildEvent(e));
console.log(`Photo Archive: ${events.length} events, ${events.reduce((n, e) => n + e.photos.length, 0)} photos`);
