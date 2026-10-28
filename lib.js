// Logique partagée : utilisée par l'application (navigateur) et par le contrôle nocturne (tools/check.js).
(function (root) {
  'use strict';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const CAT_FR = {animation:'Animation',auto:'Auto',business:'Économie',classic:'Classiques',comedy:'Humour',cooking:'Cuisine',culture:'Culture',documentary:'Documentaires',education:'Éducation',entertainment:'Divertissement',family:'Famille',general:'Généraliste',interactive:'Interactif',kids:'Enfants',legislative:'Parlement',lifestyle:'Art de vivre',movies:'Films',music:'Musique',news:'Actualités',outdoor:'Nature',public:'Service public',relax:'Détente',religious:'Religion',science:'Science',series:'Séries',shop:'Shopping',sports:'Sport',travel:'Voyage',weather:'Météo'};

  const FOOT_STRONG = /foot|soccer|f[uú]t[eb]ol|calcio|fu(?:ß|ss)ball|voetbal|\bliga\b|laliga|ligue ?1|ligue ?2|premier league|serie ?a|bundesliga|uefa|fifa|champions league|europa league|bein|dazn|sky sport|supersport|sport ?tv|eleven sports|canal\+ ?foot|ol tv|om tv|psg tv|barça|barca tv|real madrid tv|benfica tv|sporting tv|mu ?tv|chelsea tv|lfc tv|arsenal tv|bayern/i;
  const FOOT_TEAMS = /\b(inter|milan|ajax|juventus|napoli|roma|lazio|marseille|lyon|monaco|psg|liverpool|manchester|arsenal|chelsea|tottenham|galatasaray|fenerbah|be[sş]ikta[sş]|porto|ol)\b/i;
  // Pays conservés : France (et territoires français) et États-Unis (anglophone). Modifiable ici.
  const FR_SET = new Set(['FR', 'YT', 'RE', 'GP', 'MQ', 'GF', 'PM', 'NC', 'PF', 'WF', 'BL', 'MF']);
  const KEEP = new Set([...FR_SET, 'US']);

  const flagOf = cc => cc.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  let regionName = null; try { regionName = new Intl.DisplayNames(['fr'], { type: 'region' }); } catch (e) {}

  function parseM3U(text) {
    const out = []; let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      if (line.startsWith('#EXTINF')) {
        const attrs = {};
        line.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return ''; });
        const bare = line.replace(/"[^"]*"/g, '');
        cur = { attrs, name: bare.slice(bare.lastIndexOf(',') + 1).trim(), ref: false };
      } else if (line.startsWith('#EXTVLCOPT')) {
        if (cur && /referrer|user-agent/i.test(line)) cur.ref = true;
      } else if (line[0] === '#') continue;
      else if (cur) { cur.url = line; out.push(cur); cur = null; }
    }
    return out;
  }

  // Ajoute des entrées M3U à la table des chaînes (regroupées par identifiant).
  // Retire d'emblée : non-HTTPS, en-têtes spéciaux, géo-bloqués, « Not 24/7 », contenus adultes.
  function addEntries(map, entries, custom) {
    for (const e of entries) {
      if (!e.url || !e.url.startsWith('https://') || e.ref) continue;
      if (/geo.?block|g[eé]o.?restrict|not 24\/7/i.test(e.name)) continue;
      const k = (e.attrs['group-title'] || '').split(';').map(s => s.trim().toLowerCase()).filter(x => x && x !== 'undefined');
      if (k.includes('xxx')) continue;
      const title = e.name.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').trim();
      if (!title) continue;
      const q = parseInt((e.name.match(/\((\d{3,4})p\)/) || [])[1]) || 0;
      const tid = (e.attrs['tvg-id'] || '').split('@')[0];
      const id = tid || (custom ? 'c:' : 'n:') + norm(title);
      let cc = ((tid.match(/\.([a-z]{2})$/i) || [])[1] || '').toUpperCase();
      if (cc === 'UK') cc = 'GB';
      if (!custom && !KEEP.has(cc)) continue;
      let c = map.get(id);
      if (!c) map.set(id, c = { id, n: title, a: '', c: cc, k: [], l: e.attrs['tvg-logo'] || '', u: [], q: [], fb: false });
      if (!c.q) c.q = c.u.map(() => 0);
      if (!c.u.includes(e.url)) { c.u.push(e.url); c.q.push(q); }
      for (const x of k) if (!c.k.includes(x)) c.k.push(x);
      if (!c.l && e.attrs['tvg-logo']) c.l = e.attrs['tvg-logo'];
    }
  }

  // Produit les données finales (tri des flux, catégories, pays, marqueurs football / îles)
  function finalize(map) {
    const out = [];
    for (const c of map.values()) {
      const q = c.q || c.u.map(() => 0);
      const ord = c.u.map((_, i) => i).sort((a, b) => q[b] - q[a]).slice(0, 4);
      c.u = ord.map(i => c.u[i]); delete c.q;
      c.fb = FOOT_STRONG.test(c.n) || (c.k.includes('sports') && FOOT_TEAMS.test(c.n));
      c.g = c.c === 'US' ? 'us' : FR_SET.has(c.c) ? 'fr' : '';
      out.push(c);
    }
    out.sort((a, b) => a.n.localeCompare(b.n, 'fr'));
    const catIds = [...new Set(out.flatMap(c => c.k))];
    const cats = catIds.map(id => ({ id, name: CAT_FR[id] || id.charAt(0).toUpperCase() + id.slice(1) })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const codes = [...new Set(out.map(c => c.c).filter(Boolean))];
    const countries = codes.map(code => { let name = code; try { name = (regionName && regionName.of(code)) || code; } catch (e) {} return { code, name, flag: flagOf(code) }; })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { t: Date.now(), ch: out, cats, countries };
  }

  const lib = { norm, CAT_FR, parseM3U, addEntries, finalize };
  root.ZapLib = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})(typeof self !== 'undefined' ? self : globalThis);
