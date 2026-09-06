const categoryLabels = { common:'공통', 'middle-elective':'중학교 선택', 'general-elective':'일반 선택', 'career-elective':'진로 선택', 'convergence-elective':'융합 선택', 'specialized-common':'전문 공통', 'major-general':'전공 일반', 'major-practical':'전공 실무' };
const transitionLabels = { 'continues':'이어짐', 'deepens':'심화', 'prepares-for':'준비' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const number = (value) => new Intl.NumberFormat('ko-KR').format(value);

let map;
let selectedCourseId = null;
let detailController = null;

async function init() {
  const response = await fetch('data/map-index.json');
  if (!response.ok) throw new Error(`지도 인덱스를 불러오지 못했습니다 (${response.status})`);
  map = await response.json();
  renderStats();
  setupTabs();
  setupFilters();
  setupTransitions();
  setupElementaryBridges();
  setupCompare();
  renderPathways();
  renderProvenance();
  $('#footer-version').textContent = `${map.version} · 공식 원문 비포함 · 공개 공식 자료 기반`;
}

function renderStats() {
  const s = map.statistics;
  const items = [['공식 문서',s.officialDocuments],['중학교 공식 관계',s.middleOfficialRelations],['고교 공식 주제 관계',s.highOfficialRelations],['초→중 공식 전이',s.elementaryOfficialTransitions],['중→고 공식 전이',s.officialTransitions],['권장 순서(후보)',s.middleCandidateRelations+s.highCandidateRelations+s.elementaryCandidateTransitions]];
  $('#stats').innerHTML = items.map(([label,value]) => `<div class="stat"><strong>${number(value)}</strong><span>${label}</span></div>`).join('');
}

function setupTabs() {
  const tabs = $$('.tabs [role="tab"]');
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key==='Home' ? 0 : event.key==='End' ? tabs.length-1 : (index + (event.key==='ArrowRight'?1:-1) + tabs.length) % tabs.length;
      tabs[next].focus(); activateTab(tabs[next]);
    });
  });
}
function activateTab(tab) {
  $$('.tabs [role="tab"]').forEach((item) => item.setAttribute('aria-selected',String(item===tab)));
  $$('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== tab.dataset.tab; });
}

function setupFilters() {
  const groups = [...new Set(map.courses.map((course) => course.groupLabel))].sort((a,b)=>a.localeCompare(b,'ko'));
  $('#group-filter').insertAdjacentHTML('beforeend',groups.map((value)=>`<option>${escapeHtml(value)}</option>`).join(''));
  const categories = [...new Set(map.courses.map((course)=>course.category))];
  $('#category-filter').insertAdjacentHTML('beforeend',categories.map((value)=>`<option value="${value}">${categoryLabels[value]??value}</option>`).join(''));
  ['level-filter','group-filter','category-filter','program-filter'].forEach((id)=>$(`#${id}`).addEventListener('change',renderCourses));
  $('#course-search').addEventListener('input',renderCourses);
  renderCourses();
}
function filteredCourses() {
  const level=$('#level-filter').value, group=$('#group-filter').value, category=$('#category-filter').value, program=$('#program-filter').value, query=$('#course-search').value.trim().toLocaleLowerCase('ko');
  return map.courses.filter((course)=>(level==='all'||course.level===level)&&(group==='all'||course.groupLabel===group)&&(category==='all'||course.category===category)&&(program==='all'||course.programScope===program)&&(!query||`${course.label} ${course.groupLabel} ${categoryLabels[course.category]}`.toLocaleLowerCase('ko').includes(query)));
}
function renderCourses() {
  const courses=filteredCourses();
  $('#course-result-count').textContent=`${number(courses.length)}개 과목`;
  $('#course-list').innerHTML=courses.length ? courses.map((course)=>`<button class="course-button" data-id="${course.id}" aria-current="${course.id===selectedCourseId}"><span><strong>${escapeHtml(course.label)}</strong><span>${course.level==='middle'?'중학교':'고등학교'} · ${escapeHtml(course.groupLabel)} · ${categoryLabels[course.category]??course.category}</span></span><b>${number(course.standardCount)}</b></button>`).join('') : '<p class="empty-message">조건에 맞는 과목이 없습니다.</p>';
  $$('.course-button').forEach((button)=>button.addEventListener('click',()=>openCourse(button.dataset.id)));
}
async function openCourse(id) {
  selectedCourseId=id; renderCourses();
  const course=map.courses.find((item)=>item.id===id);
  $('#course-detail').className='detail'; $('#course-detail').innerHTML='<p class="empty-message">과목 근거를 불러오는 중…</p>';
  detailController?.abort(); detailController=new AbortController();
  try { const response=await fetch(course.detailFile,{signal:detailController.signal}); if(!response.ok) throw new Error(response.status); renderCourseDetail(await response.json()); }
  catch(error) { if(error.name!=='AbortError') $('#course-detail').innerHTML='<p class="empty-message">상세 데이터를 불러오지 못했습니다.</p>'; }
}
function renderCourseDetail(detail) {
  const course=detail.course;
  const courseRelations=detail.courseRelations??[];
  const relationCount=detail.relations.length+courseRelations.length;
  const topicsByStandard=new Map();
  const domainById=new Map(detail.domains.map((domain)=>[domain.id,domain]));
  detail.topics.forEach((topic)=>topic.standardAlignments.forEach((alignment)=>{if(!topicsByStandard.has(alignment.standardId))topicsByStandard.set(alignment.standardId,[]);topicsByStandard.get(alignment.standardId).push(topic);}));
  const sourceLine=(relation)=>`<p class="relation-source"><strong>근거</strong> ${escapeHtml(relation.basis)}<br><strong>출처</strong> ${relation.sourceRefs.map(escapeHtml).join(', ')}</p>`;
  const topicRelations=detail.relations.map((relation)=>`<article class="relation-card"><span class="relation-badge">공식 문서 근거</span><small>주제 선수학습</small><div class="relation-route"><div><span>${escapeHtml(relation.prerequisite.courseLabels.join(', '))}</span><strong>${escapeHtml(relation.prerequisite.label)}</strong></div><b aria-hidden="true">→</b><div><span>${escapeHtml(relation.dependent.courseLabels.join(', '))}</span><strong>${escapeHtml(relation.dependent.label)}</strong></div></div>${sourceLine(relation)}</article>`).join('');
  const officialCourseRelations=courseRelations.map((relation)=>`<article class="relation-card"><span class="relation-badge">공식 문서 근거</span><small>과목 연계</small><div class="relation-route"><div><strong>${escapeHtml(relation.from.label)}</strong></div><b aria-hidden="true">→</b><div><strong>${escapeHtml(relation.to.label)}</strong></div></div>${sourceLine(relation)}</article>`).join('');
  const relationContent=relationCount ? `<div class="relation-list">${topicRelations}${officialCourseRelations}</div>` : '<div class="relation-empty" role="status"><strong>공식 문서가 명시한 선수학습 관계 없음</strong><span>관계 0건은 누락이나 오류가 아니라, 현재 공식 문서 근거에서 확인된 관계가 없다는 뜻입니다.</span></div>';
  const candidates=detail.candidateRelations??[];
  const candidateCards=candidates.slice(0,60).map((relation)=>`<article class="relation-card candidate"><span class="relation-badge candidate">권장 순서 후보</span><small>${relation.basisKind==='decomposition-order'?'주제 분해 순서':'성취기준 코드 순서'}</small><div class="relation-route"><div><span>${escapeHtml(relation.prerequisite.courseLabels.join(', '))}</span><strong>${escapeHtml(relation.prerequisite.label)}</strong></div><b aria-hidden="true">→</b><div><span>${escapeHtml(relation.dependent.courseLabels.join(', '))}</span><strong>${escapeHtml(relation.dependent.label)}</strong></div></div>${sourceLine(relation)}</article>`).join('');
  const candidateSection=candidates.length?`<section class="relation-section" aria-labelledby="candidate-relations-title"><div class="relation-heading"><div><p class="eyebrow">RECOMMENDED ORDER</p><h4 id="candidate-relations-title">권장 순서(후보)</h4></div><strong>${number(candidates.length)}건</strong></div><p class="relation-note">공식 선수 관계가 아니라 성취기준 코드 순서와 주제 분해 순서에서 저장소가 만든 학습 순서 제안입니다. 전문가 검토 전 후보입니다.</p><div class="relation-list">${candidateCards}</div>${candidates.length>60?`<p class="relation-note">전체 ${number(candidates.length)}건 중 60건만 표시합니다.</p>`:''}</section>`:'';
  $('#course-detail').innerHTML=`<p class="eyebrow">${course.schoolLevel==='middle'?'MIDDLE SCHOOL':'HIGH SCHOOL'} · COURSE</p><h3>${escapeHtml(course.labelKorean)}</h3><div class="chips"><span class="chip">${escapeHtml(detail.subjectGroup.labelKorean)}</span><span class="chip">${categoryLabels[course.courseCategory]??course.courseCategory}</span><span class="chip">공식 코드 확인</span><span class="chip">공식 관계 ${number(relationCount)}건</span></div><div class="hierarchy"><span>L0 ${course.schoolLevel==='middle'?'중학교':'고등학교'}</span><i>→</i><span>L1 ${escapeHtml(detail.subjectGroup.labelKorean)}</span><i>→</i><span>L2 ${escapeHtml(course.labelKorean)}</span><i>→</i><span>L3 영역 ${number(detail.domains.length)}</span><i>→</i><span>L4 기준 ${number(detail.standards.length)} · 주제 ${number(detail.topics.length)}</span><i>→</i><span>L5 공식 근거</span></div><section class="relation-section" aria-labelledby="official-relations-title"><div class="relation-heading"><div><p class="eyebrow">OFFICIAL RELATIONS</p><h4 id="official-relations-title">공식 문서 관계</h4></div><strong>${number(relationCount)}건</strong></div>${relationContent}</section>${candidateSection}<div class="standard-tools"><input id="standard-search" type="search" placeholder="성취기준 코드·요약 검색" aria-label="성취기준 검색"></div><div id="standard-list" class="standard-list"></div>`;
  const renderStandards=()=>{
    const query=$('#standard-search').value.trim().toLocaleLowerCase('ko');
    const standards=detail.standards.filter((standard)=>!query||`${standard.code} ${standard.summary}`.toLocaleLowerCase('ko').includes(query)).slice(0,80);
    $('#standard-list').innerHTML=standards.length?standards.map((standard)=>{const topics=topicsByStandard.get(standard.id)??[],domain=domainById.get(standard.domainId);return `<details class="standard"><summary><code>${escapeHtml(standard.code)}</code> ${escapeHtml(standard.summary)}</summary><div class="standard__body"><p><strong>영역</strong><br>${escapeHtml(domain?.labelKorean??'영역 미확인')}</p><p><strong>세부 주제 ${number(topics.length)}개</strong><br>${topics.map((topic)=>`${escapeHtml(topic.labelKorean)}${topic.contentKind==='source-grounded-draft'?' <span class="content-badge">검토 초안</span>':''}`).join('<br>')||'연결 주제 없음'}</p><p><strong>관찰 증거</strong><br>${topics.map((topic)=>escapeHtml(topic.evidence?.[0]??'')).join('<br>')}</p><p><strong>평가 질문</strong><br>${topics.map((topic)=>escapeHtml(topic.assessmentPrompts?.[0]??'')).join('<br>')}</p><p class="source-line">PDF p.${standard.sourceLocator.pdfPage} · ${escapeHtml(standard.sourceLocator.sourceId)} · SHA-256 ${escapeHtml(standard.sourceLocator.sha256.slice(0,16))}… · 기계적 파생 요약</p></div></details>`}).join(''):'<p class="empty-message">일치하는 성취기준이 없습니다.</p>';
  }; $('#standard-search').addEventListener('input',renderStandards); renderStandards();
}

function setupTransitions() {
  const groups=[...new Set(map.transitions.map((item)=>item.from.groupLabel).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  $('#transition-group').insertAdjacentHTML('beforeend',groups.map((value)=>`<option>${escapeHtml(value)}</option>`).join(''));
  $('#transition-group').addEventListener('change',renderTransitions); $('#transition-search').addEventListener('input',renderTransitions); renderTransitions();
}
function renderTransitions() {
  const group=$('#transition-group').value, query=$('#transition-search').value.trim().toLocaleLowerCase('ko');
  const rows=map.transitions.filter((item)=>(group==='all'||item.from.groupLabel===group)&&(!query||`${item.from.label} ${item.to.courseLabels.join(' ')}`.toLocaleLowerCase('ko').includes(query)));
  $('#transition-result-count').textContent=`공식 전이 관계 ${number(rows.length)}건`;
  $('#transition-list').innerHTML=rows.length?rows.map((item)=>`<article class="transition"><div class="transition__node"><small>중학교 · ${escapeHtml(item.from.groupLabel)}</small><strong>${escapeHtml(item.from.courseLabel)}</strong><span>${escapeHtml(item.from.label)}</span></div><div class="transition__edge"><span>${transitionLabels[item.kind]??item.kind}</span><b aria-hidden="true">→</b><small>공식 문서 근거</small></div><div class="transition__node"><small>고등학교 과목</small><strong>${escapeHtml(item.to.courseLabels.join(', '))}</strong><span>${escapeHtml(item.to.topicLabel)}</span></div><p class="transition__source"><strong>근거</strong> ${escapeHtml(item.basis)}<br><strong>출처</strong> ${item.sourceRefs.map(escapeHtml).join(', ')}</p></article>`).join(''):'<p class="empty-message">조건에 맞는 공식 전이 관계가 없습니다.</p>';
}

const bridgeRenderLimit = 200;
let elementaryBridges = null;
function setupElementaryBridges() {
  ['bridge-layer','bridge-course','bridge-search'].forEach((id)=>$(`#${id}`).addEventListener(id==='bridge-search'?'input':'change',renderElementaryBridges));
  $('#tab-transitions').addEventListener('click',loadElementaryBridges,{once:true});
  if (!$('#transitions').hidden) loadElementaryBridges();
}
async function loadElementaryBridges() {
  if (elementaryBridges) return;
  $('#bridge-list').innerHTML='<p class="empty-message">초→중 전이 근거를 불러오는 중…</p>';
  try {
    const response=await fetch(map.elementaryBridgeFile);
    if(!response.ok) throw new Error(response.status);
    elementaryBridges=await response.json();
  } catch { $('#bridge-list').innerHTML='<p class="empty-message">초→중 전이 데이터를 불러오지 못했습니다.</p>'; return; }
  const courses=[...new Set(elementaryBridges.records.map((item)=>item.to.courseLabel))].sort((a,b)=>a.localeCompare(b,'ko'));
  $('#bridge-course').insertAdjacentHTML('beforeend',courses.map((value)=>`<option>${escapeHtml(value)}</option>`).join(''));
  renderElementaryBridges();
}
function renderElementaryBridges() {
  if (!elementaryBridges) return;
  const layer=$('#bridge-layer').value, course=$('#bridge-course').value, query=$('#bridge-search').value.trim().toLocaleLowerCase('ko');
  const rows=elementaryBridges.records.filter((item)=>(layer==='all'||item.layer===layer)&&(course==='all'||item.to.courseLabel===course)&&(!query||`${item.from.code} ${item.from.subjectLabel} ${item.from.domainLabel} ${item.to.courseLabel} ${item.to.domainLabel} ${item.to.topicLabel}`.toLocaleLowerCase('ko').includes(query)));
  const official=rows.filter((item)=>item.layer==='official').length;
  $('#bridge-result-count').textContent=`초→중 전이 ${number(rows.length)}건 (공식 ${number(official)} · 권장(후보) ${number(rows.length-official)})`;
  $('#bridge-layer-note').textContent=elementaryBridges.layers.find((item)=>item.id===layer)?.note ?? '권장(후보)는 공식 선수 관계가 아니라 저장소의 순서 제안입니다.';
  const shown=rows.slice(0,bridgeRenderLimit);
  const cards=shown.map((item)=>{
    const isCandidate=item.layer==='pedagogical-candidate';
    return `<article class="transition${isCandidate?' candidate':''}"><div class="transition__node"><small>초등학교 · ${escapeHtml(item.from.subjectLabel)} ${escapeHtml(item.from.gradeBand)}학년군</small><strong>${escapeHtml(item.from.domainLabel)}</strong><span>${escapeHtml(item.from.code)}</span></div><div class="transition__edge${isCandidate?' candidate':''}"><span>${isCandidate?'권장(후보)':'공식 문서 근거'}</span><b aria-hidden="true">→</b><small>${isCandidate?'순서 제안':'선수 관계'}</small></div><div class="transition__node"><small>중학교 · ${escapeHtml(item.to.courseLabel)} ${escapeHtml(item.to.domainLabel)}</small><strong>${escapeHtml(item.to.topicLabel)}</strong></div><p class="transition__source"><strong>근거</strong> ${escapeHtml(item.basis)}<br><strong>출처</strong> ${item.sourceRefs.map(escapeHtml).join(', ')}</p></article>`;
  }).join('');
  const note=rows.length>shown.length?`<p class="relation-note">전체 ${number(rows.length)}건 중 ${number(shown.length)}건만 표시합니다. 층·과목·검색으로 범위를 좁혀 주세요.</p>`:'';
  $('#bridge-list').innerHTML=rows.length?`${cards}${note}`:'<p class="empty-message">조건에 맞는 초→중 전이가 없습니다.</p>';
}

function setupCompare() {
  const options=map.courses.map((course)=>`<option value="${course.id}">${course.level==='middle'?'중':'고'} · ${escapeHtml(course.label)} (${escapeHtml(course.groupLabel)})</option>`).join('');
  $('#compare-a').innerHTML=options; $('#compare-b').innerHTML=options; $('#compare-b').selectedIndex=Math.min(25,map.courses.length-1);
  $('#compare-a').addEventListener('change',renderCompare); $('#compare-b').addEventListener('change',renderCompare); renderCompare();
}
function renderCompare() {
  const cards=[$('#compare-a').value,$('#compare-b').value].map((id)=>map.courses.find((course)=>course.id===id));
  $('#compare-grid').innerHTML=cards.map((course)=>`<article class="compare-card"><p class="eyebrow">${course.level==='middle'?'MIDDLE':'HIGH'} · ${categoryLabels[course.category]??course.category}</p><h3>${escapeHtml(course.label)}</h3><p>${escapeHtml(course.groupLabel)}</p><div class="metric"><span>성취기준</span><b>${number(course.standardCount)}</b></div><div class="metric"><span>세부 주제</span><b>${number(course.topicCount)}</b></div><div class="metric"><span>공식 문서 관계</span><b>${number(course.relationCount)}</b></div><div class="metric"><span>관계 근거</span><b>공식 출처 확인</b></div></article>`).join('');
}
function renderPathways() { $('#pathway-list').innerHTML=map.pathways.map((pathway)=>`<article class="pathway"><span class="chip candidate">${pathway.reviewStatus}</span><h3>${escapeHtml(pathway.labelKorean)}</h3><p>${escapeHtml(pathway.steps.map((step)=>step.reason).join(' · '))}</p><p><strong>대안 과목:</strong> ${pathway.steps.flatMap((step)=>step.courseLabels).slice(0,6).map(escapeHtml).join(', ')||'비교 묶음에서 선택'}</p></article>`).join(''); }
function renderProvenance() { $('#boundary-list').innerHTML=map.boundaries.map((text,index)=>`<article class="boundary"><b>0${index+1}</b>${escapeHtml(text)}</article>`).join(''); }

init().catch((error)=>{ console.error(error); document.body.insertAdjacentHTML('afterbegin','<p class="empty-message">학습지도 데이터를 불러오지 못했습니다. 서버 상태를 확인해 주세요.</p>'); });
