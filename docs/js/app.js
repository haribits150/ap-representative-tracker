/* AP Representative Tracker — client-side renderer. Reads docs/data/*.json */
let DATA = {mps: []};
let MLA = [];
let DIST = {districts: []};
let AFF = {mps: []};
let NEWS = {news: {}};
let GEO = null;
let CONTACTS = {contacts: {}};
let CHANGELOG = {entries: []};
let MANDALS = {mandals: []};
let LITE = localStorage.getItem('aprt-lite') === '1';
let LANG = localStorage.getItem('aprt-lang') ||
  (((typeof navigator !== 'undefined') && (navigator.language || '').toLowerCase().indexOf('te') === 0) ? 'te' : 'en');
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
  document.getElementById('footer-changelog').textContent = t('footer_changelog');
  const lt = document.getElementById('lite-toggle');
  lt.textContent = LITE ? t('lite_on') : t('lite_off');
  lt.title = t('lite_note');
  render();
}
window.toggleLite = () => {
  LITE = !LITE;
  localStorage.setItem('aprt-lite', LITE ? '1' : '0');
  location.reload();
};

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
function mlaAvg(key, group){
  const vs = MLA.map(mp=>M(mp[group],key).value).filter(v=>v!=null&&!isNaN(v));
  return vs.length ? vs.reduce((a,b)=>a+Number(b),0)/vs.length : null;
}

/* ---------- profile ---------- */
function newsSection(mp, house){
  const key = `${house}/${slugOf(mp)}`;
  const items = ((NEWS && NEWS.news) || {})[key] || [];
  if(!items.length) return '';
  const fmtDate = d => { try{ return new Date(d).toLocaleDateString(); }catch(e){ return ''; } };
  return `
  <section class="panel"><h2>${t('in_the_news')}</h2><p class="lede">${t('news_lede')}</p>
    <ul style="list-style:none;padding:0;margin:0">
      ${items.map(n=>`<li style="margin-bottom:10px">
        <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><br>
        <span class="sub">${esc(n.source||'')}${n.pubDate?` &middot; ${esc(fmtDate(n.pubDate))}`:''}</span>
      </li>`).join('')}
    </ul>
    <p class="disclaimer">${t('news_note')}</p>
  </section>`;
}
function viewProfile(slug, house){
  house = house || 'mp';
  const isMla = house==='mla';
  const mp = (isMla ? MLA : DATA.mps).find(m=>slugOf(m)===slug);
  if(!mp) return `<p>${t('no_results')}</p><p><a href="#/">${t('back')}</a></p>`;
  const L=mp.legislative||{}, F=mp.funds||{}, D=mp.disclosure||{}, E=mp.election||{};
  const vc = verifiedCount(mp);
  const lastV = mp.meta && mp.meta.last_verified;
  const houseLbl = isMla ? t('assembly') : (t('m_constituency')==='\u0c28\u0c3f\u0c2f\u0c4b\u0c1c\u0c15\u0c35\u0c30\u0c4d\u0c17\u0c02'?'\u0c32\u0c4b\u0c15\u0c4d\u0c38\u0c2d':'Lok Sabha');
  const apAvg = (k,g,f)=>{ const a=avgOf(k,g); return a==null ? '' : `${t('ap_avg')}: ${f(a)}`; };
  const mlaAvgSub = (k,g,f)=>{ const a=mlaAvg(k,g); return a==null ? '' : `${t('ap_avg')}: ${f(a)}`; };
  const caseVal = M(D,'criminal_cases_declared').value ?? M(D,'criminal_cases').value;
  const waText = encodeURIComponent(
    `${mp.name} (${mp.constituency})\n${t('m_voteshare')}: ${fmtPct(M(E,'vote_share_pct').value)} | ${t('total_cases')}: ${fmtN(caseVal)}\n${t('tagline')}\nhttps://haribits150.github.io/ap-representative-tracker/#/${house}/${slugOf(mp)}`);
  const kpis = isMla ? `
      ${kpi(fmtPct(M(E,'vote_share_pct').value), t('m_voteshare'), mlaAvgSub('vote_share_pct','election',fmtPct))}
      ${kpi(fmtN(M(E,'margin_votes').value), t('m_margin'))}
      ${kpi(fmtN(caseVal), t('total_cases'), mlaAvgSub('criminal_cases_declared','disclosure',v=>fmtN(Math.round(v*10)/10)))}
      ${kpi(fmtINR(M(D,'assets_current_inr').value), t('assets_now'), mlaAvgSub('assets_current_inr','disclosure',fmtINR))}
  ` : `
      ${kpi(fmtPct(M(L,'attendance_pct').value), t('m_attendance'), apAvg('attendance_pct','legislative',fmtPct))}
      ${kpi(fmtN(M(L,'questions_asked').value), t('m_questions'), apAvg('questions_asked','legislative',v=>fmtN(Math.round(v))))}
      ${kpi(fmtN(M(L,'debates_participated').value), t('m_debates'), apAvg('debates_participated','legislative',v=>fmtN(Math.round(v))))}
      ${kpi(fmtINR(M(F,'entitlement_inr').value), t('m_mplads_alloc'))}
      ${kpi(fmtPct(M(D,'asset_growth_pct').value), t('m_assets'))}
  `;
  const housePanel = isMla ? `
  <section class="panel empty-section"><h2>${t('in_house')}</h2>
    <div class="area-note">${t('mla_legislative_note')}</div>
  </section>

  <section class="panel empty-section"><h2>${t('public_money')}</h2>
    <div class="area-note">${t('mla_funds_note')}</div>
  </section>` : `
  <section class="panel"><h2>${t('in_house')}</h2><p class="lede">${t('house_lede')}</p>
    <table class="metrics">
      ${row(t('m_attendance'), M(L,'attendance_pct'), fmtPct)}
      ${row(t('m_questions'), M(L,'questions_asked'), fmtN)}
      ${row(t('m_debates'), M(L,'debates_participated'), fmtN)}
      ${row(t('m_bills'), M(L,'private_member_bills'), fmtN)}
      <tr><th>${t('sessions_covered')}</th><td>${esc(L.sessions_covered||'\u2014')}</td></tr>
    </table>
  </section>
  ${!isMla && mp.voting_record && mp.voting_record.votes.length ? `
  <section class="panel"><h2>${t('voting_record')}</h2><p class="lede">${t('voting_lede')}</p>
    <table class="metrics">
      ${mp.voting_record.votes.map(v=>`
      <tr><th>${esc(v.bill)}<br><span class="sub">${esc(v.date)} &middot; ${t('house_result')}: ${esc(v.result)}</span></th>
      <td><strong>${v.vote==='Aye'?t('vote_aye'):t('vote_no')}</strong>${srcLink(v.source)}</td></tr>`).join('')}
    </table>
    <p class="disclaimer">${t('voting_basis_note')}</p>
  </section>` : ''}

  <section class="panel"><h2>${t('public_money')}</h2><p class="lede">${t('money_lede')}</p>
    <table class="metrics">
      ${row(t('entitlement'), M(F,'entitlement_inr'), fmtINR)}
      ${row(t('utilized'), M(F,'utilized_inr'), fmtINR)}
      ${row(t('m_mplads'), M(F,'utilization_pct'), fmtPct)}
      ${row(t('works_recommended'), M(F,'works_recommended'), fmtN)}
      ${row(t('works_completed'), M(F,'works_completed'), fmtN)}
      <tr><th>${t('as_of')}</th><td>${esc(F.period||'\u2014')}</td></tr>
    </table>
  </section>`;
  const affSection = isMla ? `
  <section class="panel"><h2>${t('disclosures')}</h2><p class="lede">${t('disclosure_lede')}</p>
    <table class="metrics">
      ${row(t('assets_now'), M(D,'assets_current_inr'), fmtINR)}
      ${row(t('assets_prev'), M(D,'assets_prev_inr'), fmtINR)}
      ${row(t('m_assets'), M(D,'asset_growth_pct'), fmtPct)}
      ${row(t('total_cases'), M(D,'criminal_cases_declared'), fmtN)}
      ${row(t('m_education'), M(D,'education'), v=>esc(v))}
    </table>
    <p class="disclaimer">${t('mla_affidavit_note')}</p>
  </section>` : `
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
  </section>`;
  const areaSection = `
  <section class="panel"><h2>${t('your_area')}</h2>
    <div class="area-note">${t('area_note')}</div>
    ${mp.district_context ? `
    <p><strong>${esc(asList(mp.district_context.districts).join(', '))}</strong></p>
    ${!isMla ? `<table class="metrics">
      ${Object.entries(mp.district_context.indicators||{}).map(([k,m])=>row(k.replace(/_/g,' '), M({k:m},'k'), v=>fmtN(v))).join('')}
    </table>` : ''}` : `<p><span class="pending">${t('data_pending')}</span></p>`}
  </section>`;
  return `
  <p><a href="#/">${t('back')}</a></p>
  <div class="profile-head">
    <h1>${esc(mp.name)}<span class="badge">${esc(mp.party||'')}</span></h1>
    <p class="sub">${esc(mp.constituency)} \u00b7 ${houseLbl} \u00b7 ${t('last_verified')}: ${esc(lastV||'\u2014')} \u00b7 ${vc.ok}/${vc.total} ${t('fields_verified')}</p>
    <p><a class="share-btn" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener">${t('share_whatsapp')}</a>
    <button class="share-btn" onclick="shareCard('${house}','${slugOf(mp)}')">${t('share_card')}</button>
    <button class="correct-btn" onclick="openCorrection('${house}','${slugOf(mp)}')">${t('correct_title')}</button></p>
    <div class="kpis">${kpis}</div>
  </div>

  ${contactSection(mp, house)}

  ${housePanel}
  ${affSection}

  <section class="panel"><h2>${t('election')}</h2><p class="lede">${t('election_lede')}</p>
    <table class="metrics">
      ${row(t('m_voteshare'), M(E,'vote_share_pct'), fmtPct)}
      ${row(t('m_margin'), M(E,'margin_votes'), fmtN)}
      ${row(t('m_turnout'), M(E,'turnout_pct'), fmtPct)}
    </table>
  </section>

  ${areaSection}

  ${newsSection(mp, house)}

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

/* ---------- contact ---------- */
function contactOf(mp, house){
  const key = `${house}/${slugOf(mp)}`;
  return (CONTACTS.contacts || {})[key] || null;
}
function contactSection(mp, house){
  const c = contactOf(mp, house);
  const rows = [];
  if(c && c.phone) rows.push(`<tr><th>☎</th><td><a href="tel:${esc(c.phone.replace(/\s/g,''))}">${esc(c.phone)}</a>${srcLink(c.source)}</td></tr>`);
  if(c && c.email) rows.push(`<tr><th>✉</th><td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td></tr>`);
  if(c && c.address) rows.push(`<tr><th>⌂</th><td>${esc(c.address)}</td></tr>`);
  return `
  <section class="panel"><h2>${t('contact_title')}</h2><p class="lede">${t('contact_note')}</p>
    ${rows.length ? `<table class="metrics">${rows.join('')}</table>`
      : `<p><span class="pending">${t('contact_none')}</span></p>`}
  </section>`;
}

/* ---------- correction reports ---------- */
const CORRECT_SECTIONS = ['sec_profile','sec_house','sec_money','sec_disclosure','sec_election','sec_area','sec_news','sec_contact','sec_other'];
window.openCorrection = (house, slug, districtName) => {
  const list = house==='mla' ? MLA : (house==='mp' ? DATA.mps : []);
  const mp = list.find(m=>slugOf(m)===slug);
  const who = mp ? `${mp.name} (${mp.constituency})` : (districtName || t('correct_title'));
  const old = document.getElementById('correctModal'); if(old) old.remove();
  const div = document.createElement('div'); div.id='correctModal'; div.className='card-modal';
  div.innerHTML = `
    <div class="card-box">
      <h3>${t('correct_title')} — ${esc(who)}</h3>
      <p class="lede">${t('correct_lede')}</p>
      <label class="fld">${t('correct_section')}
        <select id="cf-sec">${CORRECT_SECTIONS.map(s=>`<option value="${s}">${t(s)}</option>`).join('')}</select></label>
      <label class="fld">${t('correct_what')}
        <textarea id="cf-what" rows="3" required></textarea></label>
      <label class="fld">${t('correct_fix')}
        <input id="cf-fix" type="text"></label>
      <label class="fld">${t('correct_source')}
        <input id="cf-src" type="url" placeholder="https://"></label>
      <label class="fld">${t('correct_name')}
        <input id="cf-name" type="text"></label>
      <p class="disclaimer">${t('correct_note')}</p>
      <div class="card-actions">
        <button class="share-btn" id="cfSend">${t('correct_submit')}</button>
        <button class="share-btn ghost" id="cfCancel">${t('correct_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('cfCancel').onclick = ()=>div.remove();
  div.onclick = e => { if(e.target===div) div.remove(); };
  document.getElementById('cfSend').onclick = () => {
    const sec = t(document.getElementById('cf-sec').value);
    const what = document.getElementById('cf-what').value.trim();
    if(!what){ document.getElementById('cf-what').focus(); return; }
    const fix = document.getElementById('cf-fix').value.trim();
    const src = document.getElementById('cf-src').value.trim();
    const nm = document.getElementById('cf-name').value.trim();
    const page = location.href;
    const title = `[Correction] ${who} — ${sec}`;
    const body = [
      `Page: ${page}`,
      `Representative: ${who}`,
      `Section: ${sec}`,
      ``,
      `What's wrong:`,
      what,
      ``,
      fix ? `Suggested correction:\n${fix}\n` : ``,
      src ? `Source: ${src}\n` : ``,
      nm ? `Reported by: ${nm}` : ``,
    ].join('\n');
    const url = 'https://github.com/haribits150/ap-representative-tracker/issues/new'
      + '?labels=' + encodeURIComponent('data-correction')
      + '&title=' + encodeURIComponent(title)
      + '&body=' + encodeURIComponent(body);
    div.remove();
    window.open(url, '_blank', 'noopener');
  };
};

/* ---------- changelog ---------- */
function viewChangelog(){
  const entries = (CHANGELOG.entries || []).map(e=>`
    <section class="panel"><h2 style="font-size:1rem">${esc(e.date)}</h2>
      <p>${esc(LANG==='te' ? (e.te || e.en) : e.en)}</p></section>`).join('');
  return `<div class="hero"><h1>${t('changelog_title')}</h1><p>${t('changelog_lede')}</p></div>
    <p style="margin-bottom:16px"><button class="correct-btn" onclick="openCorrection('site','home')">${t('correct_title')}</button></p>
    ${entries || `<p>${t('data_pending')}</p>`}`;
}

/* ---------- MP vs MLA explainer (swipe deck) ---------- */
const LEARN_CARDS = [
 {en_t:"Who represents you?", te_t:"మీకు ప్రాతినిధ్యం వహించేది ఎవరు?",
  en_b:"Every voter in Andhra Pradesh has <b>two</b> elected representatives: an <b>MLA</b> in the Amaravati Assembly and an <b>MP</b> in Delhi's Lok Sabha. They do different jobs — knowing which one to approach is half the battle.",
  te_b:"ఆంధ్రప్రదేశ్‌లో ప్రతి ఓటరుకు <b>ఇద్దరు</b> ఎన్నికైన ప్రతినిధులు ఉంటారు: అమరావతి అసెంబ్లీలో <b>MLA</b>, ఢిల్లీ లోక్‌సభలో <b>MP</b>. వారి పనులు వేర్వేరు — ఎవరిని అడగాలో తెలుసుకోవడమే సగం పని."},
 {en_t:"What your MP does", te_t:"మీ MP ఏం చేస్తారు",
  en_b:"Your MP makes <b>national laws</b>, asks questions and joins debates in Parliament, sits on committees, and gets <b>₹5 crore a year</b> under MPLADS for local works. One MP covers a parliamentary constituency of roughly 15–20 lakh voters.",
  te_b:"మీ MP <b>జాతీయ చట్టాలు</b> చేస్తారు, పార్లమెంటులో ప్రశ్నలు అడుగుతారు, కమిటీల్లో ఉంటారు, స్థానిక పనుల కోసం MPLADS కింద ఏటా <b>₹5 కోట్లు</b> పొందుతారు. ఒక MP దాదాపు 15–20 లక్షల ఓటర్ల పార్లమెంటు నియోజకవర్గాన్ని కవర్ చేస్తారు."},
 {en_t:"What your MLA does", te_t:"మీ MLA ఏం చేస్తారు",
  en_b:"Your MLA makes <b>state laws</b> in the Assembly, raises your constituency's issues with the state government, and gets about <b>₹1 crore a year</b> under the Assembly Constituency Development Programme. The MLA is usually the first door to knock on.",
  te_b:"మీ MLA అసెంబ్లీలో <b>రాష్ట్ర చట్టాలు</b> చేస్తారు, రాష్ట్ర ప్రభుత్వంతో మీ నియోజకవర్గ సమస్యలను లేవనెత్తుతారు, అసెంబ్లీ నియోజకవర్గ అభివృద్ధి కార్యక్రమం కింద ఏటా సుమారు <b>₹1 కోటి</b> పొందుతారు. సాధారణంగా తట్టాల్సిన మొదటి తలుపు MLAదే."},
 {en_t:"Whose job is it?", te_t:"ఇది ఎవరి పని?",
  en_b:"<b>Your MLA (state):</b> water supply, government schools and hospitals, police, town roads, electricity distribution.<br><b>Your MP (centre):</b> railways, national highways, income tax, defence, passports.<br><b>Shared:</b> some schemes run jointly — the district pages tag each indicator.",
  te_b:"<b>మీ MLA (రాష్ట్రం):</b> నీటి సరఫరా, ప్రభుత్వ పాఠశాలలు-ఆసుపత్రులు, పోలీసు, పట్టణ రోడ్లు, విద్యుత్ పంపిణీ.<br><b>మీ MP (కేంద్రం):</b> రైల్వేలు, జాతీయ రహదారులు, ఆదాయపు పన్ను, రక్షణ, పాస్‌పోర్టులు.<br><b>ఉమ్మడి:</b> కొన్ని పథకాలు సంయుక్తంగా నడుస్తాయి — జిల్లా పేజీల్లో ప్రతి సూచికకు ట్యాగ్ ఉంటుంది."},
 {en_t:"Follow the money", te_t:"డబ్బును అనుసరించండి",
  en_b:"Every MP's MPLADS <b>allocation</b> is published — but per-MP <b>spending</b> is not, and this site says so openly instead of guessing. For MLAs there is no public per-MLA fund dashboard at all. Missing data on this site is always labeled, never filled in.",
  te_b:"ప్రతి MP MPLADS <b>కేటాయింపు</b> ప్రచురించబడుతుంది — కానీ MP వారీ <b>ఖర్చు</b> ప్రచురించబడదు, ఈ సైట్ ఊహించకుండా అదే బహిరంగంగా చెబుతుంది. MLAలకు MLA వారీ నిధుల డాష్‌బోర్డు అసలే లేదు. ఈ సైట్‌లో లేని డేటా ఎల్లప్పుడూ గుర్తించబడుతుంది, ఎప్పుడూ నింపబడదు."},
 {en_t:"How elections work", te_t:"ఎన్నికలు ఎలా జరుగుతాయి",
  en_b:"Both Lok Sabha and Assembly elections happen every <b>5 years</b> (same cycle in AP). <b>First-past-the-post:</b> whoever gets the most votes wins — no majority needed. That's why vote share and winning margin, shown on every profile, matter.",
  te_b:"లోక్‌సభ, అసెంబ్లీ ఎన్నికలు రెండూ ప్రతి <b>5 ఏళ్లకు</b> జరుగుతాయి (APలో ఒకే చక్రం). <b>ఫస్ట్-పాస్ట్-ది-పోస్ట్:</b> అత్యధిక ఓట్లు పొందినవారే గెలుస్తారు — మెజారిటీ అవసరం లేదు. అందుకే ప్రతి ప్రొఫైల్‌లో చూపే ఓట్ల శాతం, గెలుపు తేడా ముఖ్యం."},
 {en_t:"How to use this site", te_t:"ఈ సైట్‌ను ఎలా వాడాలి",
  en_b:"<b>1.</b> Find your representative by mandal or district. <b>2.</b> Check attendance, questions, funds, and affidavit disclosures — every number has a source. <b>3.</b> Compare two reps side by side. <b>4.</b> Share the card. No adjectives, no rankings — just the record.",
  te_b:"<b>1.</b> మండలం లేదా జిల్లా వారీగా మీ ప్రతినిధిని కనుగొనండి. <b>2.</b> హాజరు, ప్రశ్నలు, నిధులు, అఫిడవిట్ వెల్లడులను చూడండి — ప్రతి సంఖ్యకు మూలం ఉంటుంది. <b>3.</b> ఇద్దరు ప్రతినిధులను పక్కపక్కనే పోల్చండి. <b>4.</b> కార్డ్‌ను షేర్ చేయండి. విశేషణాలు లేవు, ర్యాంకింగ్‌లు లేవు — కేవలం రికార్డు."},
];
function viewLearn(){
  const cards = LEARN_CARDS.map((c,i)=>`
    <div class="learn-card" id="learn-${i}">
      <div class="learn-num">${i+1} / ${LEARN_CARDS.length}</div>
      <h2>${esc(LANG==='te' ? c.te_t : c.en_t)}</h2>
      <p>${LANG==='te' ? c.te_b : c.en_b}</p>
    </div>`).join('');
  const dots = LEARN_CARDS.map((_,i)=>`<span class="learn-dot${i===0?' active':''}" data-i="${i}"></span>`).join('');
  return `
  <div class="hero"><h1>${t('nav_learn')}</h1><p>${t('learn_lede')}</p></div>
  <div class="learn-wrap">
    <div class="learn-track" id="learnTrack">${cards}</div>
    <div class="learn-nav">
      <button class="share-btn ghost" onclick="learnGo(-1)">←</button>
      <span class="learn-dots">${dots}</span>
      <button class="share-btn ghost" onclick="learnGo(1)">→</button>
    </div>
  </div>
  <p style="margin-top:12px"><a href="#/find">${t('find_link')} →</a></p>`;
}
window.learnGo = d => {
  const track = document.getElementById('learnTrack');
  if(!track) return;
  const cards = track.children;
  const w = cards[0].offsetWidth + 16;
  let i = Math.round(track.scrollLeft / w) + d;
  i = Math.max(0, Math.min(cards.length-1, i));
  track.scrollTo({left: i*w, behavior:'smooth'});
  document.querySelectorAll('.learn-dot').forEach((el,j)=>el.classList.toggle('active', j===i));
};
document.addEventListener('scroll', e=>{
  if(e.target && e.target.id==='learnTrack'){
    const track = e.target, w = track.children[0].offsetWidth + 16;
    const i = Math.round(track.scrollLeft / w);
    document.querySelectorAll('.learn-dot').forEach((el,j)=>el.classList.toggle('active', j===i));
  }
}, true);

/* ---------- glossary ---------- */
const GLOSSARY = [
 ["Affidavit","అఫిడవిట్","A sworn statement every candidate files before contesting — assets, liabilities, education, and pending criminal cases. The disclosures on this site come from these.","పోటీ చేయడానికి ముందు ప్రతి అభ్యర్థి దాఖలు చేసే ప్రమాణ పత్రం — ఆస్తులు, అప్పులు, విద్య, పెండింగ్ క్రిమినల్ కేసులు. ఈ సైట్‌లోని వెల్లడులు వీటి నుండే."],
 ["MPLADS","MPLADS","Members of Parliament Local Area Development Scheme — ₹5 crore a year per MP for local works, recommended by the MP and executed by the district.","పార్లమెంటు సభ్యుల స్థానిక ప్రాంత అభివృద్ధి పథకం — స్థానిక పనుల కోసం MPకి ఏటా ₹5 కోట్లు; MP సిఫార్సు చేస్తారు, జిల్లా యంత్రాంగం అమలు చేస్తుంది."],
 ["ACDP","ACDP","Assembly Constituency Development Programme — the MLA-area fund, about ₹1 crore a year per constituency. No public per-MLA dashboard exists.","అసెంబ్లీ నియోజకవర్గ అభివృద్ధి కార్యక్రమం — MLA ప్రాంత నిధి, నియోజకవర్గానికి ఏటా సుమారు ₹1 కోటి. MLA వారీ పబ్లిక్ డాష్‌బోర్డు లేదు."],
 ["Attendance","హాజరు","Share of Parliament sittings the MP was present for, from PRS Legislative Research.","PRS లెజిస్లేటివ్ రీసెర్చ్ ప్రకారం MP హాజరైన పార్లమెంటు సమావేశాల శాతం."],
 ["Questions asked","అడిగిన ప్రశ్నలు","Written and oral questions an MP raised in the House — a visible part of holding the government to account.","సభలో MP లేవనెత్తిన లిఖిత-మౌఖిక ప్రశ్నలు — ప్రభుత్వాన్ని జవాబుదారీ చేసే కనిపించే భాగం."],
 ["Private member bill","ప్రైవేట్ మెంబర్ బిల్లు","A bill introduced by an MP who is not a minister. Rarely passed, but shows legislative initiative.","మంత్రి కాని MP ప్రవేశపెట్టిన బిల్లు. అరుదుగా ఆమోదం పొందుతుంది, కానీ శాసన చొరవను చూపుతుంది."],
 ["Division vote","డివిజన్ ఓటు","A formal recorded vote in the House, used for major bills. The Lok Sabha does not publish member-level division lists.","ప్రధాన బిల్లులకు వాడే అధికారిక నమోదిత ఓటు. లోక్‌సభ సభ్యుల వారీ డివిజన్ జాబితాలను ప్రచురించదు."],
 ["Whip","విప్","A party's written order to its members on how to vote. Defying it can cost a legislator their seat.","ఎలా ఓటు వేయాలో పార్టీ సభ్యులకు ఇచ్చే లిఖిత ఆదేశం. ఉల్లంఘిస్తే సభ్యత్వం పోవచ్చు."],
 ["Vote share","ఓట్ల శాతం","The winner's votes as a percentage of all valid votes polled in the constituency.","నియోజకవర్గంలో పోలైన చెల్లుబాటు ఓట్లలో గెలిచినవారి ఓట్ల శాతం."],
 ["Winning margin","గెలుపు తేడా","The vote gap between the winner and the runner-up.","గెలిచినవారికి, రెండో స్థానంలో ఉన్నవారికి మధ్య ఓట్ల తేడా."],
 ["Turnout","పోలింగ్ శాతం","Share of registered voters who actually voted.","నమోదైన ఓటర్లలో నిజంగా ఓటు వేసినవారి శాతం."],
 ["Criminal cases (declared)","క్రిమినల్ కేసులు (ప్రకటిత)","Pending cases the candidate declared in the affidavit — not convictions.","అభ్యర్థి అఫిడవిట్‌లో ప్రకటించిన పెండింగ్ కేసులు — శిక్షలు కావు."],
 ["Serious vs non-serious","తీవ్రమైన vs సాధారణ","ADR's classification: offences with 5+ years' punishment, electoral offences, corruption, heinous crimes count as serious; protest cases, traffic and minor offences as non-serious.","ADR వర్గీకరణ: 5+ ఏళ్ల శిక్ష పడే నేరాలు, ఎన్నికల నేరాలు, అవినీతి, ఘోర నేరాలు తీవ్రమైనవి; ఆందోళన కేసులు, ట్రాఫిక్, చిన్న నేరాలు సాధారణమైనవి."],
 ["Asset growth","ఆస్తి వృద్ధి","Change in declared affidavit assets between the 2019 and 2024 elections (nominal). Shown only for re-elected members.","2019, 2024 ఎన్నికల మధ్య ప్రకటిత అఫిడవిట్ ఆస్తుల మార్పు (నామమాత్రపు). తిరిగి ఎన్నికైన సభ్యులకు మాత్రమే."],
 ["Constituency","నియోజకవర్గం","The area that elects one representative — 175 Assembly and 25 Parliamentary constituencies in AP.","ఒక ప్రతినిధిని ఎన్నుకునే ప్రాంతం — APలో 175 అసెంబ్లీ, 25 పార్లమెంటు నియోజకవర్గాలు."],
 ["Delimitation","డీలిమిటేషన్","The official redrawing of constituency boundaries (last done 2008) based on population.","జనాభా ఆధారంగా నియోజకవర్గ సరిహద్దుల అధికారిక పునర్విభజన (చివరిగా 2008లో)."],
 ["eSAKSHI","eSAKSHI","The government's MPLADS portal publishing each MP's fund allocation and works.","ప్రతి MP నిధుల కేటాయింపు, పనులను ప్రచురించే ప్రభుత్వ MPLADS పోర్టల్."],
 ["PRS","PRS","PRS Legislative Research — independent institute tracking Parliament's work; source of attendance/questions data.","పార్లమెంటు పనిని ట్రాక్ చేసే స్వతంత్ర సంస్థ; హాజరు/ప్రశ్నల డేటా మూలం."],
 ["ADR","ADR","Association for Democratic Reforms — analyses candidate affidavits; its criteria define serious vs non-serious cases here.","అభ్యర్థి అఫిడవిట్లను విశ్లేషించే సంస్థ; ఇక్కడ తీవ్ర/సాధారణ వర్గీకరణ వారి ప్రమాణాల ప్రకారం."],
 ["ECI","ECI","Election Commission of India — conducts elections and publishes official results.","ఎన్నికలు నిర్వహించి అధికారిక ఫలితాలు ప్రచురించే భారత ఎన్నికల సంఘం."],
 ["MGNREGA","MGNREGA","Rural employment guarantee: 100 days of wage work per rural household per year, on demand.","గ్రామీణ ఉపాధి హామీ: ప్రతి గ్రామీణ కుటుంబానికి ఏటా 100 రోజుల కూలీ పని, డిమాండ్‌పై."],
 ["PMAY-G","PMAY-G","Pradhan Mantri Awaas Yojana – Gramin: central assistance for rural housing.","గ్రామీణ గృహాలకు కేంద్ర సహాయం — ప్రధానమంత్రి ఆవాస్ యోజన (గ్రామీణ)."],
 ["NFHS","NFHS","National Family Health Survey — source of district health indicators like stunting and institutional births.","జిల్లా ఆరోగ్య సూచికల (ఎదుగుదల లోపం, సంస్థాగత ప్రసవాలు) మూలం — జాతీయ కుటుంబ ఆరోగ్య సర్వే."],
 ["SDG India Index","SDG ఇండియా సూచిక","NITI Aayog's scorecard ranking states and districts on sustainable-development goals.","సుస్థిర అభివృద్ధి లక్ష్యాలపై రాష్ట్రాలు, జిల్లాలను ర్యాంక్ చేసే నీతి ఆయోగ్ స్కోర్‌కార్డు."],
];
function viewGlossary(){
  const items = GLOSSARY.map(([en,te,enb,teb])=>`
    <section class="panel gloss"><h2>${esc(en)} <span class="gloss-te">${esc(te)}</span></h2>
    <p>${LANG==='te' ? teb : enb}</p></section>`).join('');
  return `<div class="hero"><h1>${t('nav_glossary')}</h1><p>${t('glossary_lede')}</p></div>${items}`;
}

/* ---------- compare ---------- */
function viewCompare(params){
  const house = params.get('house')==='mla' ? 'mla' : 'mp';
  const list = house==='mla' ? MLA : DATA.mps;
  const route = house==='mla' ? 'mla' : 'mp';
  const opts = list.map(mp=>`<option value="${slugOf(mp)}">${esc(mp.name)} (${esc(mp.constituency)})</option>`).join('');
  const a = list.find(m=>slugOf(m)===params.get('a'));
  const b = list.find(m=>slugOf(m)===params.get('b'));
  const col = mp => {
    if(!mp) return `<section class="panel"><p>${t('data_pending')}</p></section>`;
    const rows = house==='mla' ? `
      ${row(t('m_voteshare'), M(mp.election,'vote_share_pct'), fmtPct)}
      ${row(t('m_margin'), M(mp.election,'margin_votes'), fmtN)}
      ${row(t('total_cases'), M(mp.disclosure,'criminal_cases_declared'), fmtN)}
      ${row(t('assets_now'), M(mp.disclosure,'assets_current_inr'), fmtINR)}
      ${row(t('m_education'), M(mp.disclosure,'education'), v=>esc(v))}` : `
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
      ${row(t('m_turnout'), M(mp.election,'turnout_pct'), fmtPct)}`;
    return `
    <div class="profile-head"><h1 style="font-size:1.1rem"><a href="#/${route}/${slugOf(mp)}">${esc(mp.name)}</a></h1>
    <p class="sub">${esc(mp.constituency)} \u00b7 ${esc(mp.party||'')}</p></div>
    <section class="panel"><table class="metrics">${rows}
    </table></section>`;
  };
  return `
  <div class="hero"><h1>${t('compare_title')}</h1><p>${t('compare_lede')}</p>
    <div class="house-tabs">
      <button class="house-tab${house==='mp'?' active':''}" onclick="location.hash='#/compare?house=mp'">${t('house_mp')}</button>
      <button class="house-tab${house==='mla'?' active':''}" onclick="location.hash='#/compare?house=mla'">${t('house_mla')}</button>
    </div>
  </div>
  <div class="compare-selects">
    <select id="ca" onchange="goCompare('${house}')"><option value="">${t('select_a')}</option>${opts}</select>
    <select id="cb" onchange="goCompare('${house}')"><option value="">${t('select_b')}</option>${opts}</select>
  </div>
  <div class="compare-grid"><div>${col(a)}</div><div>${col(b)}</div></div>`;
}
window.goCompare = (house) => {
  const a=document.getElementById('ca').value, b=document.getElementById('cb').value;
  location.hash = `#/compare?house=${house||'mp'}&a=${a}&b=${b}`;
};
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
  <div class="hero"><h1>${t('districts_title')}</h1><p>${t('districts_lede')}</p>
    <p class="sub" style="margin:8px 0 0;color:var(--muted)">${t('home_counts')(ds.length, DATA.mps.length, MLA.length)}</p></div>
  <div id="map" class="map-box"><p style="padding:20px;color:var(--muted)">${t('map_loading')}</p></div>
  <p style="margin:16px 0 4px"><a href="#/find" style="font-weight:700">${t('find_link')}</a></p>
  <input id="dq" class="search" placeholder="${t('districts_search')}" oninput="filterDistricts(this.value)">
  <div class="mp-grid" style="margin-top:8px" id="dgrid">
    ${ds.map(d=>{ const info = distInfo(d); const n = districtMPs(d).length; const m = districtMLAs(d).length;
      return `<a class="mp-card" data-name="${esc(d)}${info.name_te?` ${esc(info.name_te)}`:''}" href="#/district/${slugify(d)}">
        <h3>${esc(d)}${info.name_te?` <span style="color:var(--muted);font-weight:400">${esc(info.name_te)}</span>`:''}</h3>
        <div class="cons">${n} MP${n===1?'':'s'} \u00b7 ${m} MLA${m===1?'':'s'}</div>
      </a>`; }).join('') || `<p>${t('data_pending')}</p>`}
  </div>`;
}
window.filterDistricts = q => {
  q = q.toLowerCase();
  document.querySelectorAll('#dgrid .mp-card').forEach(c=>{
    c.style.display = c.dataset.name.toLowerCase().includes(q) ? '' : 'none';
  });
};
function initMap(){
  const el = document.getElementById('map');
  if(!el) return;
  if(!GEO || typeof L === 'undefined'){
    el.innerHTML = `<p style="padding:20px;color:var(--muted)">${LITE ? esc(t('lite_note')) : t('map_unavailable')}</p>`;
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
  if(!d) return `<p>${t('no_results')}</p><p><a href="#/">${t('back')}</a></p>`;
  const info = distInfo(d);
  const mps = districtMPs(d);
  const inds = info.indicators || {};
  const JURIS = {literacy_pct:'state',institutional_births_pct:'state',stunting_under5_pct:'state',
    infant_mortality:'state',dropout_rate_secondary:'state',pupil_teacher_ratio_primary:'state',
    sdg_index_score:'shared',mgnrega_persondays_fy25:'central',pmayg_houses_completed:'central',
    jjm_tap_connections:'shared',per_capita_income_inr:'shared',
    crime_rate_per_lakh:'state',crimes_against_women_per_lakh:'state'};
  const jurisPill = k => { const j = JURIS[k]; if(!j) return '';
    return ` <span class="juris juris-${j}">${t('juris_'+j)}</span>`; };
  const irow = (label, m, fmt, key) => {
    const f = fmt || fmtN;
    if(!m || m.value==null) return `<tr><th>${label}${jurisPill(key)}</th><td><span class="pending">${t('data_pending')}</span></td></tr>`;
    return `<tr><th>${label}${jurisPill(key)}</th><td>${f(m.value)}${m.year?` <span class="sub">(${m.year})</span>`:''}${srcLink(m.source)}</td></tr>`;
  };
  return `
  <p><a href="#/">${t('back')}</a></p>
  <div class="profile-head">
    <h1>${esc(d)}${info.name_te?` <span style="color:var(--muted);font-weight:400;font-size:1.1rem">${esc(info.name_te)}</span>`:''}</h1>
    <p class="sub">${t('mps_in_district')}: ${mps.length}</p>
    <p><button class="correct-btn" style="margin-left:0" onclick="openCorrection('district','${slug}','${esc(d)}')">${t('correct_title')}</button></p>
  </div>
  <section class="panel"><h2>${t('mps_in_district')}</h2>
    <div class="mp-grid">
      ${mps.map(mp=>`<a class="mp-card" href="#/mp/${slugOf(mp)}">
        <div class="avatar">${initials(mp.name)}</div><h3>${esc(mp.name)}</h3>
        <div class="cons">${esc(mp.constituency)}</div><span class="party">${esc(mp.party||'')}</span>
      </a>`).join('') || `<p>${t('data_pending')}</p>`}
    </div>
  </section>
  <section class="panel"><h2>${t('mlas_in_district')}</h2>
    <div class="mp-grid">
      ${districtMLAs(d).map(mp=>`<a class="mp-card" href="#/mla/${slugOf(mp)}">
        <div class="avatar">${initials(mp.name)}</div><h3>${esc(mp.name)}</h3>
        <div class="cons">${esc(mp.constituency)}</div><span class="party">${esc(mp.party||'')}</span>
      </a>`).join('') || `<p>${t('data_pending')}</p>`}
    </div>
  </section>
  <section class="panel"><h2>${t('district_indicators')}</h2>
    <div class="area-note">${t('area_note')}</div>
    <table class="metrics">
      ${irow('Literacy', inds.literacy_pct, null, 'literacy_pct')}
      ${irow('Institutional births', inds.institutional_births_pct, null, 'institutional_births_pct')}
      ${irow('Stunting (under 5)', inds.stunting_under5_pct, null, 'stunting_under5_pct')}
      ${irow('Infant mortality', inds.infant_mortality, null, 'infant_mortality')}
      ${irow('Secondary dropout rate', inds.dropout_rate_secondary, null, 'dropout_rate_secondary')}
      ${irow('Pupil-teacher ratio (primary)', inds.pupil_teacher_ratio_primary, null, 'pupil_teacher_ratio_primary')}
      ${irow('SDG index score', inds.sdg_index_score, null, 'sdg_index_score')}
      ${irow('MGNREGA person-days', inds.mgnrega_persondays_fy25, null, 'mgnrega_persondays_fy25')}
      ${irow('PMAY-G houses completed', inds.pmayg_houses_completed, null, 'pmayg_houses_completed')}
      ${irow('Jal Jeevan tap connections', inds.jjm_tap_connections, null, 'jjm_tap_connections')}
      ${irow('Per-capita income', inds.per_capita_income_inr, fmtINR, 'per_capita_income_inr')}
      ${irow('Crime rate per lakh (2022) †', inds.crime_rate_per_lakh, null, 'crime_rate_per_lakh')}
      ${irow('Crimes against women per lakh (2022) †', inds.crimes_against_women_per_lakh, null, 'crimes_against_women_per_lakh')}
    </table>
    <div class="area-note">† Crime rates computed by this project: NCRB 2022 district incidence ÷ Census 2011 district population × 100,000 (NCRB publishes rates only at state/city level).</div>
    <div class="area-note"><strong>${t('juris_title')}</strong> ${t('juris_legend')}</div>
  </section>`;
}

/* ---------- find my representative ---------- */
function viewFind(){
  const ds = districtList();
  const opts = ds.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
  const hasM = (MANDALS.mandals||[]).length > 0;
  return `
  <div class="hero"><h1>${t('find_title')}</h1><p>${t('find_lede2')}</p></div>
  <section class="panel">
    <label class="fld">${t('find_district_label')}
      <select id="find-dist" onchange="renderFindMandals(this.value)">
        <option value="">${t('find_choose')}</option>${opts}
      </select></label>
    ${hasM ? `<label class="fld" id="find-mandal-wrap" style="display:none;margin-top:10px">${t('find_mandal_label')}
      <select id="find-mandal" onchange="renderFindMandal(this.value)"><option value="">${t('find_mandal_choose')}</option></select></label>` : ''}
    <div id="find-results" style="margin-top:16px"></div>
  </section>
  <p class="disclaimer">${t('find_note')}</p>`;
}
window.renderFindMandals = d => {
  const wrap = document.getElementById('find-mandal-wrap');
  const sel = document.getElementById('find-mandal');
  const box = document.getElementById('find-results');
  if(!d){ if(wrap) wrap.style.display='none'; if(box) box.innerHTML=''; return; }
  const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
  const seen = new Set(), ms = [];
  (MANDALS.mandals||[]).filter(m=>m.district===d && m.mandal).forEach(m=>{
    const k = norm(m.mandal);
    if(k && !seen.has(k)){ seen.add(k); ms.push(m.mandal); }
  });
  ms.sort();
  if(sel && ms.length){
    sel.innerHTML = `<option value="">${t('find_mandal_choose')}</option>` +
      ms.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    wrap.style.display = '';
  }
  renderFind(d);
};
window.renderFindMandal = mandal => {
  const box = document.getElementById('find-results');
  const d = document.getElementById('find-dist').value;
  if(!mandal){ renderFind(d); return; }
  const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
  const m = (MANDALS.mandals||[]).find(x=>x.district===d && norm(x.mandal)===norm(mandal));
  if(!m){ renderFind(d); return; }
  const mla = MLA.find(x=>slugOf(x)===m.ac_slug);
  const mp = DATA.mps.find(x=>slugOf(x)===m.pc_slug);
  const acName = mla ? mla.constituency : (m.ac_slug||'');
  const pcName = mp ? mp.constituency : (m.pc_slug||'');
  const note = m.note ? `<p class="disclaimer">${esc(m.note)}</p>` : '';
  const card = (r, route) => r ? `
    <a class="mp-card" href="#/${route}/${slugOf(r)}">
      <div class="avatar">${initials(r.name)}</div><h3>${esc(r.name)}</h3>
      <div class="cons">${esc(r.constituency)}</div><span class="party">${esc(r.party||'')}</span>
    </a>` : `<p><span class="pending">${t('data_pending')}</span></p>`;
  box.innerHTML = `
    <p class="sub" style="color:var(--muted)">${esc(mandal)} · ${t('find_ac_label')}: <strong>${esc(acName)}</strong> · ${t('find_pc_label')}: <strong>${esc(pcName)}</strong></p>
    ${note}
    <h3 style="margin:12px 0 8px">${t('find_your_mla_one')}</h3>
    <div class="mp-grid">${card(mla,'mla')}</div>
    <h3 style="margin:12px 0 8px">${t('find_your_mp_one')}</h3>
    <div class="mp-grid">${card(mp,'mp')}</div>
    <p style="margin-top:12px"><a href="#/district/${slugify(d)}">${t('find_district_page')}</a></p>`;
};
window.renderFind = d => {
  const box = document.getElementById('find-results');
  if(!d){ box.innerHTML=''; return; }
  const mps = districtMPs(d), mlas = districtMLAs(d);
  const card = (mp, route) => `
    <a class="mp-card" href="#/${route}/${slugOf(mp)}">
      <div class="avatar">${initials(mp.name)}</div><h3>${esc(mp.name)}</h3>
      <div class="cons">${esc(mp.constituency)}</div><span class="party">${esc(mp.party||'')}</span>
    </a>`;
  box.innerHTML = `
    <h3 style="margin:12px 0 8px">${t('find_your_mp')}</h3>
    <div class="mp-grid">${mps.map(m=>card(m,'mp')).join('') || `<p>${t('data_pending')}</p>`}</div>
    <h3 style="margin:12px 0 8px">${t('find_your_mla')}</h3>
    <div class="mp-grid">${mlas.map(m=>card(m,'mla')).join('') || `<p>${t('data_pending')}</p>`}</div>
    <p style="margin-top:12px"><a href="#/district/${slugify(d)}">${t('find_district_page')}</a></p>`;
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
    <p>జిల్లా గణాంకాలు ఆ ప్రాంతాన్ని వివరిస్తాయి — ప్రతినిధి సాధించినవి కావు. నియోజకవర్గాలు జిల్లాలతో సరిగ్గా సరిపోవు. జిల్లా నేరాల రేట్లు ఈ ప్రాజెక్ట్ లెక్కించినవి: NCRB 2022 జిల్లా సంఘటనలు ÷ 2011 జనాభా లెక్కల జిల్లా జనాభా × 100,000 (NCRB రేట్లను రాష్ట్ర/నగర స్థాయిలో మాత్రమే ప్రచురిస్తుంది).</p>
    <h2>ఓటింగ్ రికార్డు & ఆస్తి వృద్ధి</h2>
    <p>MP ఓటింగ్ రికార్డులు 18వ లోక్‌సభలో డివిజన్ ఓటుతో నిర్ణయించిన ప్రధాన బిల్లులను కవర్ చేస్తాయి. లోక్‌సభ సభ్యుల వారీ డివిజన్ జాబితాలను ప్రచురించదు, కాబట్టి ప్రతి ఓటు సభ్యుని నమోదైన పార్టీ వైఖరి లేదా విప్‌ను ప్రతిబింబిస్తుంది — ప్రతి ఓటుకు మూలంతో — అధికారిక డివిజన్ రోల్ కాదు. ఆస్తి వృద్ధి 2019 మరియు 2024 ఎన్నికల మధ్య ప్రకటించిన అఫిడవిట్ మొత్తాలను పోలుస్తుంది (నామమాత్రపు, ద్రవ్యోల్బణ సర్దుబాటు లేకుండా) మరియు తిరిగి ఎన్నికైన సభ్యులకు మాత్రమే చూపబడుతుంది; మొదటిసారి సభ్యులకు పోల్చడానికి పూర్వ అఫిడవిట్ ఉండదు.</p>
    <h2>వార్తల్లో</h2>
    <p>శీర్షికలు Google News (ఇండియా ఎడిషన్) నుండి ప్రతినిధి పేరు మరియు నియోజకవర్గం ఆధారంగా సేకరించబడతాయి, వారానికి ఒకసారి నవీకరించబడతాయి. శీర్షికలు మాత్రమే చూపబడతాయి — సైట్ సారాంశాలు రాయదు, భావోద్వేగ లేబుల్స్ ఇవ్వదు. శీర్షికలు వాటి ప్రచురణకర్తలకు లింక్ చేస్తాయి; చేర్చడం ఆమోదం కాదు, సైట్ వార్తా కంటెంట్‌ను ధృవీకరించదు.</p>
    <h2>MLAలు</h2>
    <p>175 మంది అసెంబ్లీ సభ్యులు (2024 ఎన్నిక) అదే నియమాలతో ట్రాక్ చేయబడుతున్నారు. AP శాసనసభ MLA వారీగా హాజరు, ప్రశ్నలు, చర్చల డేటాను ప్రచురించదు, రాష్ట్రం MLA వారీగా నిధుల వినియోగ లెక్కలను ప్రచురించదు — ఆ విభాగాలు ఖాళీగానే ఉండి, అదే చెబుతాయి. MLA ఎన్నికల లెక్కలను 16 అక్టోబర్ 2026న భారత ఎన్నికల సంఘం అధికారిక నియోజకవర్గ ఫలితాల పేజీలతో (ఆర్కైవ్ చేసినవి) సరిచూశాము: 175 నియోజకవర్గాలలో 154 ధృవీకరించబడ్డాయి — 147 సరిపోలాయి, 7 సరిచేయబడ్డాయి. 21 నియోజకవర్గాలకు ఆర్కైవ్ చేసిన అధికారిక పేజీ లేదు, కాబట్టి ఆ లెక్కలు ECI-ఆధారిత పట్టికల నుండే కొనసాగుతున్నాయి: ముమ్మిడివరం, రాజోలు (SC), భీమవరం, పెడన, మచిలీపట్నం, పొన్నూరు, వేమూరు (SC), ఆళ్లగడ్డ, పత్తికొండ, మంత్రాలయం, ఆదోని, తాడిపత్రి, రాప్తాడు, హిందూపూర్, పెనుకొండ, పుట్టపర్తి, ధర్మవరం, కదిరి, తంబళ్లపల్లె, పీలేరు, మదనపల్లె.</p>
    <h2>క్రిమినల్ కేసులు: తీవ్రమైనవి vs సాధారణవి</h2>
    <p>myneta.info అభ్యర్థుల వారీగా ADR తీవ్ర/సాధారణ విభజనను ప్రచురించదు — కాబట్టి తీవ్రత అనేది ADR ప్రచురించిన "తీవ్రమైన క్రిమినల్ కేసులు" ప్రమాణాల యాంత్రిక అనువర్తనం: 5+ సంవత్సరాల శిక్ష పడే నేరాలు; ఎన్నికల నేరాలు; అవినీతి/పన్ను ఎగవేత; SC/ST అత్యాచారాల నిరోధక చట్టం నేరాలు; హత్య, హత్యాయత్నం, అత్యాచారం, కిడ్నాప్ వంటి తీవ్ర వర్గాలు. మిగతావన్నీ — ఆందోళన కేసులు, ట్రాఫిక్ ఉల్లంఘనలు, చిన్న గాయాలు, చిన్న జరిమానాలు — సాధారణంగా లెక్క. ప్రతి అభియోగానికి ఆధారం పేర్కొనబడుతుంది. ప్రకటించిన కేసులు పెండింగ్ వ్యవహారాలు, శిక్షలు కావు.</p>`
  : `
    <h2>Sources</h2>
    <p>Legislative record: PRS Legislative Research · Funds: MPLADS portal · Affidavits: ADR/MyNeta · Election results: Election Commission of India · District outcomes: Census, NFHS, UDISE+, NITI Aayog SDG India Index, scheme dashboards (MGNREGA, PMAY-G, Jal Jeevan Mission).</p>
    <h2>Rules</h2>
    <p>Every number carries a source link — no exceptions. No adjectives about people: never "low attendance", always "attendance 43% vs. house average 78%". Identical layout for every party. No leaderboards, no verdicts.</p>
    <h2>Limits</h2>
    <p>District figures describe the area, not the representative's personal record. Constituencies do not map neatly onto districts. MPLADS allocation figures are 18th-Lok-Sabha cumulative as-on-date from the eSAKSHI portal (not FY-wise); per-MP expenditure and works counts are not published on the public dashboard. District crime rates are project-computed: NCRB 2022 district incidence ÷ Census 2011 district population × 100,000 (NCRB publishes rates only at state/city level).</p>
    <h2>Voting record & asset growth</h2>
    <p>MP voting records cover major bills decided by division vote in the 18th Lok Sabha. The Lok Sabha does not publish member-level division lists, so each vote reflects the member's documented party position or whip — sourced per vote — not the official division roll. Asset growth compares declared affidavit totals between the 2019 and 2024 elections (nominal, not inflation-adjusted) and is shown only for re-elected members; first-term members have no prior affidavit to compare.</p>
    <h2>In the news</h2>
    <p>Headlines are fetched from Google News (India edition) by representative name and constituency, refreshed weekly. Only headlines are shown — the site writes no summaries and offers no sentiment labels. Headlines link to their publishers; inclusion is not endorsement, and the site does not verify news content.</p>
    <h2>Criminal cases: serious vs non-serious</h2>
    <p>myneta.info does not publish ADR's own per-candidate serious/non-serious split, so severity is a mechanical application of ADR's published "serious criminal cases" criteria to the sections listed in each affidavit: offences punishable with 5+ years; electoral offences (e.g. IPC 171E/171H); corruption and tax-evasion offences; SC/ST (Prevention of Atrocities) Act offences; and heinous categories (murder, attempt to murder, rape, kidnapping, dacoity). Everything else — protest and public-order cases, traffic violations, simple hurt, minor statutory fines — counts as non-serious. Each charge carries its basis; borderline calls are flagged. Declared cases are pending matters, not convictions.</p>
    <h2>MLAs</h2>
    <p>All 175 Assembly members (2024 election) are tracked under the same rules. The AP Legislature publishes no per-MLA attendance, questions, or debates data, and the state publishes no per-MLA fund utilization figures — those sections stay visibly empty and say so. MLA election figures were verified on 16 Oct 2026 against the Election Commission of India's official constituency result pages (archived; the ECI site no longer hosts the June 2024 pages): 154 of 175 constituencies verified — 147 match the published figures and 7 were corrected from the official pages. For 21 constituencies no archived official page exists, so those figures remain as compiled from ECI-derived tables: Mummidivaram, Razole (SC), Bhimavaram, Pedana, Machilipatnam, Ponnuru, Vemuru (SC), Allagadda, Pattikonda, Mantralayam, Adoni, Tadipatri, Raptadu, Hindupur, Penukonda, Puttaparthi, Dharmavaram, Kadiri, Thamballapalle, Pileru, Madanapalle.</p>
    <h2>Corrections</h2>
    <p>Sourced corrections are applied visibly. If a cited source revises a figure, the record is updated with a new verification date.</p>`}
  </section>`;
}

/* ---------- screenshot-proof share cards ---------- */
function drawRepCard(mp, house){
  const W=1080, H=1350;
  const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
  const g = cv.getContext('2d');
  const NAVY='#1a2332', CREAM='#faf8f3', ACCENT='#0e7c6b', MUTED='#6b7280', INK='#1f2937';
  // background + frame
  g.fillStyle=CREAM; g.fillRect(0,0,W,H);
  g.strokeStyle=NAVY; g.lineWidth=10; g.strokeRect(5,5,W-10,H-10);
  // header band
  g.fillStyle=NAVY; g.fillRect(0,0,W,190);
  g.fillStyle='#ffffff'; g.font='700 44px system-ui, sans-serif'; g.textAlign='left';
  g.fillText('AP Representative Tracker', 60, 80);
  g.font='400 30px system-ui, sans-serif'; g.fillStyle='#cbd5e1';
  g.fillText(t('card_sub'), 60, 130);
  // avatar + name
  const initials = mp.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  g.fillStyle=ACCENT; g.beginPath(); g.arc(130,300,70,0,7); g.fill();
  g.fillStyle='#fff'; g.font='700 52px system-ui, sans-serif'; g.textAlign='center';
  g.fillText(initials, 130, 318);
  g.textAlign='left'; g.fillStyle=INK;
  const nameSize = mp.name.length>26 ? 44 : 54;
  g.font=`700 ${nameSize}px system-ui, sans-serif`;
  g.fillText(mp.name, 225, 295);
  g.font='400 34px system-ui, sans-serif'; g.fillStyle=MUTED;
  const houseLbl = house==='mla' ? t('assembly') : 'Lok Sabha';
  g.fillText(`${mp.constituency} · ${houseLbl}`, 225, 345);
  // party pill
  g.font='700 30px system-ui, sans-serif';
  const pw = g.measureText(mp.party||'').width + 44;
  g.fillStyle='#e6f4f1'; g.beginPath(); g.roundRect(225, 368, pw, 52, 26); g.fill();
  g.fillStyle=ACCENT; g.fillText(mp.party||'', 247, 404);
  // stats
  const L=mp.legislative||{}, F=mp.funds||{}, D=mp.disclosure||{}, E=mp.election||{};
  const caseVal = M(D,'criminal_cases_declared').value ?? M(D,'criminal_cases').value;
  const stats = house==='mla' ? [
    [t('m_voteshare'), fmtPct(M(E,'vote_share_pct').value)],
    [t('m_margin'), fmtN(M(E,'margin_votes').value)],
    [t('total_cases'), fmtN(caseVal)],
    [t('assets_now'), fmtINR(M(D,'assets_current_inr').value)],
  ] : [
    [t('m_voteshare'), fmtPct(M(E,'vote_share_pct').value)],
    [t('m_margin'), fmtN(M(E,'margin_votes').value)],
    [t('m_attendance'), fmtPct(M(L,'attendance_pct').value)],
    [t('m_questions'), fmtN(M(L,'questions_asked').value)],
    [t('m_debates'), fmtN(M(L,'debates_participated').value)],
    [t('m_mplads_alloc'), fmtINR(M(F,'entitlement_inr').value)],
  ];
  let y=500;
  g.font='400 32px system-ui, sans-serif';
  stats.forEach(([lbl,val],i)=>{
    if(i%2===0){ g.fillStyle='#f1ede4'; g.fillRect(60,y-44,W-120,76); }
    g.fillStyle=MUTED; g.textAlign='left'; g.fillText(lbl, 90, y);
    g.fillStyle=INK; g.font='700 34px system-ui, sans-serif'; g.textAlign='right';
    g.fillText(String(val), W-90, y);
    g.font='400 32px system-ui, sans-serif';
    y+=76;
  });
  // caveat line
  g.fillStyle=MUTED; g.font='italic 400 26px system-ui, sans-serif'; g.textAlign='left';
  g.fillText(t('card_caveat'), 60, y+30);
  // footer band
  const fy=H-190;
  g.fillStyle=NAVY; g.fillRect(0,fy,W,190);
  g.fillStyle='#ffffff'; g.font='400 28px system-ui, sans-serif';
  g.fillText(t('card_sources'), 60, fy+55);
  g.fillStyle='#cbd5e1';
  g.fillText(`${t('card_verify')} haribits150.github.io/ap-representative-tracker`, 60, fy+100);
  g.fillText(`${t('card_generated')} · ${t('card_sub')}`, 60, fy+145);
  return cv;
}
window.shareCard = (house, slug) => {
  const mp = (house==='mla' ? MLA : DATA.mps).find(m=>slugOf(m)===slug);
  if(!mp) return;
  const cv = drawRepCard(mp, house);
  const url = cv.toDataURL('image/png');
  const old = document.getElementById('cardModal'); if(old) old.remove();
  const div = document.createElement('div'); div.id='cardModal'; div.className='card-modal';
  div.innerHTML = `
    <div class="card-box">
      <h3>${t('card_title')}</h3>
      <img src="${url}" alt="representative card" style="width:100%;border-radius:8px;border:1px solid #ddd">
      <div class="card-actions">
        <a class="share-btn" href="${url}" download="${slug}-card.png">${t('card_download')}</a>
        <button class="share-btn" id="cardNative">${t('card_share')}</button>
        <button class="share-btn" id="cardClose">${t('card_close')}</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('cardClose').onclick = ()=>div.remove();
  div.onclick = e => { if(e.target===div) div.remove(); };
  document.getElementById('cardNative').onclick = () => {
    cv.toBlob(blob=>{
      const file = new File([blob], `${slug}-card.png`, {type:'image/png'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        navigator.share({files:[file], title: mp.name}).catch(()=>{});
      } else {
        const a=document.createElement('a'); a.href=url; a.download=`${slug}-card.png`; a.click();
      }
    }, 'image/png');
  };
};

/* ---------- router ---------- */
async function load(){
  const get = async p => { try{ const r = await fetch(p); return r.ok ? await r.json() : null; }catch(e){ return null; } };
  DATA = await get('data/mps.json') || {mps: []};
  const chunks = await Promise.all([1,2,3,4].map(i=>get(`data/mlas_${i}.json`)));
  MLA = chunks.reduce((a,c)=>a.concat((c&&c.mlas)||[]), []);
  DIST = await get('data/districts.json') || {districts: []};
  AFF = await get('data/affidavit_details.json') || {mps: []};
  CONTACTS = await get('data/contacts.json') || {contacts: {}};
  CHANGELOG = await get('data/changelog.json') || {entries: []};
  MANDALS = await get('data/mandals.json') || {mandals: []};
  NEWS = {news: {}};
  if(!LITE){
    const nchunks = await Promise.all([1,2,3,4].map(i=>get(`data/news_${i}.json`)));
    for(const c of nchunks){ if(c && c.news) Object.assign(NEWS.news, c.news); }
  }
  try{ const r = LITE ? {ok:false} : await fetch('data/ap_districts.geojson'); GEO = r.ok ? await r.json() : null; }catch(e){ GEO = null; }
}
const houseOf = mp => (mp.house==='assembly' || MLA.includes(mp)) ? 'mla' : 'mp';
/* district -> MPs inverse index from constituency_to_districts */
function asList(v){ return Array.isArray(v) ? v : (v && Array.isArray(v.districts) ? v.districts : []); }
function districtMPs(dname){
  const c2d = DATA.constituency_to_districts || {};
  const out = [];
  for(const mp of DATA.mps){
    const ds = asList(c2d[mp.constituency]).concat(asList(mp.district_context && mp.district_context.districts));
    if(ds.includes(dname)) out.push(mp);
  }
  return out;
}
function districtMLAs(dname){
  return MLA.filter(mp => asList(mp.district_context && mp.district_context.districts).includes(dname));
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
  if(route==='mp') app.innerHTML = viewProfile(arg||'','mp');
  else if(route==='mla') app.innerHTML = viewProfile(arg||'','mla');
  else if(route==='districts'){ app.innerHTML = viewDistricts(); initMap(); }
  else if(route==='district') app.innerHTML = viewDistrict(arg||'');
  else if(route==='find') app.innerHTML = viewFind();
  else if(route==='compare'){
    const params = new URLSearchParams(hash.split('?')[1]||'');
    app.innerHTML = viewCompare(params);
    if(params.get('a')) document.getElementById('ca').value = params.get('a');
    if(params.get('b')) document.getElementById('cb').value = params.get('b');
  }
  else if(route==='methodology') app.innerHTML = viewMethodology();
  else if(route==='changelog') app.innerHTML = viewChangelog();
  else if(route==='learn') app.innerHTML = viewLearn();
  else if(route==='glossary') app.innerHTML = viewGlossary();
  else { app.innerHTML = viewDistricts(); initMap(); }
  collapseEmpty();
  window.scrollTo(0,0);
}
/* sections with no published data start hidden behind a toggle */
function collapseEmpty(){
  const empties = document.querySelectorAll('.empty-section');
  if(!empties.length) return;
  empties.forEach(s=>{ s.style.display='none'; });
  const btn = document.createElement('button');
  btn.className = 'correct-btn'; btn.style.margin = '0 0 16px';
  btn.textContent = t('pending_toggle')(empties.length);
  btn.onclick = () => {
    const show = empties[0].style.display === 'none';
    empties.forEach(s=>{ s.style.display = show ? '' : 'none'; });
    btn.textContent = show ? t('pending_hide') : t('pending_toggle')(empties.length);
  };
  const head = document.querySelector('.profile-head');
  if(head) head.after(btn);
}
document.getElementById('lang-en').onclick = ()=>setLang('en');
document.getElementById('lang-te').onclick = ()=>setLang('te');
document.getElementById('lite-toggle').onclick = (e)=>{ e.preventDefault(); toggleLite(); };
window.addEventListener('hashchange', render);
(async ()=>{ await load(); setLang(LANG); })();
