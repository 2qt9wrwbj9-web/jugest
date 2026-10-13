/* JUGEST machine display-name authority. Keys are permanent identifiers; aliases are input-only. */
(function (root) {
  'use strict';
  const entries = Object.freeze({
    my: { full: 'マイジャグラーⅤ', short: 'マイⅤ', variants: ['マイジャグラーⅤ'], aliases: ['マイジャグラーV', 'マイジャグラー5', 'マイジャグV', 'マイジャグ5'] },
    my6: { full: 'マイジャグラーVI', short: 'マイVI', variants: ['マイジャグラーVI'], aliases: ['マイジャグラーⅥ', 'マイジャグラー6', 'マイジャグⅥ', 'マイジャグVI', 'マイジャグ6'] },
    im: { full: 'ネオアイムジャグラーEX', short: 'ネオアイム', variants: ['ネオアイムジャグラーEX'], aliases: ['ネオアイムジャグラー', 'ネオアイム'] },
    go: { full: 'ゴーゴージャグラー3', short: 'ゴージャグ3', variants: ['ゴーゴージャグラー3'], aliases: ['ゴーゴージャグラーⅢ', 'ゴージャグ3', 'ゴージャグⅢ'] },
    fk: { full: 'ファンキージャグラー2', short: 'ファンキー2', variants: ['ファンキージャグラー2'], aliases: ['ファンキージャグラーⅡ', 'ファンキー2', 'ファンキーⅡ'] },
    hp: { full: 'ハッピージャグラーV Ⅲ', short: 'ハッピーVⅢ', variants: ['ハッピージャグラーV Ⅲ'], aliases: ['ハッピージャグラーVⅢ', 'ハッピージャグラーVIII', 'ハッピージャグラーV3', 'ハッピーVⅢ', 'ハッピーVIII', 'ハッピーV3'] },
    gg: { full: 'ジャグラーガールズSS', short: 'ガールズSS', variants: ['ジャグラーガールズSS'], aliases: ['ジャグラーガールズ', 'ガールズSS'] },
    mr: { full: 'ミスタージャグラー', short: 'ミスター', variants: ['ミスタージャグラー'], aliases: ['ミスター'] },
    um: { full: 'ウルトラミラクルジャグラー', short: 'ウルミラ', variants: ['ウルトラミラクルジャグラー'], aliases: ['ウルトラミラクル', 'ウルミラ'] },
    // A single JUGEST key currently covers multiple coin-size/smart-slot product variants.
    // Keep the shared label neutral and preserve distinct manufacturer names as metadata.
    houou: { full: 'ハナハナホウオウ〜天翔〜', short: 'ホウオウ天翔', variants: ['ハナハナホウオウ〜天翔〜', 'ハナハナホウオウ〜天翔〜-30'], aliases: ['ハナハナホウオウ-天翔-', 'ハナハナホウオウ天翔', 'ホウオウ〜天翔〜', 'ホウオウ天翔'] },
    king: { full: 'キングハナハナ-30', short: 'キングハナハナ', variants: ['キングハナハナ-30'], aliases: ['キングハナハナ'] },
    dragon: { full: 'ドラゴンハナハナ〜閃光〜', short: 'ドラゴン閃光', variants: ['ドラゴンハナハナ〜閃光〜', 'ドラゴンハナハナ〜閃光〜-30', 'スマート沖スロ ドラゴンハナハナ〜閃光〜'], aliases: ['ドラゴンハナハナ-閃光-', 'ドラゴンハナハナ閃光', 'Lドラゴンハナハナ〜閃光〜'] },
    star: { full: 'スターハナハナ', short: 'スターハナハナ', variants: ['スターハナハナ-30', 'スマート沖スロ スターハナハナ'], aliases: ['スターハナハナ', 'Lスターハナハナ'] },
    newkingv: { full: 'ニューキングハナハナV', short: 'ニューキングV', variants: ['ニューキングハナハナV-30', 'スマート沖スロ ニューキングハナハナV'], aliases: ['ニューキングハナハナV', 'LニューキングハナハナV', 'スマスロニューキングハナハナV'] }
  });
  const keys = Object.freeze(Object.keys(entries));
  function token(value) {
    let text = String(value ?? '');
    try { text = text.normalize('NFKC'); } catch {}
    return text.toUpperCase().replace(/\s+/g, '').replace(/[‐‑‒–—―]/g, '-').replace(/[〜～~]/g, '~').replace(/[・･]/g, '');
  }
  // The VI and New King V forms intentionally precede their substring families.
  const matchOrder = ['my6', 'newkingv', ...keys.filter(key => key!=='my6' && key!=='newkingv')];
  const matchers = matchOrder.map(key => [key, [entries[key].full, ...entries[key].variants, ...entries[key].aliases].map(token)]);
  const api = Object.freeze({
    keys,
    entries,
    full: key => entries[key]?.full ?? null,
    short: key => entries[key]?.short ?? null,
    variants: key => entries[key]?.variants.slice() ?? [],
    aliases: key => entries[key]?.aliases.slice() ?? [],
    token,
    resolve: name => { const s=token(name); if(!s)return null; for(const [key,words] of matchers) if(words.some(word=>s.includes(word)))return key; return null; }
  });
  root.JugestMachineNames = api;
})(globalThis);
