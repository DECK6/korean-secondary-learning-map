import fs from "node:fs";
const j = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const root = "/Volumes/data/Dev/korean-secondary-learning-map/data/kr/";
const rec = (p) => j(root + p).records;
const cnt = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); m[k] = (m[k] || 0) + 1; } return m; };
const sorted = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);

// ---------- MIDDLE ----------
const mc = rec("middle/courses.json"), md = rec("middle/domains.json"), ms = rec("middle/standards.json"), mt = rec("middle/topics.json"), mr = rec("middle/learning-relations.json"), mcl = rec("middle/clusters.json"), msg = rec("middle/subject-groups.json");
const cname = new Map(mc.map((c) => [c.id, c.labelKorean]));
console.log("== middle courses", mc.map((c) => `${c.labelKorean}(${c.courseCategory},${(c.gradeScope || []).join("/")})`).join(", "));
console.log("== middle course reviewStatus", cnt(mc, (c) => c.reviewStatus));
console.log("== middle standards per course", sorted(cnt(ms, (s) => cname.get(s.courseId))));
console.log("== middle standards summaryKind", cnt(ms, (s) => s.summaryKind), "reviewStatus", cnt(ms, (s) => s.reviewStatus), "printedPage present", ms.filter((s) => s.sourceLocator?.printedPage != null).length, "pdfPage", ms.filter((s) => s.sourceLocator?.pdfPage != null).length);
console.log("== middle standards with grade info?", cnt(ms, (s) => Object.keys(s).filter((k) => /grade/i.test(k)).join(",") || "none"));
console.log("== middle topics decompositionKind", cnt(mt, (t) => t.decompositionKind), "facetKey", sorted(cnt(mt, (t) => t.facetKey || "core")));
console.log("== middle topics reviewStatus", cnt(mt, (t) => t.reviewStatus), "verificationStatus", cnt(mt, (t) => t.verificationStatus), "types", cnt(mt, (t) => (t.types || []).join("+")));
console.log("== middle topics per standard dist", cnt(Object.values(cnt(mt.flatMap((t) => t.standardAlignments.map((a) => a.standardId)), (x) => x)), (x) => x));
console.log("== middle topics evidence count", cnt(mt, (t) => t.evidence.length), "prompts", cnt(mt, (t) => (t.assessmentPrompts || []).length));
console.log("== middle alignmentKind", cnt(mt.flatMap((t) => t.standardAlignments), (a) => a.alignmentKind), "basis", cnt(mt.flatMap((t) => t.standardAlignments), (a) => a.basis));
// evidence template reuse in middle
const evN = new Map(); for (const t of mt) for (const e of t.evidence) { const k = e.replace(/‘.*?’/g, "F").replace(/학습자가 .*?와 관련된/, "학습자가 X와 관련된").slice(0, 70); evN.set(k, (evN.get(k) || 0) + 1); }
console.log("== middle evidence templates top", [...evN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => v + "x " + k), "distinct", evN.size);
console.log("== middle label whitespace artifacts (e.g. '특 징')", mt.filter((t) => /[가-힣] [가-힣](?![가-힣])/.test(t.labelKorean) && /[가-힣] [가-힣]/.test(t.labelKorean.replace(/ — /g, ""))).length);
console.log("== middle labels containing broken spacing sample", mt.filter((t) => /특 징|이 해|학 습|문 제/.test(t.labelKorean)).slice(0, 3).map((t) => t.labelKorean.slice(0, 80)));
console.log("== middle standard summaries with mid-word spaces", ms.filter((s) => /[가-힣] [가-힣]{1}(?=[\s,.])/.test(s.summary)).length);
console.log("== middle relations", mr.length, "kind", cnt(mr, (r) => r.relationKind), "scope", cnt(mr, (r) => r.scope), "review", cnt(mr, (r) => r.reviewStatus));
const tCourse = new Map(mt.map((t) => [t.id, t.courseIds[0]]));
console.log("== middle relations per course", sorted(cnt(mr, (r) => cname.get(tCourse.get(r.dependentTopicId)))));
console.log("== middle courses with 0 relations", mc.filter((c) => !mr.some((r) => tCourse.get(r.dependentTopicId) === c.id)).map((c) => c.labelKorean).join(", "));
console.log("== middle relations on core vs facet topics", cnt(mr, (r) => (mt.find((t) => t.id === r.dependentTopicId)?.decompositionKind) + "<-" + (mt.find((t) => t.id === r.prerequisiteTopicId)?.decompositionKind)));
console.log("== middle clusters", mcl.length, "size dist", sorted(cnt(mcl, (c) => c.topicIds.length)).slice(0, 8));
console.log("== middle subject groups", msg.map((s) => s.labelKorean).join(", "));
console.log("== middle domains per course", sorted(cnt(md, (d) => cname.get(d.courseId))));

// ---------- HIGH (light) ----------
const hc = rec("high/courses.json"), hs = rec("high/standards.json"), ht = rec("high/topics.json"), hr = rec("high/learning-relations.json"), hcr = rec("high/course-relations.json"), hsg = rec("high/subject-groups.json");
console.log("== high courses by category", sorted(cnt(hc, (c) => c.courseCategory)));
console.log("== high courses programScopes", sorted(cnt(hc, (c) => (c.programScopes || []).join("+"))));
console.log("== high topics decompositionKind", cnt(ht, (t) => t.decompositionKind || "none"), "evidence count", cnt(ht, (t) => t.evidence.length));
console.log("== high topics per standard", cnt(Object.values(cnt(ht.flatMap((t) => t.standardAlignments.map((a) => a.standardId)), (x) => x)), (x) => x));
const hcname = new Map(hc.map((c) => [c.id, c]));
const htCourse = new Map(ht.map((t) => [t.id, t.courseIds[0]]));
const generalCourses = hc.filter((c) => !(c.programScopes || []).includes("specialized-vocational") && !/specialized/.test(c.courseCategory));
console.log("== high non-vocational courses", generalCourses.length);
const relByCourse = cnt(hr, (r) => htCourse.get(r.dependentTopicId));
const commonCourses = hc.filter((c) => c.courseCategory === "common");
console.log("== high common courses relations", commonCourses.map((c) => `${c.labelKorean}:${relByCourse[c.id] || 0}`).join(", "));
console.log("== high relations kind/scope", cnt(hr, (r) => r.relationKind + "|" + r.scope));
console.log("== high course relations kind", cnt(hcr, (r) => r.relationKind));
console.log("== high common+general-elective courses with 0 relations", generalCourses.filter((c) => ["common", "general-elective"].includes(c.courseCategory) && !relByCourse[c.id]).map((c) => c.labelKorean).join(", "));

// ---------- BRIDGES vs ELEMENTARY ----------
const eb = rec("bridges/elementary-transitions.json");
const einv = j(root + "bridges/elementary-topic-inventory.json");
const elemT = j("/Volumes/data/Dev/korean-elementary-learning-map/data/kr/topics.json").topics;
const elemIds = new Set(elemT.map((t) => t.id));
const elemMan = j("/Volumes/data/Dev/korean-elementary-learning-map/data/kr/manifest.json");
console.log("== bridge pinned elementary release", einv.elementaryReleaseVersion, "actual elementary taxonomyVersion", elemMan.taxonomyVersion, "inventory count", einv.topicCount, "actual", elemT.length, "inventory ids all exist", einv.topicIds.every((id) => elemIds.has(id)));
console.log("== elementary transitions prereq ids exist in elementary", eb.filter((r) => elemIds.has(r.prerequisiteTopicId)).length, "of", eb.length);
const elemById = new Map(elemT.map((t) => [t.id, t]));
console.log("== elementary transitions by elementary subject", sorted(cnt(eb, (r) => elemById.get(r.prerequisiteTopicId)?.subjectKorean || "?")));
console.log("== elementary transitions by middle course", sorted(cnt(eb, (r) => cname.get(tCourse.get(r.dependentTopicId)) || "?")));
console.log("== elementary transitions by elementary gradeBand", cnt(eb, (r) => elemById.get(r.prerequisiteTopicId)?.gradeBand || "?"));
console.log("== elementary transitions facet used", sorted(cnt(eb, (r) => r.prerequisiteTopicId.split(".").pop())).slice(0, 6));
console.log("== distinct elementary topics used", new Set(eb.map((r) => r.prerequisiteTopicId)).size, "distinct middle topics", new Set(eb.map((r) => r.dependentTopicId)).size);
// middle standards reachable from elementary (coverage of middle standards by bridge)
const midStdOfTopic = new Map(mt.map((t) => [t.id, t.standardAlignments[0]?.standardId]));
const midStdsBridged = new Set(eb.map((r) => midStdOfTopic.get(r.dependentTopicId)));
console.log("== middle standards with elementary bridge", midStdsBridged.size, "of", ms.length);
