/* AP Representative Tracker — client-side renderer. Reads site/data/mps.json */
let DATA = {mps: []};
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

/* ---------- dashboard ---------- */
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
      ${row(t('m_cases'), M(D,'criminal_cases'), fmtN)}
      ${row(t('m_education'), M(D,'education'), v=>esc(v))}
    </table>
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
    <p>జిల్లా గణాంకాలు ఆ ప్రాంతాన్ని వివరిస్తాయి — ప్రతినిధి సాధించినవి కావు. నియోజకవర్గాలు జిల్లాలతో సరిగ్గా సరిపోవు.</p>`
  : `
    <h2>Sources</h2>
    <p>Legislative record: PRS Legislative Research · Funds: MPLADS portal · Affidavits: ADR/MyNeta · Election results: Election Commission of India · District outcomes: Census, NFHS, UDISE+, NITI Aayog SDG India Index, scheme dashboards (MGNREGA, PMAY-G, Jal Jeevan Mission).</p>
    <h2>Rules</h2>
    <p>Every number carries a source link — no exceptions. No adjectives about people: never "low attendance", always "attendance 43% vs. house average 78%". Identical layout for every party. No leaderboards, no verdicts.</p>
    <h2>Limits</h2>
    <p>District figures describe the area, not the representative's personal record. Constituencies do not map neatly onto districts. MPLADS figures reflect the latest completed reporting period; provisional data is labeled as such.</p>
    <h2>Corrections</h2>
    <p>Sourced corrections are applied visibly. If a cited source revises a figure, the record is updated with a new verification date.</p>`}
  </section>`;
}

/* ---------- router ---------- */
async function load(){
  try{
    const r = await fetch('data/mps.json');
    DATA = await r.json();
  }catch(e){ DATA = {mps:[]}; }
}
function render(){
  const hash = location.hash || '#/';
  const path = hash.split('?')[0];
  const [_, route, arg] = path.split('/');
  const app = document.getElementById('app');
  document.querySelectorAll('[data-nav]').forEach(a=>
    a.classList.toggle('active', (route||'')===(a.dataset.nav==='home'?'':a.dataset.nav)));
  if(route==='mp') app.innerHTML = viewProfile(arg||'');
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
