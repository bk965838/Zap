// Explique pourquoi une chaîne est absente de Zap.
// Usage : node tools/why.js "TF1"        (nom ou identifiant, sans tenir compte des accents)
'use strict';
const { parseM3U, dropReason, norm } = require('../lib.js');
const { alive } = require('./check.js');
const PLAYLIST = 'https://iptv-org.github.io/iptv/index.m3u';

(async () => {
  const q = norm(process.argv.slice(2).join(' ').trim());
  if (!q) { console.log('Usage : node tools/why.js "nom de la chaîne"'); process.exit(1); }
  const res = await fetch(PLAYLIST);
  if (!res.ok) throw new Error('Playlist inaccessible : ' + res.status);
  const all = parseM3U(await res.text());
  const hit = all.filter(e => norm(e.name + ' ' + (e.attrs['tvg-id'] || '')).includes(q));
  if (!hit.length) { console.log(`Aucune entrée « ${q} » dans la playlist iptv-org : la chaîne n'y figure pas (ou sous un autre nom).`); return; }
  console.log(`${hit.length} entrée(s) trouvée(s) dans la playlist :\n`);
  for (const e of hit.slice(0, 40)) {
    const why = dropReason(e, false, { keepGeo: true });
    let verdict;
    if (why) verdict = '✗ écartée : ' + why;
    else verdict = (await alive(e.url).catch(() => false)) ? '✓ gardée et le flux répond' : '✗ écartée au contrôle : le flux ne répond pas depuis chez vous';
    console.log(`${e.name}  [${e.attrs['tvg-id'] || 'sans identifiant'}]\n  ${e.url.slice(0, 90)}\n  ${verdict}\n`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
