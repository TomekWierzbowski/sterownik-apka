/* ============================================================
 *  most_js.js - MOST W PRZEGLADARCE [D-221, 2026-09-06]
 * ============================================================
 *  SPIS TRESCI
 *   [1] po co: strona na AP sterownika 1:1 z mostem
 *   [2] tabele kontraktu (te same, co most.py): nastawy MN, wylaczniki,
 *       kody zaciskow, sposoby akcesoriow
 *   [3] dekodowanie: blok panelu + linia MN + rejestry -> pakiet "swiat"
 *       (port swiat_z_bloku / nastawy_z_mn / harm_z_rejestrow z most.py)
 *   [4] komendy makiety -> zapisy rejestrow (port komenda_na_rejestr,
 *       nastawa_na_rejestr, akc, wycisz-alarmy, ustaw-czas)
 *   [5] klient AP: /blok.txt co 1 s, /rej co 10 s, /cmd?adr=;
 *       podaje pakiety makiecie i przechwytuje fetch('/cmd?co=...')
 *
 *  [1] PO CO [Tomasz 2026-09-06: „strona na AP - da sie zrobic 1:1 jak
 *  wyglada i dziala most sadzawki?" - „pelne"]. Most (most.py) liczy
 *  pakiet stanu (74 pola) z trzech surowych rzeczy: bloku panelu (72
 *  slowa, ten sam, ktory idzie do Tab5), linii nastaw MN (128 pol)
 *  i kilku rejestrow. Sterownik na AP NIE liczy tego w C (bylaby to
 *  druga kopia 74 pol - zrodlo rozjazdow, patrz D-217), tylko wystawia
 *  surowe linie MB;/MN; jak po USB, a liczy TEN plik - ta sama makieta
 *  pod mostem na PC i pod AP na telefonie. Docelowo most.py zostaje
 *  samym transportem po USB, a jedyny zapis dekodowania jest tutaj.
 *
 *  ⚠ PRZEJSCIOWO DWA ZAPISY (Python w most.py i JS tutaj) - spina je
 *  sonda parytetu (makieta pod mostem liczy swiat z /blok.txt mostu
 *  i porownuje z /stan.json pole po polu). Rozjazd = blad w porcie.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------- [2] TABELE */
  /* MN_NASTAWY: [indeks MN, klucz makiety, skala, rodzaj]
     rodzaj: 'l' liczba, 'b' bool, 'z' liczba ze znakiem, [a,b] = wybor 0/1 */
  const MN_NASTAWY = [
    [0, 'dol_start', 1, 'l'], [1, 'dol_stop', 1, 'l'], [2, 'sucho_stop', 1, 'l'],
    [3, 'sonda_reakcja', 1, ['pracuj', 'stop']], [4, 'nadmiar_prog', 1, 'l'],
    [5, 'nadmiar_hist', 1, 'l'], [7, 'dol_maxs', 1, 'l'], [8, 'litr_cm', 10.0, 'l'],
    [9, 'uklad', 1, ['skimmer', 'przelew']], [10, 'dol_limit_l', 1, 'l'],
    [11, 'dol_awaria', 1, 'l'], [12, 'prefill_max', 1, 'l'],
    [13, 'geo_ksztalt', 1, ['prost', 'okrag']], [14, 'geo_a', 100.0, 'l'],
    [15, 'geo_b', 100.0, 'l'], [16, 'geo_d', 100.0, 'l'], [17, 'geo_gl', 100.0, 'l'],
    [18, 'geo_h', 100.0, 'l'], [19, 'dol_autokas', 1, 'b'],
    [20, 'pl_wstepna', 1, 'l'], [22, 'pl_koncowa', 1, 'l'], [23, 'pl_dolewka', 1, 'b'],
    [24, 'pl_ile', 1, 'l'], [25, 'pl_blokuj', 1, 'b'], [26, 'pl_wid_min', 1, 'l'],
    [27, 'pl_wid_max', 1, 'l'], [28, 'cA_prog', 100.0, 'l'], [29, 'cA_min', 1, 'l'],
    [30, 'cB_prog', 100.0, 'l'], [31, 'cC_prog', 100.0, 'l'], [32, 'cC_min', 1, 'l'],
    [34, 'kal_poz_zak', 1, 'l'], [35, 'kal_cis_zak', 100.0, 'l'],
    [36, 'kal_temp_kor', 10.0, 'z'], [37, 'grz_hist', 10.0, 'l'],
    [38, 'kal_poz_off', 1, 'z'], [39, 'kal_cis_off', 100.0, 'z'],
    [40, 'heat_tryb', 1, 'l'], [41, 'heat_prio', 1, 'l'], [42, 'heat_delta', 10.0, 'l'],
    [43, 'heat_min', 1, 'l'],
    [45, 'pl_powt', 1, 'l']        /* zalegle plukanie: ile prob (4560+8), 0 = nie rob [D-233] */
  ];
  /* MN_UKLAD: indeks MN -> [baza rejestru, przesuniecie]; adres = baza + obieg*20 + rel */
  const MN_UKLAD = [];
  for (let r = 0; r < 20; r++) MN_UKLAD.push([4520, r]);
  for (let r = 0; r < 8; r++) MN_UKLAD.push([4560, r]);
  for (let r = 0; r < 6; r++) MN_UKLAD.push([4600, r]);
  for (const r of [2, 5, 6, 7, 8, 9]) MN_UKLAD.push([4640, r]);
  for (let r = 0; r < 4; r++) MN_UKLAD.push([4680, r]);
  MN_UKLAD.push([4680, 4]);      /* [44] numer obiegu bloku - nie nastawa (rejestr nie istnieje) */
  MN_UKLAD.push([4560, 8]);      /* [45] zalegle plukanie: ile prob [D-233] */
  const WYLACZNIKI = [['cA_wl', 4024], ['cB_wl', 4028], ['cC_wl', 4030], ['uv_wl', 4044],
                      ['grz_wl', 4046], ['dol_wl', 4048], ['pluk_wl', 4050]];
  const MAPA_KOD_DO = { 1: 'Pompa filtracyjna', 2: 'Zawór głowicy płuczącej', 3: 'Zawór dolewania',
    4: 'Grzanie — styk 1', 5: 'Grzanie — styk 2', 6: 'Lampa UV', 7: 'Masaż wodny 1', 8: 'Masaż wodny 2',
    9: 'Masaż powietrzny 1', 10: 'Masaż powietrzny 2', 11: 'Atrakcja 1', 12: 'Atrakcja 2',
    13: 'Oświetlenie białe', 14: 'Oświetlenie barwne' };
  const MAPA_KOD_DI = { 1: 'Przełącznik w pozycji AUTO', 2: 'Przełącznik w pozycji HAND',
    3: 'Termik pompy filtracyjnej', 4: 'Przycisk masażu 1', 5: 'Przycisk masażu 2', 6: 'Przycisk światła',
    7: 'Roleta zamknięta', 8: 'Termik pompy masażu 1', 9: 'Termik pompy masażu 2',
    10: 'Wymuszenie zewnętrzne', 11: 'Zanik fazy' };
  const AKC_SPOSOBY = ['tylko z ekranu', 'przelacznik', 'na czas', 'na czas, bez przerwania', 'podtrzymanie'];

  /* ---------------------------------------------------------- [3] DEKODOWANIE */
  const i16 = x => (x >= 0x8000 ? x - 0x10000 : x);
  const bit = (v, n) => !!((v >> n) & 1);

  /* linie tekstowe jak po USB: "MB;a,b,c" -> tablica liczb albo null */
  function parsujLinie(txt, prefiks) {
    if (!txt) return null;
    for (const l of txt.split(/\r?\n/)) {
      if (!l.startsWith(prefiks)) continue;
      const w = l.slice(prefiks.length).split(',');
      const out = [];
      for (const x of w) { if (x === '') continue; const n = Number(x); if (!Number.isFinite(n)) return null; out.push(n); }
      return out;
    }
    return null;
  }

  function mapaNazwa(slowo, tabela, obiegiIle) {
    if (slowo === null || slowo === undefined) return null;
    const kod = slowo & 0xFF;
    if (kod === 0) return '';
    let nazwa = tabela[kod];
    if (nazwa === undefined) return 'kod ' + kod;
    if (obiegiIle > 1) nazwa += ' — obieg ' + (((slowo >> 8) & 3) + 1);
    return nazwa;
  }
  function mapaIoNazwy(slDo, slDi, obiegiIle) {
    obiegiIle = obiegiIle || 1;
    if (!slDo && !slDi) return [null, null];
    return [(slDo || []).map(w => mapaNazwa(w, MAPA_KOD_DO, obiegiIle)),
            (slDi || []).map(w => mapaNazwa(w, MAPA_KOD_DI, obiegiIle))];
  }
  function akcNastawyZMn(slowo) {
    if (slowo(68) === null) return null;
    const out = [];
    for (let k = 0; k < 16; k++) {
      const sp = slowo(68 + k * 2), cz = slowo(69 + k * 2);
      out.push({ sposob: sp, czas: cz,
        opis: (sp !== null && sp < AKC_SPOSOBY.length) ? AKC_SPOSOBY[sp] : (sp === null ? null : 'kod ' + sp) });
    }
    return out;
  }
  function funkcjeZMn(w, o, uvZapas) {
    if (w === null || w === undefined) return { uv: uvZapas, grz: null, dol: null, pluk: null };
    return { grz: bit(w, 0 + o), dol: bit(w, 2 + o), pluk: bit(w, 4 + o), uv: bit(w, 6 + o) };
  }
  function profilZSlow(slowa) {
    if (!slowa || slowa.every(s => s === null)) return null;
    let zn = '';
    for (const s of slowa) {
      if (s === null) break;
      const hi = (s >> 8) & 0xFF, lo = s & 0xFF;
      if (hi === 0) break;
      zn += String.fromCharCode(hi);
      if (lo === 0) break;
      zn += String.fromCharCode(lo);
    }
    return zn || null;
  }
  function dataBuilda(slowo) {
    if (!slowo) return null;
    const p2 = n => String(n).padStart(2, '0');
    return (2000 + (slowo >> 9)) + '-' + p2((slowo >> 5) & 0xF) + '-' + p2(slowo & 0x1F);
  }
  /* nastawy z MN: klucze makiety serwisu (N), w jej jednostkach */
  function nastawyZMn(n) {
    const out = {};
    for (const [i, klucz, skala, rodzaj] of MN_NASTAWY) {
      let x = n(i);
      if (x === null || x === undefined) continue;
      if (Array.isArray(rodzaj)) out[klucz] = x ? rodzaj[1] : rodzaj[0];
      else if (rodzaj === 'b') out[klucz] = !!x;
      else { if (rodzaj === 'z') x = i16(x); out[klucz] = skala !== 1 ? x / skala : x; }
    }
    /* POLE 45 = ile prob (bajt dolny) | wlacznik zaleglych << 8 [D-236] - jak most.py */
    if ('pl_powt' in out) { const v = out.pl_powt | 0; out.pl_powt = v & 0xFF; out.pl_zalegle = !!(v & 0x100); }
    /* POLE 128 = korekta temperatury powietrza x10 ze znakiem [D-282]; starszy firmware go nie ma -> pomijamy */
    { const kp = n(128); if (kp !== null && kp !== undefined) out.kal_pow_kor = i16(kp) / 10; }
    return out;
  }
  /* harmonogram z rejestrow: g(adr) -> liczba albo null; dzien 0 = poniedzialek */
  function harmZRejestrow(g, o) {
    const filt = [], pluk = [];
    for (let dz = 0; dz < 7; dz++) {
      const b8 = (dz + 1) % 7;
      const okna = [];
      for (let k = 0; k < 4; k++) {
        const a = 4300 + o * 60 + b8 * 8 + k * 2;
        const s = g(a), e = g(a + 1);
        if (s === null || s === undefined || !(s & 0x8000)) continue;
        okna.push([(s & 0x7FFF) / 60.0, (e || 0) / 60.0]);
      }
      filt.push(okna);
      const v = g(4500 + o * 10 + b8);
      pluk.push((v === null || v === undefined || !(v & 0x8000)) ? null : (v & 0x7FFF) / 60.0);
    }
    const sek = g(4560 + o * 20 + 1);
    return { filt: filt, pluk: pluk, sek: sek || 0 };
  }

  /* PAKIET STANU - port swiat_z_bloku(b, obieg) z most.py, 1:1.
     b = 72 slow bloku panelu, mn = tablica MN (albo null), o = obieg */
  function swiatZBloku(b, mn, o) {
    if (!b || b.length < 70) return null;
    const p = b.slice(10 + o * 30, 40 + o * 30);
    if (p.length < 20) return null;
    const v = mn || null;
    const nast = (i, dom) => (v && i < v.length) ? v[i] : (dom === undefined ? 0 : dom);
    const nastOb = (oo, i, dom) => (!v || v.length < 45 || v[44] !== oo) ? (dom === undefined ? 0 : dom) : nast(i, dom);
    const mnSlowo = i => (v && i < v.length) ? v[i] : null;
    const wyp = p[0], st = p[6];
    /* 64 bity alarmow: 4 slowa; BigInt, bo JS liczy bitowo na 32 bitach [D-108] */
    const alarmy = BigInt(b[4]) | (BigInt(b[5]) << 16n)
                 | (BigInt(b.length > 7 ? b[7] : 0) << 32n) | (BigInt(b.length > 8 ? b[8] : 0) << 48n);
    const almBit = n => !!((alarmy >> BigInt(n)) & 1n);
    const alm = bitBasen => almBit(bitBasen + o);
    const mapy = mapaIoNazwy([0, 1, 2, 3, 4, 5, 6, 7].map(i => mnSlowo(52 + i)),
                             [0, 1, 2, 3, 4, 5, 6, 7].map(i => mnSlowo(60 + i)));
    let obiegiIle = 0;
    for (const i of [0, 1]) if (b.length > 10 + i * 30 && (b[10 + i * 30] & 1)) obiegiIle++;
    return {
      typ: 'swiat',
      hoa: ({ 0: 'auto', 1: 'reka' })[p[14]] || 'stop',
      poziom: i16(p[3]),
      cis: p[4] / 100.0,
      temp: i16(p[1]) / 10.0,
      temp_set: i16(p[2]) / 10.0,
      grzeje: bit(st, 3) || bit(st, 4),
      grzanie_on: bit(st, 12),
      termik: alm(8),
      termikAkc: alm(34),
      awTempPowBrak: almBit(36),
      awsonda: alm(2), awmano: alm(4), awtemp: alm(6), awtempBrak: alm(28),
      /* [D-241] alarmy kwitowalne bez klucza - jak most.py */
      awDolew: alm(0), awBwNiesk: alm(12), awZuzycie: alm(19), awPrefill: almBit(o === 0 ? 21 : 32), awWyciek: alm(26),
      awRtc: almBit(17), awI2C: almBit(22), awFazy: almBit(23),
      ostrzCis: alm(30),
      zatrzask: bit(st, 7) ? (p[16] & 0xFF) : 0,
      uv_on: bit(st, 5),
      pluk: p[7] !== 0,
      bw_skip_alarm: alm(24), bw_skip_powod: p[17], bw_widelki_powod: p[18],   /* [D-245] */
      bw_pompa_pracowala: bit(st, 13), bw_zalegle: bit(st, 14),
      bw_czeka: bit(st, 10),        /* zadanie plukania odlozone do konca dolewania [D-227] */
      pluk_czas_s: nastOb(o, 21) || null,
      przezn: v ? nast(46 + o) : null,
      akc_ist: (nast(48) >> (8 * o)) & 0xFF,
      akc_prac: mnSlowo(116) !== null ? (mnSlowo(116) >> (8 * o)) & 0xFF : null,
      akc_zostalo: [0, 1, 2, 3, 4, 5, 6, 7].map(k => mnSlowo(100 + o * 8 + k)),
      akc_ust: mnSlowo(117) !== null ? (mnSlowo(117) >> (8 * o)) & 0xFF : 0,
      akc_term: mnSlowo(127) !== null ? (mnSlowo(127) >> (8 * o)) & 0xFF : 0,
      akc_wl: (nast(49) >> (8 * o)) & 0xFF,
      obieg_jest: !!(wyp & 1), obieg_nr: o, obiegi_ile: obiegiIle,
      pluk_faza: p[7],
      czas: (b[2] << 16) | b[3],
      pluk_s: p.length > 8 ? p[8] : 0,
      dolewka_proc: p.length > 9 ? p[9] : 0,        /* postep dopelnienia [%] (D-127/D-226) */
      wodaAwaria: bit(st, 11),
      brakuje: p[15], zuzycie24: p[10], parowanie24: i16(p[11]), ubytek_l_h: i16(p[12]),
      bw_zrzut: p[13],
      mies_zrzut: p.length > 27 ? (p[26] | (p[27] << 16)) : 0,
      rok_zrzut: p.length > 29 ? (p[28] | (p[29] << 16)) : 0,
      di_do: b.length > 9 ? b[9] : null,
      adc_poz: p.length > 23 ? p[22] : null, adc_cis: p.length > 23 ? p[23] : null,
      mapa_v: b[0], obiegi: b[1],
      obejscia: { sonda: bit(st, 8), mano: bit(st, 9) },
      poziomStan: { sucho: bit(st, 6), dolewa: bit(st, 2),
                    wymusz: o === 0 ? alm(16) : almBit(18), pompa: bit(st, 0) },
      progiPoz: { start: nastOb(o, 0, 250), stop: nastOb(o, 1, 350), sucho: nastOb(o, 2, 100),
                  nadmiar: nastOb(o, 4, 0), hist: nastOb(o, 5, 0), zak: nastOb(o, 34, 1000),
                  przelew: !!nastOb(o, 9, 0) },
      progiCis: { min: nastOb(o, 28) / 100.0, ostrz: nastOb(o, 31) / 100.0, kryt: nastOb(o, 30) / 100.0,
                  zak: (nastOb(o, 35) || 600) / 100.0 },
      nast: { pl_dolewka: !!nastOb(o, 23, 0), pl_ile: nastOb(o, 24, 0), pl_blokuj: !!nastOb(o, 25, 0),
              pl_wstepna: nastOb(o, 20, 10), pl_koncowa: nastOb(o, 22, 10) },
      limit_wody: 0,
      mapa_do: mapy[0], mapa_di: mapy[1],
      akc_nast: akcNastawyZMn(mnSlowo),
      jest_uv: bit(wyp, 7), jest_grz: bit(wyp, 5) || bit(wyp, 6), grz_styk: bit(wyp, 13),
      jest_dol: bit(wyp, 4), jest_pluk: bit(wyp, 3),
      jest_roleta: bit(wyp, 12),     /* styk rolety przypisany [D-234] */
      temp_pow: b.length > 71 ? i16(b[70]) / 10.0 : null,
      temp_pow_stan: b.length > 71 ? b[71] : 0,
      funkcje: funkcjeZMn(mnSlowo(50), o, bit(wyp, 7)),
      zwloka: { grz: p.length > 20 ? p[20] : 0, uv: p.length > 21 ? p[21] : 0 },
      profil: profilZSlow([0, 1, 2, 3, 4, 5, 6, 7].map(i => mnSlowo(118 + i))),
      fw_data: dataBuilda(mnSlowo(126))
    };
  }
  /* DODATKI - port most.dodatki(): harmonogram, nastawy (MN + wylaczniki), srednia miesieczna.
     rej = {adres: wartosc} z /rej; hist pomijamy (strona historii - komenda 12, osobne zadanie) */
  function dodatki(rej, mn, o) {
    const g = a => (a in rej ? rej[a] : null);
    const out = { harm: harmZRejestrow(g, o) };
    let nast = {};
    if (mn && mn.length >= 45 && mn[44] === o) nast = nastawyZMn(i => (i < mn.length ? mn[i] : null));
    for (const [kl, adr] of WYLACZNIKI) { const v = g(adr + o); if (v !== null) nast[kl] = !!v; }
    out.nastawy = nast;
    const lo = g(3061 + 2 * o), hi = g(3062 + 2 * o);
    if (lo !== null) out.sr_mies = ((hi || 0) << 16) | lo;
    return out;
  }
  /* obieg z bloku: pierwszy, ktory istnieje (most dostaje --obieg; na AP wynika z bloku) */
  function obiegZBloku(b) {
    if (b && b.length > 10 && (b[10] & 1)) return 0;
    if (b && b.length > 40 && (b[40] & 1)) return 1;
    return 0;
  }

  /* ---------------------------------------------------------- [4] KOMENDY -> REJESTRY */
  function akcNastawaNaRejestr(klucz, wart) {
    if (!klucz.startsWith('akc')) return null;
    const m = /^akc(\d+)_(sposob|czas)$/.exec(klucz);
    if (!m) return null;
    const nr = parseInt(m[1], 10);
    if (!(nr >= 0 && nr < 16)) return null;
    return [4100 + nr * 2 + (m[2] === 'sposob' ? 0 : 1), Math.round(parseFloat(wart)) & 0xFFFF];
  }
  function nastawaNaRejestr(klucz, wart, o) {
    const para = akcNastawaNaRejestr(klucz, wart);
    if (para) return para;
    const s = String(wart).trim().toLowerCase();
    for (const [k, adr] of WYLACZNIKI) if (k === klucz) return [adr + o, ['1', 'true', 'tak', 'on'].includes(s) ? 1 : 0];
    if (klucz === 'pl_zalegle') return [4560 + o * 20 + 9, ['1', 'true', 'tak', 'on'].includes(s) ? 1 : 0];   /* [D-236] */
    if (klucz === 'kal_pow_kor') return [4068, Math.round(parseFloat(wart) * 10) & 0xFFFF];   /* korekta temp. powietrza - GLOBALNA, bez obiegu [D-282] */
    for (const [i, k, skala, rodzaj] of MN_NASTAWY) {
      if (k !== klucz) continue;
      const [baza, rel] = MN_UKLAD[i];
      const adr = baza + o * 20 + rel;
      let w;
      if (Array.isArray(rodzaj)) w = (s === rodzaj[1]) ? 1 : 0;
      else if (rodzaj === 'b') w = ['1', 'true', 'tak', 'on'].includes(s) ? 1 : 0;
      else w = Math.round(parseFloat(wart) * (skala !== 1 ? skala : 1));
      return [adr, w & 0xFFFF];
    }
    return null;
  }
  /* zwraca {zapisy: [[adr, wart], ...]} albo {blad: '...'} */
  function komendaNaZapisy(co, wart, o) {
    const w = (wart === undefined || wart === null) ? '' : String(wart);
    if (co === 'rej') {
      const [a, v] = w.split(':'); const adr = parseInt(a, 10), val = parseInt(v, 10);
      if (!Number.isFinite(adr) || !Number.isFinite(val)) return { blad: 'format: wart="adres:wartosc"' };
      return { zapisy: [[adr, val]] };
    }
    if (co === 'akc') {
      const [k, s] = w.split(':'); const kan = parseInt(k, 10), st = parseInt(s, 10);
      if (!Number.isFinite(kan) || !Number.isFinite(st)) return { blad: 'format: wart="kanal:1/0"' };
      return { zapisy: [[4067, ((kan & 0xFF) << 8) | (st ? 1 : 0)]] };
    }
    if (co === 'nastawa') {
      const i = w.indexOf(':'); if (i < 0) return { blad: 'format: wart="klucz:wartosc"' };
      const para = nastawaNaRejestr(w.slice(0, i), w.slice(i + 1), o);
      return para ? { zapisy: [para] } : { blad: 'nieznana nastawa: ' + w.slice(0, i) };
    }
    if (co === 'temp-set') { const t = Math.max(10, Math.min(40, parseFloat(w))); return { zapisy: [[4000 + o, Math.round(t * 10)]] }; }
    if (co === 'grzanie') return { zapisy: [[4002 + o, (w === 'true' || w === '1') ? 1 : 0]] };
    if (co === 'kasuj-zatrzask') return { zapisy: [[4022 + o, 1]] };
    if (co === 'kasuj-awarie-wodna') return { zapisy: [[4052 + o, 1]] };
    if (co === 'reset-wody') return { zapisy: [[4054 + o, 1]] };
    if (co === 'plukaj') return { zapisy: [[4006 + o, 1]] };
    if (co === 'kasuj-alarm') return { zapisy: [[4008, parseInt(w, 10)]] };
    if (co === 'zdejmij-ochrony') return { zapisy: [[4062, parseInt(w, 10) & 0x7F]] };
    if (co === 'wycisz-alarmy') {
      let m; try { m = BigInt(w); } catch (e) { return { blad: 'wycisz-alarmy: oczekiwana liczba 64-bit' }; }
      return { zapisy: [0, 1, 2, 3].map(i => [4058 + i, Number((m >> BigInt(16 * i)) & 0xFFFFn)]) };
    }
    if (co === 'ustaw-czas') {
      /* most: unix = timegm(localtime) - sterownik chodzi na czasie lokalnym */
      const unix = /^\d+$/.test(w) ? parseInt(w, 10) : Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
      return { zapisy: [[4034, (unix >> 16) & 0xFFFF], [4035, unix & 0xFFFF]] };
    }
    if (['hoa', 'termik', 'termikm', 'przycisk', 'poz', 'cis', 'model', 'zrzut', 'parowanie', 'wy', 'stan', 'we',
         'mapa', 'spocz', 'czujnik', 'zakres'].includes(co))
      return { blad: 'komenda testera - na stronie ze sterownika nie ma testera' };
    return { blad: 'nieznana komenda: ' + co };
  }

  /* ---------------------------------------------------------- [5] KLIENT AP */
  const M = {
    tryb: null,            /* null = nieaktywny, 'ap' = strona ze sterownika */
    obieg: 0,
    ost: { mb: null, mn: null, t: null, k: null, rej: {} },
    /* liczy pakiet z surowych danych (uzywa tez sonda parytetu pod mostem) */
    swiatZ(mbTxt, mnTxt, rej, o) {
      const mb = Array.isArray(mbTxt) ? mbTxt : parsujLinie(mbTxt, 'MB;');
      const mn = Array.isArray(mnTxt) ? mnTxt : parsujLinie(mnTxt, 'MN;');
      if (!mb) return null;
      if (o === undefined || o === null) o = obiegZBloku(mb);
      const s = swiatZBloku(mb, mn, o);
      if (!s) return null;
      return Object.assign(s, dodatki(rej || {}, mn, o));
    },
    komendaNaZapisy, nastawaNaRejestr, nastawyZMn, harmZRejestrow, swiatZBloku, parsujLinie, dodatki, obiegZBloku,
    MN_NASTAWY, MN_UKLAD, WYLACZNIKI,

    /* pobierz rejestry /rej po 16 (jak most po USB) do M.ost.rej */
    async rejestry(o) {
      const zakresy = [[4300 + o * 60, 56], [4500 + o * 10, 7], [4560 + o * 20 + 1, 1], [4024, 28], [3061 + 2 * o, 2]];
      const c = Object.assign({}, M.ost.rej);
      for (const [adr, ile] of zakresy) {
        for (let start = adr; start < adr + ile; start += 16) {
          const n = Math.min(16, adr + ile - start);
          try {
            const r = await fetch('/rej?adr=' + start + '&ile=' + n, { cache: 'no-store' });
            const d = await r.json();
            if (d && Array.isArray(d.wartosci)) d.wartosci.forEach((x, i) => { if (x !== null) c[start + i] = x; });
          } catch (e) { return; }
        }
      }
      M.ost.rej = c;
    },
    /* jedna komenda: zapisy po kolei, wynik z /blok.txt (linia K;nr,adr,wart,wynik) */
    async wyslij(co, wart) {
      const t = komendaNaZapisy(co, wart, M.obieg);
      if (t.blad) return { ok: false, opis: t.blad };
      let ostOpis = '';
      for (const [adr, val] of t.zapisy) {
        let nr = 0;
        try {
          const r = await fetch('/cmd?adr=' + adr + '&wart=' + val, { cache: 'no-store' });
          const txt = await r.text();
          if (!r.ok) return { ok: false, opis: 'sterownik: ' + txt };
          const m = /;(\d+)/.exec(txt); nr = m ? parseInt(m[1], 10) : 0;
        } catch (e) { return { ok: false, opis: 'sterownik nie odpowiada: ' + e }; }
        /* wynik: petla logiki wykonuje kolejke w nastepnym ticku; czekamy max 2 s */
        let wynik = null;
        for (let i = 0; i < 20 && nr; i++) {
          await new Promise(res => setTimeout(res, 100));
          try {
            const r = await fetch('/blok.txt', { cache: 'no-store' }); const txt = await r.text();
            const k = parsujLinie(txt, 'K;');
            if (k && k[0] >= nr) { wynik = k; break; }
          } catch (e) { break; }
        }
        if (wynik && wynik[0] === nr && wynik[3] !== 0)
          return { ok: false, opis: 'sterownik ODMOWIL zapisu ' + adr + '=' + val + ' (kod ' + wynik[3] + ')' };
        ostOpis = 'rejestr ' + adr + ' <- ' + val + (wynik ? '' : ' (bez potwierdzenia)');
      }
      return { ok: true, opis: ostOpis };
    },
    /* start trybu AP: podaj(d) dostaje {polaczony, swiat, wiek_s} jak z most.html */
    start(podaj) {
      if (M.tryb) return;
      M.tryb = 'ap';
      /* przechwycenie fetch('/cmd?co=...') - makieta ma 9 miejsc, ktore wolaja most tak,
         jak most.html; tu tlumaczymy na rejestry i odpowiadamy tym samym JSON-em */
      const f0 = window.fetch.bind(window);
      window.fetch = function (u, opt) {
        const s = String(u);
        if (s.startsWith('/cmd?co=')) {
          const q = new URLSearchParams(s.slice(5));
          return M.wyslij(q.get('co'), q.get('wart')).then(r =>
            new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return f0(u, opt);
      };
      let licz = 0;
      const cykl = async () => {
        let txt = null;
        try { const r = await fetch('/blok.txt', { cache: 'no-store' }); if (r.ok) txt = await r.text(); } catch (e) { txt = null; }
        const mb = parsujLinie(txt, 'MB;'), mn = parsujLinie(txt, 'MN;'), t = parsujLinie(txt, 'T;');
        M.ost.mb = mb; M.ost.mn = mn; M.ost.t = t; M.ost.k = parsujLinie(txt, 'K;');
        if (mb) M.obieg = obiegZBloku(mb);
        if (licz % 10 === 0) await M.rejestry(M.obieg);
        licz++;
        /* wiek bloku: T;ms_od_MB,ms_od_MN,uptime - sterownik nadaje blok co ~1 s */
        const wiek = t ? t[0] / 1000 : null;
        const polaczony = !!mb && (wiek === null || wiek < 5);
        const swiat = polaczony ? M.swiatZ(mb, mn, M.ost.rej, M.obieg) : null;
        podaj({ polaczony: polaczony && !!swiat, swiat: swiat, wiek_s: wiek === null ? 0 : wiek });
        setTimeout(cykl, 1000);
      };
      cykl();
    }
  };
  /* wystawione dla makiety: dziennik zdarzeń tłumaczy numer rejestru na etykietę nastawy [D-295] */
  M.nastawaNaRejestr = (klucz, wart, o) => nastawaNaRejestr(klucz, wart, o);
  /* ---------------------------------------------------------- [6] KLIENT CHMURY (MQTT)
     [Tomasz 2026-09-08: „a gdyby apka budowała się na podstawie MQTT jak HMI?"]
     WEJŚCIA:  broker po WebSocket TLS (HiveMQ 8884), temat `basen/+/+/blok` -
               sterownik publikuje tam DOKŁADNIE to, co daje pod /blok.txt.
     CO Z CZEGO WYNIKA: ten sam swiatZ() co dla strony na AP; obiekt wybiera
               parametr ?obiekt= albo pierwszy, który się odezwie. Świeżość
               liczymy od ODBIORU pakietu, nie z linii T; (ta mówi o wieku
               bloku w sterowniku, nie o drodze przez chmurę).
     WYJŚCIA:  podaj({polaczony, swiat, wiek_s, obiekty}) - jak z mostu i z AP.
     ⛔ NIC NIE PUBLIKUJEMY. Każde fetch('/cmd?…') dostaje odmowę z powodem
        „podgląd przez chmurę - sterowanie z panelu w szafie" [D-47]. Kafle
        wyglądają 1:1, ale są martwe - i mówią dlaczego. */
  M.startMqtt = function (podaj, o) {
    if (M.tryb) return;
    M.tryb = 'mqtt';
    const Klient = window.Paho && (Paho.Client || (Paho.MQTT && Paho.MQTT.Client));
    if (!Klient) { podaj({ polaczony: false, swiat: null, wiek_s: null, blad: 'brak biblioteki MQTT (cdnjs)' }); return; }
    /*  KONTO OBIEKTU WIDZI TYLKO SWÓJ OBIEKT [D-306, Tomasz 2026-09-11 00:05: „rozumiem, że ten link prowadzi do
        sadzawki albo basenu"]. Użytkownik brokera = slug nazwy sterownika („Gliczarów wanna" → gliczarow-wanna);
        temat obiektu = 'basen/' + slug z PIERWSZYM myślnikiem zamienionym na '/' → 'basen/gliczarow/wanna' - taki sam
        prefiks wpisuje się w sterowniku (serwis → sieć). Konto bez myślnika (serwisowe: „sterownik") widzi wszystko.
        To filtr po stronie apki; twarde odcięcie tematów per konto da dopiero ACL na własnym Mosquitto. */
    if (!o.temat) { const u = String(o.user || ''); const i = u.indexOf('-');
      if (i > 0) { o.temat = 'basen/' + u.slice(0, i) + '/' + u.slice(i + 1); if (!o.obiekt) o.obiekt = o.temat; }
      else o.temat = 'basen/+/+'; }
    /*  KOMENDY PRZEZ BROKER [D-267, Tomasz: „apka nie musi mieć uprawnień, bo
        serwis za PIN-em, a reszta dla klienta"]. fetch('/cmd?co=…') z makiety
        tłumaczymy jak dla AP (komendaNaZapisy → lista zapisów rejestrów) i
        publikujemy na `<prefiks>/komenda` w formacie sterownika:
          t=<unix>;pin=<gdy trzeba>;w=<adr>:<wart>,…
        Wynik wraca tematem `wynik` (kod + zdanie) — pokazujemy go w pasku.
        PIN: pytamy raz, gdy sterownik odpowie kodem 3 (rejestr serwisowy),
        i trzymamy do zamknięcia karty. Klient (temperatura, grzanie, światło,
        atrakcje) nigdy o PIN nie jest pytany. */
    let pinSerwis = null, czekaWynik = null;
    /*  ID KOMENDY [D-289, audyt 3.8]: `wynik` nie mówił, na którą komendę odpowiada - dwie szybkie komendy
        i pierwsza dostawała „nie potwierdził w 5 s". Każda komenda niesie `id=`, sterownik odsyła je
        w `wynik` (i odsiewa powtórki - druga droga/dup QoS1 nie przestawia kanału dwa razy). Mapa
        oczekujących po id; `czekaWynik` zostaje dla starego firmware (wynik bez id).
        POMIAR W APCE (C6): czas komenda→wynik i komenda→pierwsza paczka zmian po nim idą do dziennika
        („PRZEZ CHMURĘ" na pasku) i do M.pomiar - żeby wiedzieć, jak jest NA TELEFONIE, nie na PC. */
    const oczekuja = new Map(); let idLicz = Math.floor(Math.random() * 9e5) * 1000;
    const nowyId = () => ++idLicz;
    M.pomiar = { wynik_ms: null, zmiana_ms: null, ile: 0 };
    let czekamZmiany = null;              /* {t0, co} - pierwsza paczka zm/blok po komendzie = jej skutek */
    const odnotujZmiane = () => { if (!czekamZmiany) return; const ms = Date.now() - czekamZmiany.t0;
      if (ms < 4000) { M.pomiar.zmiana_ms = ms; zapisz('zmiana po komendzie ' + czekamZmiany.co + ': ' + ms + ' ms'); } czekamZmiany = null; };
    /*  LUSTRO Z PEŁNEGO BLOKU I PACZEK ZMIAN [D-277, Tomasz: „jak Loxone - tylko rejestry, które
        uległy zmianie, co minutę wszystkie kontrolnie"]. Pełny blok (retained, co 60 s i na
        `zadanie`) niesie MB;/MN;/T; jak /blok.txt oraz R;<adr>,<ile>,<v>… (rejestry 3000+,
        4000+, 4300+, 4700+) i Z;<seq>,<unix>. Paczki `zm` {seq,t,mb:{i:v},mn:{i:v},r:{adr:v}}
        nakładamy na tablice obiektu. Luka w seq → prosimy o pełny (`zadanie`). Ekrany serwisu
        czytają /rej Z LUSTRA - bez pytania sterownika. */
    const HASLA_REJ = a => (a >= 4767 && a <= 4782) || (a >= 4800 && a <= 4815) || (a >= 4875 && a <= 4890) || (a >= 4970 && a <= 4985);
    const zastosujPelny = (pref, w, txt) => {
      const mb = parsujLinie(txt, 'MB;'), mn = parsujLinie(txt, 'MN;');
      if (mb) w.mb = mb; if (mn) w.mn = mn;
      const r = {};
      for (const l of txt.split(/\r?\n/)) if (l.startsWith('R;')) {
        const p = l.slice(2).split(','); const a0 = +p[0], n = +p[1];
        for (let i = 0; i < n && 2 + i < p.length; i++) r[a0 + i] = +p[2 + i];
      }
      if (Object.keys(r).length) w.r = r;
      const z = parsujLinie(txt, 'Z;');
      if (z && z.length) { w.seq = z[0]; if (z[1]) zegar[pref] = { czas: z[1], kiedy: Date.now() }; }
      w.txt = txt;
    };
    const zegar = {};                       // prefiks -> { czas: unix sterownika, kiedy: Date.now() odbioru }
    const f0 = window.fetch.bind(window);
    window.fetch = function (u, opt) {
      const s = String(u);
      if (s.startsWith('/rej')) {                                   /* rejestry z lustra [D-277] */
        const q = new URLSearchParams(s.slice(s.indexOf('?') + 1));
        const adr = +q.get('adr') || 0, ile = Math.max(1, +q.get('ile') || 1);
        const w = wybrany && obiekty[wybrany]; const out = []; let hasla = 1;
        for (let i = 0; i < ile; i++) { const v = (w && w.r) ? w.r[adr + i] : undefined; out.push(v === undefined ? null : v); if (HASLA_REJ(adr + i)) hasla = 0; }
        return Promise.resolve(new Response(JSON.stringify({ adr, ile, wartosci: out, hasla }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      /*  KARTA SD PRZEZ BROKER [D-297]: /pliki?kat= i /plik?kat=&nazwa=[&json=1] - to samo, co daje most po USB,
          tu przez `zadanie`=pliki:<kat> / plik:<kat>/<nazwa>:<od> i tematy `pliki`/`plik` (kawałki do końca). */
      if (s.startsWith('/pliki')) {
        const q = new URLSearchParams(s.slice(s.indexOf('?') + 1)); const kat = q.get('kat') || 'zdarzenia';
        const odp = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (!wybrany || !k || !k.isConnected()) return Promise.resolve(odp({ karta: null, pliki: [] }));
        return new Promise(res => { czekaPliki = { kat, res, t: setTimeout(() => { if (czekaPliki && czekaPliki.res === res) { czekaPliki = null; res(odp({ karta: null, pliki: [] })); } }, 8000) }; oglos('pliki:' + kat); }).then(r => r);
      }
      if (s.startsWith('/okres')) {               /* zdarzenia z okresu [D-298]: kawałki aż dalej=0 */
        const q = new URLSearchParams(s.slice(s.indexOf('?') + 1)); const kat = q.get('kat') || 'zdarzenia', od = +q.get('od') || 0, dok = +q.get('do') || 0;
        if (!wybrany || !k || !k.isConnected()) return Promise.resolve(new Response(JSON.stringify({ blad: 'brak połączenia' }), { status: 200 }));
        return new Promise(res => {
          czekaOkres = { kat, od, dok, poz: 0, linie: [], res, t: null };
          const nastepny = () => { oglos('okres:' + kat + ':' + od + ':' + dok + ':' + czekaOkres.poz);   /* poz = kursor z odpowiedzi [D-300] */
            czekaOkres.t = setTimeout(() => { if (czekaOkres && czekaOkres.res === res) { czekaOkres = null; res(new Response(JSON.stringify({ blad: 'sterownik nie odesłał okresu w 10 s' }), { status: 200 })); } }, 10000); };
          czekaOkres.nastepny = nastepny; nastepny();
        });
      }
      if (s.startsWith('/plik?')) {
        const q = new URLSearchParams(s.slice(s.indexOf('?') + 1)); const kat = q.get('kat') || 'zdarzenia', nazwa = q.get('nazwa') || '', json = q.get('json') === '1';
        if (!wybrany || !k || !k.isConnected() || !nazwa) return Promise.resolve(new Response(JSON.stringify({ blad: 'brak połączenia' }), { status: 200 }));
        return new Promise(res => {
          czekaPlik = { kat, nazwa, od: 0, tekst: '', res, json, t: null };
          const nastepny = () => { oglos('plik:' + kat + '/' + nazwa + ':' + czekaPlik.od);
            czekaPlik.t = setTimeout(() => { if (czekaPlik && czekaPlik.res === res) { czekaPlik = null; res(new Response(JSON.stringify({ blad: 'sterownik nie odesłał pliku w 10 s' }), { status: 200 })); } }, 10000); };
          czekaPlik.nastepny = nastepny; nastepny();
        });
      }
      if (!s.startsWith('/cmd')) return f0(u, opt);
      const q = new URLSearchParams(s.slice(s.indexOf('?') + 1));
      const co = q.get('co') || 'rej', wart = q.get('wart');
      const tr = komendaNaZapisy(co, wart, M.obieg);
      const odp = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (tr.blad) return Promise.resolve(odp({ ok: false, opis: tr.blad }));
      if (!wybrany || !k || !k.isConnected()) return Promise.resolve(odp({ ok: false, opis: 'brak połączenia z brokerem' }));
      const wyslij = pin => new Promise(res => {
        /* ZEGAR STEROWNIKA, nie telefonu: DS3231 chodzi w czasie lokalnym, telefon
           liczy UTC - 2 h różnicy odbijało każdą komendę kodem 2 („sprawdź zegar").
           Sterownik nadaje `czas` w `stan`; liczymy od niego + ile minęło u nas. */
        const zg = zegar[wybrany];
        const tSter = zg ? Math.floor(zg.czas + (Date.now() - zg.kiedy) / 1000) : Math.floor(Date.now() / 1000);
        const id = nowyId(), t0 = Date.now(), coTxt = co + (wart != null ? '=' + wart : '');
        const tresc = 't=' + tSter + ';id=' + id + (pin ? ';pin=' + pin : '') + ';w=' + tr.zapisy.map(z => z[0] + ':' + z[1]).join(',');
        const msg = new Paho.Message(tresc); msg.destinationName = wybrany + '/komenda'; msg.qos = 1;
        oczekuja.set(id, { res, t0, co: coTxt }); czekaWynik = res;
        czekamZmiany = { t0, co: coTxt };
        k.send(msg);
        setTimeout(() => { if (oczekuja.has(id)) { oczekuja.delete(id); if (czekaWynik === res) czekaWynik = null;
                                                   zapisz('bez wyniku 5 s: ' + coTxt); res({ ok: false, opis: 'sterownik nie potwierdził komendy w 5 s' }); } }, 5000);
      });
      return wyslij(pinSerwis).then(r => {
        if (r.kod === 3 && !pinSerwis) {           // rejestr serwisowy - raz zapytaj o PIN i powtórz
          const p = prompt('Ta zmiana wymaga PIN-u serwisowego sterownika:', '');
          if (!p) return odp({ ok: false, opis: 'bez PIN-u serwisowego' });
          pinSerwis = p;
          return wyslij(pinSerwis).then(r2 => { if (r2.kod === 3) pinSerwis = null; return odp(r2); });
        }
        return odp(r);
      });
    };
    const obiekty = {};                 /* prefiks -> {txt, kiedy, status} */
    const zdarzenia = {};               /* prefiks -> {ile, zgubione, wpisy[[czas,kat,kod,zr,ob,a,b,c]]} [D-295] */
    let czekaPliki = null, czekaPlik = null, czekaOkres = null;   /* prośby o listę / plik / okres z karty SD [D-297/298] */
    let prosZdOst = 0;
    /* prośba o pamięć zdarzeń (RAM sterownika); przed połączeniem NIE liczy się jako próba - inaczej wstępne wczytanie
       ze startu apki (D-308) przepadało i dziennik czekał 15 s na kolejną */
    M.prosZdarzenia = () => { if (!wybrany || !k || !k.isConnected()) return; const t = Date.now(); if (t - prosZdOst < 15000) return; prosZdOst = t; oglos('zdarzenia'); };
    /*  STAN BROKERA I WYDAWCÓW NA PASKU [Tomasz 2026-09-09: „apka powinna mieć na górze
        status połączenia z brokerem i status wydawców"]. Trzy rzeczy, trzy źródła:
        - broker: zdarzenia własnego klienta (łączę / połączony / odmowa / zerwane);
        - wydawca (sterownik): temat `status` z flagą retained - „online" pisze sterownik
          po połączeniu, „offline" pisze BROKER z testamentu, gdy sterownik zamilknie
          (20a4_siec_mqtt.h). „offline" jest więc wiarygodne także, gdy płyta padła;
        - świeżość: wiek ostatniego `blok` danego obiektu.
        Wszystko idzie w KAŻDYM podaj(): broker{stan,opis}, wydawcy{prefiks→{status,wiek_s}},
        żeby pasek nie musiał składać stanu z kilku różnych wywołań. */
    let broker = { stan: 'laczy', opis: 'łączę z brokerem…' };
    /*  DZIENNIK ZDARZEŃ KLIENTA [D-278, Tomasz 2026-09-09: „musimy śledzić, co się dzieje, logami"]:
        ostatnie 60 zdarzeń (połączenia, zerwania, żądania, pełne bloki, luki seq) - pasek pokazuje
        je po dotknięciu „PRZEZ CHMURĘ". Do tego znaczniki czasu ostatnich zdarzeń, bo „pakiet N s
        temu" nie mówi, CZEGO brak: bloku, paczki czy odpowiedzi na żądanie. */
    M.dziennik = [];
    const ost = { zm: 0, blok: 0, zadanie: 0 };
    const zapisz = txt => { M.dziennik.push({ t: Date.now(), txt }); if (M.dziennik.length > 60) M.dziennik.shift(); };
    zapisz('start klienta ' + (window.APKA_WERSJA || '(bez wersji)') + ' → ' + o.host);
    const wydawcy = () => { const w = {}; for (const p in obiekty)
      w[p] = { status: obiekty[p].status || '?', wiek_s: obiekty[p].kiedy ? (Date.now() - obiekty[p].kiedy) / 1000 : null }; return w; };
    let czekamPoPowrocie = false;        /* od powrotu na ekran / zerwania do pierwszej paczki [D-279] */
    const wspolne = () => ({ obiekty: Object.keys(obiekty), obiekt: wybrany, broker: broker, wydawcy: wydawcy(), ost: ost, dziennik: M.dziennik, wersja: window.APKA_WERSJA || '',
                             lacze: czekamPoPowrocie || broker.stan !== 'ok',
                             blad: (broker.stan === 'ok' || broker.stan === 'laczy') ? null : broker.opis });
    /* ostatnio wybrany obiekt pamietany w telefonie - przy dwu obiektach apka otwiera ten, na ktory patrzono */
    const pamiec = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    let wybrany = o.obiekt || pamiec('mqtt_obiekt') || null;
    const cid = 'hmi-' + Math.random().toString(16).slice(2, 10);
    const k = new Klient(o.host, o.port || 8884, '/mqtt', cid);
    /*  `nowe` [D-280]: prawda tylko, gdy oddaj() woła świeża paczka (zm/blok) albo zmiana obiektu.
        Cykliczne oddaj() co 1 s liczy wiek i stan brokera, ale ekran NIE dostaje wtedy świata -
        stare lustro potwierdzało żądanie kafla (bylo=null) i światło mignęło „zgaszone". */
    const oddaj = (nowe) => {
      const w = wybrany && obiekty[wybrany];
      if (!w || !w.txt) { podaj(Object.assign({ polaczony: false, swiat: null, wiek_s: null }, wspolne())); return; }
      const mb = w.mb || parsujLinie(w.txt, 'MB;'), mn = w.mn || parsujLinie(w.txt, 'MN;');
      M.ost.rej = w.r || {};                 /* rejestry z lustra - harmonogram, wyłączniki, sieć, pilot */
      const wiek = (Date.now() - w.kiedy) / 1000;
      const ob = mb ? obiegZBloku(mb) : 0;
      M.ost.mb = mb; M.ost.mn = mn; M.obieg = ob;
      const swiat = mb ? M.swiatZ(mb, mn, M.ost.rej, ob) : null;
      if (swiat && zdarzenia[wybrany]) swiat.zdarzenia = zdarzenia[wybrany];   /* dziennik zdarzeń do ekranu serwisu [D-295] */
      /* zasiew = liczby z retained bloku (0-60 s stare): ekran je pokazuje pod zasłoną „pobieram stan…", nie pod ciemną planszą [D-281] */
      podaj(Object.assign({ polaczony: !!swiat && wiek < 3 * (o.okres_s || 30) && broker.stan === 'ok', swiat, wiek_s: wiek, nowe: !!nowe, zasiew: !!(w && w.zasiew) }, wspolne()));
    };
    /*  OBECNOŚĆ: sterownik nadaje tylko, gdy ktoś patrzy — mówimy mu co 20 s,
        w jakim tempie (ms); po zamknięciu karty milczy sam po 60 s. Przy
        zamykaniu strony wysyłamy 0 = „przestaję patrzeć", żeby nie czekał. */
    const tempo = o.tempo_ms || 1000;
    const oglos = v => { if (!wybrany || !k || !k.isConnected()) return;
      const m = new Paho.Message(String(v)); m.destinationName = wybrany + '/zadanie'; k.send(m); ost.zadanie = Date.now(); if (v === 'pelny') zapisz('żądanie pełnego bloku'); };
    setInterval(() => oglos(tempo), 20000);
    /* `zadanie`=0 przy pagehide ZDJĘTE [D-287]: jeden schodzący do tła podglądacz gasił strumień pozostałym; sterownik gaśnie sam 60 s po ostatnim odnowieniu */
    /*  WZNOWIENIE PODGLĄDU BEZ CZEKANIA [2026-09-09, Tomasz: „jak nie dostanie pakietu na czas,
        to brak połączenia"]. Telefon w tle dławi zegary JS: `zadanie` nie odnawia się, sterownik
        po 60 s milknie, a po powrocie apki najbliższe odnowienie było dopiero za ≤ 20 s -
        tyle trwało „nie nadaje". Teraz: powrót karty na ekran = `zadanie` od razu; a gdy
        broker jest, a blok wybranego obiektu spóźnia się > 4 s - też od razu (nie częściej
        niż co 4 s). */
    let ostOglos = 0;
    const oglosTeraz = () => { const t = Date.now(); if (t - ostOglos < 4000) return; ostOglos = t; oglos(tempo); };
    /*  SZYBKI POWRÓT PO TLE [D-279, Tomasz 2026-09-09: „po powrocie do okna jest rozłączony, ponowne
        łączenie trwa 5–10 s"]. Android zamyka gniazdo w tle; Paho po zerwaniu odczekuje odstęp, który
        po każdej nieudanej próbie w tle ROŚNIE (1→2→4… s), więc po powrocie czekało się na jego zegar.
        Teraz: powrót na ekran = jeśli nie połączony, connect() natychmiast (Paho odrzuci, gdy właśnie
        łączy — łapiemy), a do pierwszej paczki zasłona „łączę ponownie…" zamiast starych liczb bez
        słowa. Utrzymania połączenia w tle przeglądarka nie da - to granica PWA, nie nasza. */
    document.addEventListener('visibilitychange', () => {
      const widoczna = document.visibilityState === 'visible';
      zapisz(widoczna ? 'powrót na ekran' : 'w tle');
      if (!widoczna) return;
      czekamPoPowrocie = true; oddaj();
      if (k && !k.isConnected()) {
        broker = { stan: 'laczy', opis: 'łączę ponownie…' };
        try { k.connect(opcje); zapisz('połączenie od razu po powrocie'); } catch (e) { zapisz('connect po powrocie: ' + (e && e.message || e)); }
        oddaj();
      } else oglosTeraz();
    });
    window.addEventListener('focus', oglosTeraz);
    setInterval(() => { const w = wybrany && obiekty[wybrany];
      if (broker.stan === 'ok' && w && w.kiedy && Date.now() - w.kiedy > 4000) oglosTeraz(); }, 1000);
    k.onMessageArrived = m => {
      const cz = m.destinationName.split('/');
      const rodzaj = cz[cz.length - 1];
      if (rodzaj === 'stan') {
        try { const s = JSON.parse(m.payloadString); if (s && s.czas) zegar[cz.slice(0, -1).join('/')] = { czas: s.czas, kiedy: Date.now() }; } catch (e) {}
        return;
      }
      if (rodzaj === 'pliki') {                     /* lista plików z karty [D-297]: "#kat\nnazwa;rozmiar\n..." albo "!brak karty" */
        if (!czekaPliki) return; const c = czekaPliki; czekaPliki = null; clearTimeout(c.t);
        const l = m.payloadString.split('\n').filter(x => x.trim()); const brak = l.some(x => x[0] === '!');
        const pliki = l.filter(x => x[0] !== '#' && x[0] !== '!').map(x => { const [nazwa, rozmiar] = x.split(';'); return { nazwa, rozmiar: +rozmiar }; }).sort((a, b) => a.nazwa < b.nazwa ? 1 : -1);
        c.res(new Response(JSON.stringify({ karta: !brak, pliki }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return;
      }
      if (rodzaj === 'okres') {                     /* "#kat;od;do;pomin;n;dalej\n<linie>" [D-298] */
        if (!czekaOkres) return; const c = czekaOkres; clearTimeout(c.t);
        const nl = m.payloadString.indexOf('\n'); const nag = m.payloadString.slice(1, nl).split(';'); const n = +nag[4], dalej = +nag[5], nast = +nag[6] || 0;
        if (n < 0) { czekaOkres = null; c.res(new Response(JSON.stringify({ blad: 'brak karty' }), { status: 200 })); return; }
        if (+nag[3] === c.poz) { c.linie = c.linie.concat(m.payloadString.slice(nl + 1).split('\n').filter(x => x.trim())); c.poz = nast; }
        if (dalej && nast) { c.nastepny(); return; }
        czekaOkres = null; c.res(new Response(JSON.stringify({ kat: c.kat, od: c.od, do: c.dok, linie: c.linie }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return;
      }
      if (rodzaj === 'plik') {                      /* kawałek pliku: "#kat/nazwa;rozmiar;od;n\n<linie>" */
        if (!czekaPlik) return; const c = czekaPlik; clearTimeout(c.t);
        const nl = m.payloadString.indexOf('\n'); const nag = m.payloadString.slice(1, nl).split(';');
        const rozmiar = +nag[1], od = +nag[2], n = +nag[3]; const dane = m.payloadString.slice(nl + 1);
        if (n < 0) { czekaPlik = null; c.res(new Response(JSON.stringify({ blad: 'brak pliku albo karty' }), { status: 200 })); return; }
        if (od === c.od) { c.tekst += dane; c.od = od + n; }
        if (n > 0 && c.od < rozmiar) { c.nastepny(); return; }
        czekaPlik = null;
        if (c.json) c.res(new Response(JSON.stringify({ kat: c.kat, nazwa: c.nazwa, linie: c.tekst.split('\n').filter(x => x.trim()) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        else c.res(new Response(c.tekst, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }));
        return;
      }
      if (rodzaj === 'zdarzenia' || rodzaj === 'zd') {
        /*  DZIENNIK ZDARZEŃ [D-295]: `zdarzenia` = cały (na prośbę), `zd` = nowe wpisy na żywo; linie
            „czas,kat,kod,zrodlo,obieg,a,b,c" od najnowszego. Trzymamy do 200 na obiekt. */
        const pref = cz.slice(0, -1).join('/'); const z = zdarzenia[pref] || (zdarzenia[pref] = { ile: 0, zgubione: 0, wpisy: [] });
        const nowe = m.payloadString.split('\n').filter(l => l.trim()).map(l => l.split(',').map(Number)).filter(x => x.length === 8);
        if (rodzaj === 'zdarzenia') z.wpisy = nowe; else z.wpisy = nowe.concat(z.wpisy).slice(0, 200);
        z.ile = Math.max(z.ile, z.wpisy.length); z.kiedy = Date.now();
        if (pref === wybrany) oddaj(true);
        return;
      }
      if (rodzaj === 'wynik') {
        let w = {}; try { w = JSON.parse(m.payloadString); } catch (e) { w = { kod: 1, opis: m.payloadString }; }
        const r = { ok: w.kod === 0, kod: w.kod, opis: w.opis || (w.kod === 0 ? 'wykonano' : 'odmowa') };
        if (w.id != null) {
          const p = oczekuja.get(w.id);
          if (!p) return;                                  /* cudza komenda albo powtórka wyniku (dwie drogi) */
          oczekuja.delete(w.id); if (czekaWynik === p.res) czekaWynik = null;
          const ms = Date.now() - p.t0; M.pomiar.wynik_ms = ms; M.pomiar.ile++;
          zapisz('wynik ' + p.co + ': ' + ms + ' ms' + (w.kod ? ' kod ' + w.kod : ''));
          p.res(r); return;
        }
        if (czekaWynik) { const f = czekaWynik; czekaWynik = null; f(r); }
        return;
      }
      if (rodzaj === 'zm') {
        const pref = cz.slice(0, -1).join('/');
        const w = obiekty[pref]; if (!w || !w.mb) return;          /* bez pełnego bloku nie ma na co nakładać */
        let d = null; try { d = JSON.parse(m.payloadString); } catch (e) { return; }
        if (!d) return;
        if (typeof d.seq === 'number') {
          if (w.seq != null && d.seq !== w.seq + 1) { w.luka = true; if (pref === wybrany) { zapisz('luka seq ' + w.seq + '→' + d.seq); oglos('pelny'); } }   /* luka → pełny blok od ręki; do niego lustro = zasiew */
          w.seq = d.seq;
        }
        if (d.t) zegar[pref] = { czas: d.t, kiedy: Date.now() };
        if (d.mb) for (const k in d.mb) w.mb[+k] = d.mb[k];
        if (d.mn) { if (!w.mn) w.mn = []; for (const k in d.mn) w.mn[+k] = d.mn[k]; }
        if (d.r)  { if (!w.r) w.r = {};  for (const k in d.r)  w.r[+k]  = d.r[k]; }
        w.kiedy = Date.now(); if (!w.luka) w.zasiew = false; if (pref === wybrany) { ost.zm = w.kiedy; czekamPoPowrocie = false; if (d.mn || d.r || d.mb) odnotujZmiane(); }
        if (pref === wybrany) oddaj(true);
        return;
      }
      if (rodzaj !== 'blok') return;
      const pref = cz.slice(0, -1).join('/');
      obiekty[pref] = Object.assign(obiekty[pref] || {}, { kiedy: Date.now() });   // status z `status` zostaje
      zastosujPelny(pref, obiekty[pref], m.payloadString);
      /*  RETAINED = ZASIEW, NIE ŚWIEŻY STAN [D-280]: blok z flagą retained ma od 0 do 60 s. Zasiewa
          lustro (rejestry, seq), ale nie zdejmuje planszy - świeży pełny blok przychodzi po `zadanie`
          w ~0,5 s. Bez tego dotknięcie w pierwszej sekundzie po otwarciu szło na starym stanie
          (sonda: dwa kliknięcia = jedno przełączenie, ekran odwrotnie niż sterownik). */
      if (m.retained) { obiekty[pref].kiedy = Date.now() - 100000; obiekty[pref].zasiew = true; zapisz('retained blok ' + pref.split('/').slice(1).join('/') + ' - czekam na świeży'); }
      else { obiekty[pref].zasiew = false; obiekty[pref].luka = false; try { localStorage.setItem('blok_' + pref, m.payloadString); } catch (e) {}   /* pamięć na zimny start [C4] */
             if (pref === wybrany) { ost.blok = Date.now(); czekamPoPowrocie = false; odnotujZmiane(); } }
      zapisz('pełny blok ' + pref.split('/').slice(1).join('/') + ' ' + m.payloadString.length + ' B seq ' + obiekty[pref].seq + (m.retained ? ' (retained)' : ''));
      if (!wybrany) { wybrany = pref; oglos(tempo); }
      if (pref === wybrany) oddaj(true);
    };
    /*  KODY PAHO PO POLSKU [D-309, Tomasz 2026-09-11: „AMQJS0007E pojawia się w dzienniku łącza jako błąd"]:
        surowy kod biblioteki wyglądał jak awaria. AMQJS0007E „Socket error" = system zamknął gniazdo WebSocket
        (telefon w tle, zmiana WiFi→LTE, chwilowy brak zasięgu) - Paho wraca sam, więc to informacja, nie błąd.
        Zapamiętujemy chwilę zerwania, żeby przy powrocie dopisać, ile trwała przerwa (dane do prób brzegowych). */
    const rcZ = r => { const m = /return code:\s*(\d)/i.exec((r && r.errorMessage) || ''); return m ? +m[1] : null; };
    const pahoTekst = r => { const m = (r && r.errorMessage) || String((r && r.errorCode) || '');
      if (/AMQJS0007E/.test(m)) return 'gniazdo zerwane przez system (tło / zmiana sieci / zasięg)';
      if (/AMQJS0008I/.test(m)) return 'broker zamknął połączenie';
      if (/AMQJS0004E/.test(m)) return 'broker nie odpowiedział na ping (zasięg?)';
      if (/AMQJSC0001E/.test(m)) return 'brak odpowiedzi brokera (limit czasu)';
      if (/AMQJS0006E/.test(m)) return 'broker odrzucił połączenie' + (rcZ(r) !== null ? ' (kod ' + rcZ(r) + ')' : '');
      return m.replace(/^AMQJS[C]?\d+[EI]\s*/, '') || 'powód nieznany'; };
    let zerwaneOd = 0;
    k.onConnectionLost = r => { const co = pahoTekst(r); zerwaneOd = Date.now();
      broker = { stan: 'zerwane', opis: 'zerwane: ' + co + ' - łączę ponownie…' }; czekamPoPowrocie = true; zapisz('zerwane: ' + co); oddaj(); };
    /*  RECONNECT [2026-09-09]: telefon zmienia sieć (WiFi→LTE), ekran gaśnie, tunel pada -
        Paho z `reconnect:true` wraca sam (odstęp 1→128 s), a onSuccess leci przy KAŻDYM
        CONNACK, więc subskrypcje wracają razem z nim (cleanSession:true je kasuje).
        onConnected(ponownie) tylko podpisuje stan na pasku. */
    /* po PONOWNYM połączeniu prosimy o pełny blok: w czasie przerwy paczki zmian przepadły, a retained
       blok bywa do 60 s stary [D-278] */
    k.onConnected = ponownie => { const przerwa = (ponownie && zerwaneOd) ? ' (przerwa ' + Math.round((Date.now() - zerwaneOd) / 1000) + ' s)' : ''; zerwaneOd = 0;
      broker = { stan: 'ok', opis: ponownie ? 'połączony ponownie' + przerwa : 'połączony' }; zapisz(ponownie ? 'połączony ponownie' + przerwa : 'połączony'); if (ponownie && wybrany) oglos('pelny'); oddaj(); };
    /*  POWOD ODMOWY Z CONNACK [2026-09-09]: Paho w onFailure daje errorCode = numer WŁASNEGO błędu
        (6 = „Bad Connack return code"), a kod brokera (4 = złe hasło, 5 = brak uprawnień, 3 = broker
        niedostępny) siedzi tylko w treści komunikatu - stąd wyrażenie. Dawne `errorCode === 5`
        nigdy nie było prawdą i złe hasło wyglądało jak „broker nie odpowiada".
        PONAWIANIE: `reconnect:true` Paho działa dopiero po ZERWANIU udanego połączenia; pierwsza
        nieudana próba (telefon bez zasięgu przy otwarciu) zostawałaby na zawsze. Ponawiamy sami
        5→10→20→40→60 s; przy złych danych logowania NIE ponawiamy - to człowiek musi poprawić. */
    let odstepPonow = 5;
    const opcje = { useSSL: true, userName: o.user, password: o.pass, timeout: 10, keepAliveInterval: 30, cleanSession: true, reconnect: true,
      onSuccess: () => { k.subscribe((o.temat || 'basen/+/+') + '/blok', { qos: 0 });
                         k.subscribe((o.temat || 'basen/+/+') + '/zm', { qos: 1 });      // paczki zmian [D-277]
                         k.subscribe((o.temat || 'basen/+/+') + '/status', { qos: 0 });  // lista obiektów (retained) - TU, nie po 500 ms
                         k.subscribe((o.temat || 'basen/+/+') + '/wynik', { qos: 0 });
                         k.subscribe((o.temat || 'basen/+/+') + '/stan', { qos: 0 });   // zegar sterownika do znacznika komendy
                         k.subscribe((o.temat || 'basen/+/+') + '/zdarzenia', { qos: 1 }); // dziennik zdarzeń na prośbę [D-295]
                         k.subscribe((o.temat || 'basen/+/+') + '/zd', { qos: 1 });        // nowe wpisy dziennika na żywo
                         k.subscribe((o.temat || 'basen/+/+') + '/pliki', { qos: 1 });     // karta SD: lista plików [D-297]
                         k.subscribe((o.temat || 'basen/+/+') + '/plik', { qos: 1 });      // karta SD: kawałki pliku
                         k.subscribe((o.temat || 'basen/+/+') + '/okres', { qos: 1 });     // zdarzenia z okresu [D-298]
                         if (wybrany) oglos(tempo); },
      onFailure: r => {
        const rc = rcZ(r);
        if (rc === 4 || rc === 5) { broker = { stan: 'blad', opis: 'broker odmówił - złe dane logowania (użytkownik/hasło)' }; oddaj(); return; }
        const powod = rc === 3 ? 'broker niedostępny' : rc === 1 || rc === 2 ? 'broker odrzucił klienta (kod ' + rc + ')'
                    : 'broker nie odpowiada (brak zasięgu?)';
        broker = { stan: 'blad', opis: powod + ' - ponowna próba za ' + odstepPonow + ' s' }; zapisz('odmowa: ' + powod); oddaj();
        setTimeout(() => { broker = { stan: 'laczy', opis: 'łączę z brokerem…' }; oddaj(); try { k.connect(opcje); } catch (e) {} }, odstepPonow * 1000);
        odstepPonow = Math.min(60, odstepPonow * 2);
      } };
    /*  ZIMNY START Z PAMIĘCI TELEFONU [D-289, C4]: ostatni pełny blok wybranego obiektu leży w localStorage.
        Otwarcie apki = liczby OD RAZU pod zasłoną „łączę…/pobieram stan…" (zasiew), nie ciemna plansza;
        świeży blok przychodzi po `zadanie`. Warunki brzegowe: blok z pamięci ma `seq` sprzed godzin →
        pierwsza paczka zm pokaże lukę → `pelny` od ręki, a do jego nadejścia zasłona zostaje (w.luka).
        Zły/obcięty wpis → parsujLinie zwraca null → oddaj() traktuje jak brak bloku. */
    if (wybrany) { const c = pamiec('blok_' + wybrany);
      if (c && c.indexOf('MB;') === 0 || (c && c.indexOf('\nMB;') >= 0)) { obiekty[wybrany] = { kiedy: Date.now() - 100000, zasiew: true, luka: true, status: '?' };
        zastosujPelny(wybrany, obiekty[wybrany], c); zapisz('blok z pamięci telefonu (zasiew)'); } }
    k.connect(opcje);
    oddaj(!!(wybrany && obiekty[wybrany]));   /* od razu: liczby z pamięci pod zasłoną albo plansza „łączę z brokerem…" */
    /* wiek pakietu ma płynąć także między pakietami - kafel ma zblednąć, gdy obiekt zamilkł */
    setInterval(() => oddaj(false), 1000);
    M.wybierzObiekt = pref => { if (obiekty[pref]) { wybrany = pref; try { localStorage.setItem('mqtt_obiekt', pref); } catch (e) {} oglos(tempo); oddaj(true); } };
    /*  SPRAWDŹ PIN [2026-09-09, Tomasz: „PIN do serwisu taki, jaki jest ustawiony w sterowniku"]:
        publikuje `pin=` bez `w=` (sterownik nic nie zapisuje, tylko odpowiada, czy PIN pasuje).
        Kod 0 → PIN dobry, zapamiętujemy go do kolejnych zmian serwisowych (bez pytania drugi raz).
        Zwraca 'ok' | 'zle' | <komunikat>. Ekran serwisu w apce woła to przy wejściu, więc PIN
        jest JEDEN — ten ze sterownika. */
    M.sprawdzPin = pin => new Promise(res => {
      if (!wybrany || !k || !k.isConnected()) { res('brak połączenia z brokerem'); return; }
      const zg = zegar[wybrany];
      const tSter = zg ? Math.floor(zg.czas + (Date.now() - zg.kiedy) / 1000) : Math.floor(Date.now() / 1000);
      const id = nowyId();
      const msg = new Paho.Message('t=' + tSter + ';id=' + id + ';pin=' + pin); msg.destinationName = wybrany + '/komenda'; msg.qos = 1;
      const mój = r => {
        if (r.kod === 0) { pinSerwis = pin; res('ok'); }
        else if (r.kod === 3) res('zle');
        else res(r.opis || 'sterownik nie przyjął PIN-u');
      };
      oczekuja.set(id, { res: mój, t0: Date.now(), co: 'PIN' }); czekaWynik = mój;
      k.send(msg);
      setTimeout(() => { if (oczekuja.has(id)) { oczekuja.delete(id); if (czekaWynik === mój) czekaWynik = null; res('sterownik nie odpowiedział w 5 s'); } }, 5000);
    });
    /*  ⚠ Bez retained `blok` obiekt „nie istnieje" dla apki, dopóki sam nie nada —
        a nadaje dopiero po `zadanie`. Zamknięte koło rozcina parametr ?obiekt=
        (znany prefiks → ogłaszamy od razu) albo lista z tematu `status`
        (retained) — subskrybujemy ją, żeby poznać obiekty, które milczą. */
    /* (subskrypcja `status` siedzi w onSuccess razem z resztą - dawny setTimeout 500 ms strzelał
       PRZED CONNACK i padał po cichu w try/catch, więc bez ?obiekt= lista bywała pusta [2026-09-09]) */
    const _onMsg = k.onMessageArrived;
    k.onMessageArrived = m => {
      const cz = m.destinationName.split('/');
      if (cz[cz.length - 1] === 'status') {
        const pref = cz.slice(0, -1).join('/');
        if (!obiekty[pref]) obiekty[pref] = { txt: '', kiedy: 0 };
        obiekty[pref].status = (m.payloadString || '').trim() || '?';   // online | offline (testament)
        if (!wybrany) { wybrany = pref; oglos(tempo); }
        oddaj(); return;
      }
      _onMsg(m);
    };
  };

  window.MOST_JS = M;
})();
