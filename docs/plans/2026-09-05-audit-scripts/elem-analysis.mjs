import fs from "node:fs";
const j = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const root = "/Volumes/data/Dev/korean-elementary-learning-map/data/kr/";
const T = j(root + "topics.json").topics;
const D = j(root + "dependencies.json").dependencies;
const S = j(root + "curriculum-standards.json");
const C = j(root + "clusters.json").clusters;
const cnt = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); m[k] = (m[k] || 0) + 1; } return m; };
const sorted = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);

console.log("== sources", S.sources.map((s) => `${s.id} | ${s.title || s.name || ""} | ${s.noticeNo || s.notice || ""}`.slice(0, 120)));
const stds = S.curricula.flatMap((c) => c.standards);
console.log("== standards per subject", cnt(stds, (s) => s.subjectKorean));
console.log("== standards per gradeBand", cnt(stds, (s) => s.gradeBand));
console.log("== standards verificationStatus", cnt(stds, (s) => s.verificationStatus));
console.log("== standards with 2026 source", stds.filter((s) => s.sourceRefs.some((r) => /2026/.test(r))).length);

console.log("== topics per subject", cnt(T, (t) => t.subjectKorean));
console.log("== topics per gradeBand", cnt(T, (t) => t.gradeBand));
console.log("== topic type dist", cnt(T, (t) => t.type));
console.log("== topics per standard dist", cnt(Object.values(cnt(T, (t) => t.standards.join(","))), (x) => x));
console.log("== multi-standard topics", T.filter((t) => t.standards.length > 1).length);
console.log("== evidence count dist", cnt(T, (t) => t.evidence.length));
console.log("== missing assessmentPrompt", T.filter((t) => !t.assessmentPrompt || t.assessmentPrompt.length < 10).length);
console.log("== placeholder titleEnglish (micro-topic N)", T.filter((t) => /micro-topic \d+/.test(t.titleEnglish || "")).length, "null/empty titleEnglish", T.filter((t) => !t.titleEnglish).length);
// ID scheme patterns per subject
const idPattern = (id) => id.split(".").slice(2).map((seg) => (/^\d/.test(seg) ? "N" : /^[a-z]\d/.test(seg) ? "gN" : /\d{4}$/.test(seg) ? "CODE" : "w")).join(".");
const patBySub = {};
for (const t of T) { const k = t.subjectKorean; patBySub[k] = patBySub[k] || new Set(); patBySub[k].add(idPattern(t.id)); }
console.log("== id pattern variants per subject", Object.fromEntries(Object.entries(patBySub).map(([k, v]) => [k, [...v].slice(0, 3)])));
console.log("== facet suffix dist", sorted(cnt(T, (t) => t.id.split(".").pop())).slice(0, 15));
console.log("== titles with ' - ' facet pattern", T.filter((t) => / - /.test(t.title)).length);
console.log("== title == standard summary + facet? long titles >60 chars", T.filter((t) => t.title.length > 60).length, "avg title len", Math.round(T.reduce((a, t) => a + t.title.length, 0) / T.length));
// evidence template reuse
const evNorm = new Map();
for (const t of T) for (const e of t.evidence) { const k = e.replace(t.title.split(" - ")[0], "X").replace(/\[.*?\]/g, "").slice(0, 80); evNorm.set(k, (evNorm.get(k) || 0) + 1); }
console.log("== evidence template reuse top", [...evNorm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => v + "x " + k));
console.log("== distinct evidence templates", evNorm.size, "of", T.reduce((a, t) => a + t.evidence.length, 0));
// exact duplicate evidence strings
console.log("== exact duplicate evidence strings", T.flatMap((t) => t.evidence).length - new Set(T.flatMap((t) => t.evidence)).size);
console.log("== exact duplicate assessmentPrompt", T.length - new Set(T.map((t) => t.assessmentPrompt)).size);

// deps
console.log("== dep strength", cnt(D, (d) => d.strength), "basis", cnt(D, (d) => d.basis));
const byT = new Map(T.map((t) => [t.id, t]));
const g = (id) => byT.get(id);
const crossGrade = D.filter((d) => g(d.topicId).gradeBand !== g(d.prerequisiteId).gradeBand).length;
const crossStd = D.filter((d) => g(d.topicId).sourceStandardCode !== g(d.prerequisiteId).sourceStandardCode).length;
const crossDomain = D.filter((d) => g(d.topicId).domainKorean !== g(d.prerequisiteId).domainKorean).length;
console.log("== deps total", D.length, "crossGrade", crossGrade, "crossStandard", crossStd, "crossDomain", crossDomain, "intraStandard", D.length - crossStd);
const perSub = {};
for (const d of D) { const s = g(d.topicId).subjectKorean; perSub[s] = perSub[s] || { deps: 0, crossStd: 0, crossGrade: 0 }; perSub[s].deps++; if (g(d.topicId).sourceStandardCode !== g(d.prerequisiteId).sourceStandardCode) perSub[s].crossStd++; if (g(d.topicId).gradeBand !== g(d.prerequisiteId).gradeBand) perSub[s].crossGrade++; }
const topicsPerSub = cnt(T, (t) => t.subjectKorean);
for (const s in perSub) perSub[s].topics = topicsPerSub[s];
console.log("== per subject deps", perSub);
const hasIn = new Set(D.map((d) => d.topicId)), hasOut = new Set(D.map((d) => d.prerequisiteId));
const iso = T.filter((t) => !hasIn.has(t.id) && !hasOut.has(t.id));
console.log("== isolated topics", iso.length, cnt(iso, (t) => t.subjectKorean));
// components: standards fully disconnected from other standards (per subject, share of standards with any cross-standard edge)
const stdWithCross = new Set();
for (const d of D) if (g(d.topicId).sourceStandardCode !== g(d.prerequisiteId).sourceStandardCode) { stdWithCross.add(g(d.topicId).standards[0]); stdWithCross.add(g(d.prerequisiteId).standards[0]); }
console.log("== standards touched by cross-standard edges", stdWithCross.size, "of", stds.length);
const perSubStdCross = {};
for (const s of stds) { const k = s.subjectKorean; perSubStdCross[k] = perSubStdCross[k] || { total: 0, linked: 0 }; perSubStdCross[k].total++; if (stdWithCross.has(s.key)) perSubStdCross[k].linked++; }
console.log("== per subject standards linked across standards", perSubStdCross);
// reason templates
console.log("== reason templates top", sorted(cnt(D, (d) => d.reason.replace(/\[.*?\]/g, "[]").replace(/^[^은는의이가]*?(은|는|의|이|가)\s/, "X$1 ").slice(0, 50))).slice(0, 8));
// depth
const pre = {}; for (const d of D) (pre[d.topicId] = pre[d.topicId] || []).push(d.prerequisiteId);
const memo = {}; const depth = (id) => { if (memo[id] != null) return memo[id]; const p = pre[id] || []; memo[id] = p.length ? 1 + Math.max(...p.map(depth)) : 0; return memo[id]; };
console.log("== depth dist", cnt(T, (t) => depth(t.id)));
const perSubDepth = {}; for (const t of T) { const k = t.subjectKorean; perSubDepth[k] = Math.max(perSubDepth[k] || 0, depth(t.id)); }
console.log("== max depth per subject", perSubDepth);
// gaps
console.log("== gap severity", cnt(S.coverageGaps, (x) => x.severity), "status", cnt(S.coverageGaps, (x) => x.status));
// clusters
console.log("== cluster size dist", sorted(cnt(C, (c) => c.topicCount)).slice(0, 10), "topics in no cluster", T.length - new Set(C.flatMap((c) => c.topics)).size);
// standards without topics
const stdWithTopic = new Set(T.flatMap((t) => t.standards));
console.log("== standards without topics", stds.filter((s) => !stdWithTopic.has(s.key)).length);
// sourceLocator presence
console.log("== topics with pdfPage locator", T.filter((t) => t.sourceLocator && t.sourceLocator.pdfPage).length, "printedPage", T.filter((t) => t.sourceLocator && t.sourceLocator.printedPage).length);
console.log("== standards summary length dist <12", stds.filter((s) => (s.summary || "").length < 12).length, "avg", Math.round(stds.reduce((a, s) => a + (s.summary || "").length, 0) / stds.length));
