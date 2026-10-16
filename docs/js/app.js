/* AP Representative Tracker — client-side renderer. Reads docs/data/*.json */
let DATA = {mps: []};
let DIST = {districts: []};
let AFF = {mps: []};
let GEO = null;
let LANG = localStorage.getItem('aprt-lang') || 'en';
const t = k => STRINGS[LANG][k] ?? STRINGS.en[k] ?? k;

const slugify = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const slugOf = mp => slugify(mp.constituency);

/* metric accessor: accepts {value, source|source_url} or a raw value (source unknown) */
function M(obj, key){
  if(!obj) return {value:null, source:null};
  const v = obj[key];
  if(v == null) return {value:null, source:null};
  if(typeof v === 'object') return {value: v.value ?? null, source: v.source || v.source_url || null};
  return {value: v, source: null};
}
const fmtN = n => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN');
const fmtPct = n => (n==null||isNaN(n)) ? '—' : (Math.round(Number(n)*10)/10) + '%';
function fmtINR(n){
  if(n==null||isNaN(n)) return '—';
  n = Number(n);
  if(n >= 1e7){ const c = n/1e7; return '₹' + (Number.isInteger(c)? c : c.toFixed(2)) + ' cr'; }
  if(n >= 1e5){ const l = n/1e5; return '₹' + (Number.isInteger(l)? l : l.toFixed(1)) + ' L'; }
  return '₹' + fmtN(Math.round(n));
}
const srcLink = s => s ? ` <a class="src" href="${s}" target="_blank" rel="noopener">[${t('source')}]</a>` : '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const initials = n => (n||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

function setLang(l){
  LANG = l; localStorage.setItem('aprt-lang', l);
  document.getElementById('lang-en').classList.toggle('active', l==='en');
  document.getElementById('lang-te').classList.toggle('active', l==='te');
  document.querySelectorAll('[data-nav]').forEach(a=>{
    a.textContent = t('nav_'+a.dataset.nav);
  });
  document.getElementById('footer-note').textContent = t('footer_note');
  document.getElementById('footer-disclaimer').textContent = t('footer_disclaimer');
  render();
}

/* ---------- shared bits ---------- */
function kpi(num, lbl, sub){
  return `<div class="kpi"><div class="num">${num}</div><div class="lbl">${lbl}</div>${sub?`<div class="avg">${sub}</div>`:''}</div>`;
}
function row(label, m, fmt){
  const val = (m.value==null) ? `<span class="pending">${t('data_pending')}</span>` : fmt(m.value);
  return `<tr><th>${label}</th><td>${val}${srcLink(m.source)}</td></tr>`;
}
function verifiedCount(mp){
  const groups = [mp.legislative, mp.funds, mp.disclosure, mp.election];
  let total=0, ok=0;
  for(const g of groups){ if(!g) continue;
    for(const k of Object.keys(g)){
      if(['sessions_covered','period','year'].includes(k)) continue;
      total++; const m = M(g,k);
      if(m.value!=null && m.source) ok++;
    }
  }
  return {ok, total};
}

/* affidavit deep-dive rows (serious vs other cases) */
function affRows(mp){
  const a = affOf(mp);
  if(!a) return '';
  const s = (v)=> v==null ? `<span class="pending">${t('data_pending')}</span>` : fmtN(v);
  return `<tr><th>${t('serious_cases')}</th><td>${s(a.serious_cases)}${srcLink(a.source_url)}</td></tr>
          <tr><th>${t('non_serious_cases')}</th><td>${s(a.non_serious_cases)}${srcLink(a.source_url)}</td></tr>`;
}
function affCharges(mp){
  const a = affOf(mp);
  if(!a || !a.charges || !a.charges.length) return '';
  return `<h3 style="margin:16px 0 8px;font-size:.95rem">${t('charges_list')}</h3>
    <table class="metrics">${a.charges.map(c=>{
      const sev = c.severity==='serious'
        ? `<span class="badge" style="background:#fde8e8;color:#a12020">${esc(c.severity)}</span>`
        : c.severity ? `<span class="badge">${esc(c.severity)}</span>` : '';
      return `<tr><th>${esc(c.ipc_sections||'—')}<br>${sev}</th><td>${esc(c.case_description||'—')}${c.severity_basis?`<div class="sub" style="font-size:.75rem;color:var(--muted)">${esc(c.severity_basis)}</div>`:''}</td></tr>`;}).join('')}
    </table>`;
}

/* ---------- districts ---------- */
function avgOf(key, group){
  const vs = DATA.mps.map(mp=>M(mp[group],key).value).filter(v=>v!=null&&!isNaN(v));
  return vs.length ? vs.reduce((a,b)=>a+Number(b),0)/vs.length : null;
}
function viewDashboard(){
  const mps = DATA.mps;
  const n = mps.length;
  const aAtt = avgOf('attendance_pct','legislative');
  const aQ = avgOf('questions_asked','legislative');
  const aU = avgOf('utilization_pct','funds');
  const nAtt = mps.filter(mp=>M(mp.legislative,'attendance_pct').value!=null).length;
  const nQ = mps.filter(mp=>M(mp.legislative,'questions_asked').value!=null).length;
  const nU = mps.filter(mp=>M(mp.funds,'utilization_pct').value!=null).length;
  return `
  <div class="hero"><h1>AP Representative Tracker</h1><p>${t('tagline')}</p></div>
  <div class="stats">
    <div class="stat"><div class="num">${n}</div><div class="lbl">${t('mps_tracked')}</div><div class="sub">${t('as_of')} ${esc(DATA.collected_at||'—')}</div></div>
    <div class="stat"><div class="num">${fmtPct(aAtt)}</div><div class="lbl">${t('avg_attendance')}</div><div class="sub">${t('of_mps')(nAtt)}</div></div>
    <div class="stat"><div class="num">${aQ==null?'—':Math.round(aQ)}</div><div class="lbl">${t('avg_questions')}</div><div class="sub">${t('of_mps')(nQ)}</div></div>
    <div class="stat"><div class="num">${fmtPct(aU)}</div><div class="lbl">${t('avg_mplads')}</div><div class="sub">${t('of_mps')(nU)}</div></div>
  </div>
  <input id="q" class="search" placeholder="${t('search_placeholder')}" oninput="filterCards(this.value)">
  <div class="mp-grid" id="grid">
    ${mps.map(mp=>`
      <a class="mp-card" data-name="${esc(mp.name)} ${esc(mp.constituency)}" href="#/mp/${slugOf(mp)}">
        <div class="avatar">${initials(mp.name)}</div>
        <h3>${esc(mp.name)}</h3>
        <div class="cons">${esc(mp.constituency)}</div>
        <span class="party">${esc(mp.party||'')}</span>
      </a>`).join('')}
  </div>`;
}
window.filterCards = q => {
  q = q.toLowerCase();
  document.querySelectorAll('.mp-card').forEach(c=>{
    c.style.display = c.dataset.name.toLowerCase().includes(q) ? '' : 'none';
  });
};

/* ---------- profile ---------- */
function viewProfile(slug){
  const mp = DATA.mps.find(m=>slugOf(m)===slug);
  if(!mp) return `<p>${t('no_results')}</p><p><a href="#/">${t('back')}</a></p>`;
  const L=mp.legislative||{}, F=mp.funds||{}, D=mp.disclosure||{}, E=mp.election||{};
  const vc = verifiedCount(mp);
  const lastV = mp.meta && mp.meta.last_verified;
  return `
  <p><a href="#/">${t('back')}</a></p>
  <div class="profile-head">
    <h1>${esc(mp.name)}<span class="badge">${esc(mp.party||'')}</span></h1>
    <p class="sub">${esc(mp.constituency)} · ${t('m_constituency')==='నియోజకవర్గం'?'లోక్‌సభ':'Lok Sabha'} · ${t('last_verified')}: ${esc(lastV||'—')} · ${vc.ok}/${vc.total} ${t('fields_verified')}</p>
    <div class="kpis">
      ${kpi(fmtPct(M(L,'attendance_pct').value), t('m_attendance'))}
      ${kpi(fmtN(M(L,'questions_asked').value), t('m_questions'))}
      ${kpi(fmtN(M(L,'debates_participated').value), t('m_debates'))}
      ${kpi(fmtPct(M(F,'utilization_pct').value), t('m_mplads'))}
      ${kpi(fmtPct(M(D,'asset_growth_pct').value), t('m_assets'))}
    </div>
  </div>

  <section class="panel"><h2>${t('in_house')}</h2><p class="lede">${t('house_lede')}</p>
    <table class="metrics">
      ${row(t('m_attendance'), M(L,'attendance_pct'), fmtPct)}
      ${row(t('m_questions'), M(L,'questions_asked'), fmtN)}
      ${row(t('m_debates'), M(L,'debates_participated'), fmtN)}
      ${row(t('m_bills'), M(L,'private_member_bills'), fmtN)}
      <tr><th>${t('sessions_covered')}</th><td>${esc(L.sessions_covered||'—')}</td></tr>
    </table>
  </section>

  <section class="panel"><h2>${t('public_money')}</h2><p class="lede">${t('money_lede')}</p>
    <table class="metrics">
      ${row(t('entitlement'), M(F,'entitlement_inr'), fmtINR)}
      ${row(t('utilized'), M(F,'utilized_inr'), fmtINR)}
      ${row(t('m_mplads'), M(F,'utilization_pct'), fmtPct)}
      ${row(t('works_recommended'), M(F,'works_recommended'), fmtN)}
      ${row(t('works_completed'), M(F,'works_completed'), fmtN)}
      <tr><th>${t('as_of')}</th><td>${esc(F.period||'—')}</td></tr>
    </table>
  </section>

  <section class="panel"><h2>${t('disclosures')}</h2><p class="lede">${t('disclosure_lede')}</p>
    <table class="metrics">
      ${row(t('assets_now'), M(D,'assets_current_inr'), fmtINR)}
      ${row(t('assets_prev'), M(D,'assets_prev_inr'), fmtINR)}
      ${row(t('m_assets'), M(D,'asset_growth_pct'), fmtPct)}
      ${row(t('total_cases'), M(D,'criminal_cases'), fmtN)}
      ${affRows(mp)}
      ${row(t('m_education'), M(D,'education'), v=>esc(v))}
    </table>
    <p class="disclaimer">${t('affidavit_note')}</p>
    ${affCharges(mp)}
  </section>

  <section class="panel"><h2>${t('election')}</h2><p class="lede">${t('election_lede')}</p>
    <table class="metrics">
      ${row(t('m_voteshare'), M(E,'vote_share_pct'), fmtPct)}
      ${row(t('m_margin'), M(E,'margin_votes'), fmtN)}
      ${row(t('m_turnout'), M(E,'turnout_pct'), fmtPct)}
    </table>
  </section>

  <section class="panel"><h2>${t('your_area')}</h2>
    <div class="area-note">${t('area_note')}</div>
    ${mp.district_context ? `
    <p><strong>${esc((mp.district_context.districts||[]).join(', '))}</strong></p>
    <table class="metrics">
      ${Object.entries(mp.district_context.indicators||{}).map(([k,m])=>row(k.replace(/_/g,' '), M({k:m},'k'), v=>fmtN(v))).join('')}
    </table>` : `<p><span class="pending">${t('data_pending')}</span></p>`}
  </section>

  <section class="panel"><h2>${t('sources')}</h2>
    <table class="metrics">
      ${collectSources(mp).map(s=>`<tr><th>${esc(s.label)}</th><td><a class="src" href="${s.url}" target="_blank" rel="noopener">${esc(s.url)}</a></td></tr>`).join('') || `<tr><td>${t('data_pending')}</td></tr>`}
    </table>
  </section>`;
}
function collectSources(mp){
  const out=[]; const seen=new Set();
  const walk=(obj,prefix)=>{
    if(!obj||typeof obj!=='object') return;
    for(const [k,v] of Object.entries(obj)){
      if(v&&typeof v==='object'&&('source'in v||'source_url'in v)){
        const u=v.source||v.source_url;
        if(u&&!seen.has(u)){seen.add(u);out.push({label:prefix+k.replace(/_/g,' '),url:u});}
      } else if(v&&typeof v==='object'&&!Array.isArray(v)){ walk(v,prefix+k+'.'); }
    }
  };
  ['legislative','funds','disclosure','election'].forEach(g=>walk(mp[g],g+'.'));
  return out;
}

/* ---------- compare ---------- */
function viewCompare(params){
  const opts = DATA.mps.map(mp=>`<option value="${slugOf(mp)}">${esc(mp.name)} (${esc(mp.constituency)})</option>`).join('');
  const a = DATA.mps.find(m=>slugOf(m)===params.get('a'));
  const b = DATA.mps.find(m=>slugOf(m)===params.get('b'));
  const col = mp => mp ? `
    <div class="profile-head"><h1 style="font-size:1.1rem">${esc(mp.name)}</h1>
    <p class="sub">${esc(mp.constituency)} · ${esc(mp.party||'')}</p></div>
    <section class="panel"><table class="metrics">
      ${row(t('m_attendance'), M(mp.legislative,'attendance_pct'), fmtPct)}
      ${row(t('m_questions'), M(mp.legislative,'questions_asked'), fmtN)}
      ${row(t('m_debates'), M(mp.legislative,'debates_participated'), fmtN)}
      ${row(t('m_bills'), M(mp.legislative,'private_member_bills'), fmtN)}
      ${row(t('m_mplads'), M(mp.funds,'utilization_pct'), fmtPct)}
      ${row(t('m_works'), M(mp.funds,'works_completed'), fmtN)}
      ${row(t('m_assets'), M(mp.disclosure,'asset_growth_pct'), fmtPct)}
      ${row(t('m_cases'), M(mp.disclosure,'criminal_cases'), fmtN)}
      ${row(t('m_voteshare'), M(mp.election,'vote_share_pct'), fmtPct)}
      ${row(t('m_margin'), M(mp.election,'margin_votes'), fmtN)}
      ${row(t('m_turnout'), M(mp.election,'turnout_pct'), fmtPct)}
    </table></section>` : `<section class="panel"><p>${t('data_pending')}</p></section>`;
  return `
  <div class="hero"><h1>${t('compare_title')}</h1><p>${t('compare_lede')}</p></div>
  <div class="compare-selects">
    <select id="ca" onchange="goCompare()"><option value="">${t('select_a')}</option>${opts}</select>
    <select id="cb" onchange="goCompare()"><option value="">${t('select_b')}</option>${opts}</select>
  </div>
  <div class="compare-grid"><div>${col(a)}</div><div>${col(b)}</div></div>`;
}
window.goCompare = () => {
  const a=document.getElementById('ca').value, b=document.getElementById('cb').value;
  location.hash = `#/compare?a=${a}&b=${b}`;
};

/* ---------- districts ---------- */
function districtList(){
  // prefer researched district list; fall back to mapping keys
  if(DIST.districts && DIST.districts.length) return DIST.districts.map(d=>d.name);
  const c2d = DATA.constituency_to_districts || {};
  const s = new Set();
  Object.values(c2d).forEach(ds => (ds||[]).forEach(d=>s.add(d)));
  return [...s].sort();
}
function distInfo(name){
  return (DIST.districts || []).find(d=>d.name===name) || {};
}
function viewDistricts(){
  const ds = districtList();
  return `
  <div class="hero"><h1>${t('districts_title')}</h1><p>${t('districts_lede')}</p></div>
  <div id="map" class="map-box"><p style="padding:20px;color:var(--muted)">${t('map_loading')}</p></div>
  <div class="mp-grid" style="margin-top:16px">
    ${ds.map(d=>{ const info = distInfo(d); const n = districtMPs(d).length;
      return `<a class="mp-card" href="#/district/${slugify(d)}">
        <h3>${esc(d)}${info.name_te?` <span style="color:var(--muted);font-weight:400">${esc(info.name_te)}</span>`:''}</h3>
        <div class="cons">${n} MP${n===1?'':'s'}</div>
      </a>`; }).join('') || `<p>${t('data_pending')}</p>`}
  </div>`;
}
function initMap(){
  const el = document.getElementById('map');
  if(!el) return;
  if(!GEO || typeof L === 'undefined'){
    el.innerHTML = `<p style="padding:20px;color:var(--muted)">${t('map_unavailable')}</p>`;
    return;
  }
  const map = L.map('map').setView([15.9, 79.7], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {attribution:'© OpenStreetMap contributors', maxZoom: 12}).addTo(map);
  const fname = f => {
    const p = f.properties || {};
    const cand = p.name || p.NAME_1 || p.district || p.DISTRICT || p.Dist_Name || '';
    const norm = s => s.toLowerCase().replace(/[^a-z]/g,'');
    const hit = districtList().find(d => norm(d) === norm(cand) || norm(cand).includes(norm(d)));
    return hit || null;
  };
  L.geoJSON(GEO, {
    style: ()=>({color:'#0e6e6e', weight:1.5, fillColor:'#0e6e6e', fillOpacity:0.12}),
    onEachFeature: (f, layer)=>{
      const d = fname(f);
      const info = distInfo(d);
      layer.bindTooltip(esc(info.name_te ? `${d} · ${info.name_te}` : d));
      layer.on('click', ()=>{ location.hash = '#/district/' + slugify(d); });
      layer.on('mouseover', ()=>layer.setStyle({fillOpacity:0.3}));
      layer.on('mouseout', ()=>layer.setStyle({fillOpacity:0.12}));
    }
  }).addTo(map);
}
function viewDistrict(slug){
  const d = districtList().find(x=>slugify(x)===slug);
  if(!d) return `<p>${t('no_results')}</p><p><a href="#/districts">${t('back')}</a></p>`;
  const info = distInfo(d);
  const mps = districtMPs(d);
  const inds = info.indicators || {};
  const irow = (label, m) => {
    if(!m || m.value==null) return `<tr><th>${label}</th><td><span class="pending">${t('data_pending')}</span></td></tr>`;
    return `<tr><th>${label}</th><td>${fmtN(m.value)}${m.year?` <span class="sub">(${m.year})</span>`:''}${srcLink(m.source)}</td></tr>`;
  };
  return `
  <p><a href="#/districts">${t('back')}</a></p>
  <div class="profile-head">
    <h1>${esc(d)}${info.name_te?` <span style="color:var(--muted);font-weight:400;font-size:1.1rem">${esc(info.name_te)}</span>`:''}</h1>
    <p class="sub">${t('mps_in_district')}: ${mps.length}</p>
  </div>
  <section class="panel"><h2>${t('mps_in_district')}</h2>
    <div class="mp-grid">
      ${mps.map(mp=>`<a class="mp-card" href="#/mp/${slugOf(mp)}">
        <div class="avatar">${initials(mp.name)}</div><h3>${esc(mp.name)}</h3>
        <div class="cons">${esc(mp.constituency)}</div><span class="party">${esc(mp.party||'')}</span>
      </a>`).join('') || `<p>${t('data_pending')}</p>`}
    </div>
  </section>
  <section class="panel"><h2>${t('district_indicators')}</h2>
    <div class="area-note">${t('area_note')}</div>
    <table class="metrics">
      ${irow('Literacy', inds.literacy_pct)}
      ${irow('Institutional births', inds.institutional_births_pct)}
      ${irow('Stunting (under 5)', inds.stunting_under5_pct)}
      ${irow('Infant mortality', inds.infant_mortality)}
      ${irow('Secondary dropout rate', inds.dropout_rate_secondary)}
      ${irow('Pupil-teacher ratio (primary)', inds.pupil_teacher_ratio_primary)}
      ${irow('SDG index score', inds.sdg_index_score)}
      ${irow('MGNREGA person-days', inds.mgnrega_persondays_fy25)}
      ${irow('PMAY-G houses completed', inds.pmayg_houses_completed)}
      ${irow('Jal Jeevan tap connections', inds.jjm_tap_connections)}
    </table>
  </section>`;
}

/* ---------- methodology ---------- */
function viewMethodology(){
  const te = LANG==='te';
  return `<div class="hero"><h1>${t('methodology_title')}</h1></div>
  <section class="panel">${te ? `
    <h2>మూలాలు</h2>
    <p>సభ రికార్డు: PRS Legislative Research · నిధులు: MPLADS పోర్టల్ · అఫిడవిట్లు: ADR/MyNeta · ఎన్నికల ఫలితాలు: భారత ఎన్నికల సంఘం · జిల్లా గణాంకాలు: Census, NFHS, UDISE+, NITI Aayog SDG Index, పథకాల డాష్‌బోర్డులు.</p>
    <h2>నియమాలు</h2>
    <p>ప్రతి సంఖ్యకు మూలం లింక్ తప్పనిసరి. వ్యక్తులపై విశేషణాలు నిషిద్ధం — "తక్కువ హాజరు" కాదు, "హాజరు 43%, సభ సగటు 78%" అని మాత్రమే. అన్ని పార్టీలకు ఒకే లేఅవుట్. ర్యాంకింగ్‌లు లేవు.</p>
    <h2>పరిమితులు</h2>
    <p>జిల్లా గణాంకాలు ఆ ప్రాంతాన్ని వివరిస్తాయి — ప్రతినిధి సాధించినవి కావు. నియోజకవర్గాలు జిల్లాలతో సరిగ్గా సరిపోవు.</p>
    <h2>క్రిమినల్ కేసులు: తీవ్రమైనవి vs సాధారణవి</h2>
    <p>myneta.info అభ్యర్థుల వారీగా ADR తీవ్ర/సాధారణ విభజనను ప్రచురించదు — కాబట్టి తీవ్రత అనేది ADR ప్రచురించిన "తీవ్రమైన క్రిమినల్ కేసులు" ప్రమాణాల యాంత్రిక అనువర్తనం: 5+ సంవత్సరాల శిక్ష పడే నేరాలు; ఎన్నికల నేరాలు; అవినీతి/పన్ను ఎగవేత; SC/ST అత్యాచారాల నిరోధక చట్టం నేరాలు; హత్య, హత్యాయత్నం, అత్యాచారం, కిడ్నాప్ వంటి తీవ్ర వర్గాలు. మిగతావన్నీ — ఆందోళన కేసులు, ట్రాఫిక్ ఉల్లంఘనలు, చిన్న గాయాలు, చిన్న జరిమానాలు — సాధారణంగా లెక్క. ప్రతి అభియోగానికి ఆధారం పేర్కొనబడుతుంది. ప్రకటించిన కేసులు పెండింగ్ వ్యవహారాలు, శిక్షలు కావు.</p>`
  : `
    <h2>Sources</h2>
    <p>Legislative record: PRS Legislative Research · Funds: MPLADS portal · Affidavits: ADR/MyNeta · Election results: Election Commission of India · District outcomes: Census, NFHS, UDISE+, NITI Aayog SDG India Index, scheme dashboards (MGNREGA, PMAY-G, Jal Jeevan Mission).</p>
    <h2>Rules</h2>
    <p>Every number carries a source link — no exceptions. No adjectives about people: never "low attendance", always "attendance 43% vs. house average 78%". Identical layout for every party. No leaderboards, no verdicts.</p>
    <h2>Limits</h2>
    <p>District figures describe the area, not the representative's personal record. Constituencies do not map neatly onto districts. MPLADS figures reflect the latest completed reporting period; provisional data is labeled as such.</p>
    <h2>Criminal cases: serious vs non-serious</h2>
    <p>myneta.info does not publish ADR's own per-candidate serious/non-serious split, so severity is a mechanical application of ADR's published "serious criminal cases" criteria to the sections listed in each affidavit: offences punishable with 5+ years; electoral offences (e.g. IPC 171E/171H); corruption and tax-evasion offences; SC/ST (Prevention of Atrocities) Act offences; and heinous categories (murder, attempt to murder, rape, kidnapping, dacoity). Everything else — protest and public-order cases, traffic violations, simple hurt, minor statutory fines — counts as non-serious. Each charge carries its basis; borderline calls are flagged. Declared cases are pending matters, not convictions.</p>
    <h2>Corrections</h2>
    <p>Sourced corrections are applied visibly. If a cited source revises a figure, the record is updated with a new verification date.</p>`}
  </section>`;
}

/* ---------- router ---------- */
async function load(){
  const get = async p => { try{ const r = await fetch(p); return r.ok ? await r.json() : null; }catch(e){ return null; } };
  DATA = await get('data/mps.json') || {mps: []};
  DIST = await get('data/districts.json') || {districts: []};
  AFF = await get('data/affidavit_details.json') || {mps: []};
  try{ const r = await fetch('data/ap_districts.geojson'); GEO = r.ok ? await r.json() : null; }catch(e){ GEO = null; }
}
/* district -> MPs inverse index from constituency_to_districts */
function districtMPs(dname){
  const c2d = DATA.constituency_to_districts || {};
  const out = [];
  for(const mp of DATA.mps){
    const ds = c2d[mp.constituency] || (mp.district_context && mp.district_context.districts) || [];
    if(ds.includes(dname)) out.push(mp);
  }
  return out;
}
function affOf(mp){
  return (AFF.mps || []).find(a => a.name === mp.name) || null;
}
function render(){
  const hash = location.hash || '#/';
  const path = hash.split('?')[0];
  const [_, route, arg] = path.split('/');
  const app = document.getElementById('app');
  document.querySelectorAll('[data-nav]').forEach(a=>
    a.classList.toggle('active', (route||'')===(a.dataset.nav==='home'?'':a.dataset.nav)));
  if(route==='mp') app.innerHTML = viewProfile(arg||'');
  else if(route==='districts'){ app.innerHTML = viewDistricts(); initMap(); }
  else if(route==='district') app.innerHTML = viewDistrict(arg||'');
  else if(route==='compare'){
    const params = new URLSearchParams(hash.split('?')[1]||'');
    app.innerHTML = viewCompare(params);
    if(params.get('a')) document.getElementById('ca').value = params.get('a');
    if(params.get('b')) document.getElementById('cb').value = params.get('b');
  }
  else if(route==='methodology') app.innerHTML = viewMethodology();
  else app.innerHTML = viewDashboard();
  window.scrollTo(0,0);
}
document.getElementById('lang-en').onclick = ()=>setLang('en');
document.getElementById('lang-te').onclick = ()=>setLang('te');
window.addEventListener('hashchange', render);
(async ()=>{ await load(); setLang(LANG); })();
