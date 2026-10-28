// Contrôle des chaînes : teste chaque flux (liste de lecture, puis premier segment vidéo)
// et écrit channels.json avec uniquement ce qui répond. Lancé chaque nuit par GitHub Actions.
// Usage : node tools/check.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parseM3U, addEntries, finalize } = require('../lib.js');

const PLAYLIST = 'https://iptv-org.github.io/iptv/index.m3u';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const TIMEOUT = 8000;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 120;
const MAX_PER_CHANNEL = 5;
const DEADLINE = Date.now() + 40 * 60 * 1000;

async function req(url, headers) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'User-Agent': UA, ...headers } });
    return { r, ac, timer };
  } catch (e) { clearTimeout(timer); throw e; }
}
async function getText(url) {
  const { r, timer } = await req(url);
  try {
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (/text\/html/i.test(ct)) return null;
    return { text: await r.text(), url: r.url || url };
  } finally { clearTimeout(timer); }
}
async function firstBytes(url) {
  const { r, ac, timer } = await req(url, { Range: 'bytes=0-2047' });
  try {
    if (!(r.status === 200 || r.status === 206)) return false;
    if (/text\/html/i.test(r.headers.get('content-type') || '')) return false;
    const reader = r.body.getReader();
    const { value } = await reader.read();
    ac.abort();
    return !!(value && value.length > 0);
  } catch (e) { return false; } finally { clearTimeout(timer); }
}
// Vrai si le flux HLS répond vraiment : playlist valide + premier segment téléchargeable.
async function probe(url, depth = 0) {
  const got = await getText(url);
  if (!got || !got.text.trimStart().startsWith('#EXTM3U')) return false;
  const lines = got.text.split(/\r?\n/).map(s => s.trim());
  if (got.text.includes('#EXT-X-STREAM-INF')) {
    if (depth > 1) return false;
    const i = lines.findIndex(l => l.startsWith('#EXT-X-STREAM-INF'));
    const next = lines.slice(i + 1).find(l => l && !l.startsWith('#'));
    return next ? probe(new URL(next, got.url).href, depth + 1) : false;
  }
  const seg = lines.find(l => l && !l.startsWith('#'));
  return seg ? firstBytes(new URL(seg, got.url).href) : false;
}
async function alive(url) {
  for (let i = 0; i < 2; i++) {
    try { if (await probe(url)) return true; } catch (e) { /* délai dépassé, réseau… */ }
    if (Date.now() > DEADLINE) throw new Error('Délai global dépassé');
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

async function main() {
  const root = path.join(__dirname, '..');
  const res = await fetch(PLAYLIST);
  if (!res.ok) throw new Error('Playlist inaccessible : ' + res.status);
  const map = new Map();
  addEntries(map, parseM3U(await res.text()), false);

  // On ne teste que les meilleurs flux de chaque chaîne
  const tasks = [];
  for (const c of map.values()) {
    const ord = c.u.map((_, i) => i).sort((a, b) => c.q[b] - c.q[a]).slice(0, MAX_PER_CHANNEL);
    c.u = ord.map(i => c.u[i]); c.q = ord.map(i => c.q[i]);
    c.u.forEach((u, i) => tasks.push({ c, u, i }));
  }
  console.log(`${map.size} chaînes, ${tasks.length} flux à tester`);

  const ok = new Set();
  let next = 0, done = 0;
  async function worker() {
    while (next < tasks.length) {
      const t = tasks[next++];
      if (await alive(t.u)) ok.add(t);
      if (++done % 500 === 0) console.log(`${done}/${tasks.length}, ${ok.size} valides`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  for (const c of [...map.values()]) {
    const keep = tasks.filter(t => t.c === c && ok.has(t));
    if (!keep.length) { map.delete(c.id); continue; }
    c.u = keep.map(t => t.u); c.q = keep.map(t => c.q[t.i]);
  }
  console.log(`${map.size} chaînes conservées`);

  // Chaînes ajoutées à la main (extra.m3u) : conservées telles quelles, sans test
  const extra = path.join(root, 'extra.m3u');
  if (fs.existsSync(extra)) addEntries(map, parseM3U(fs.readFileSync(extra, 'utf8')), true);

  const data = finalize(map);
  if (data.ch.length < 100) throw new Error('Trop peu de chaînes valides (' + data.ch.length + ') : fichier non écrit');
  fs.writeFileSync(path.join(root, 'channels.json'), JSON.stringify(data));
  console.log('channels.json écrit :', data.ch.length, 'chaînes');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { probe, alive };
