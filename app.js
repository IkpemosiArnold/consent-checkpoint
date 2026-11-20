import { checkAll, approve, auditLine, decisionLine, fmtTime } from "./check.js?v=2";
import { DOCS, QUEUE, AS_OF, REVIEWER } from "./samples.js?v=2";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;

const STATUS = {
  go: { word: "Can go", cls: "st-pass", glyph: "check" },
  approve: { word: "To approve", cls: "st-none", glyph: "none" },
  held: { word: "Held", cls: "st-none", glyph: "none" },
  blocked: { word: "Blocked", cls: "st-fail", glyph: "cross" },
};
const COND = {
  met: { word: "Met", cls: "st-pass", glyph: "check", u: "u" },
  notmet: { word: "Not met", cls: "st-fail", glyph: "cross", u: "u fail" },
  notfound: { word: "Not found", cls: "st-none", glyph: "none", u: "u none" },
  review: { word: "Waits for a person", cls: "st-none", glyph: "none", u: "u none" },
};

const state = { docs: JSON.parse(JSON.stringify(DOCS)), open: null, tab: "drafts", hl: null, stamped: null, released: new Map(), trail: [] };
let summary = checkAll(QUEUE, state.docs, AS_OF);
// The checkpoint's own decisions go on the record before anyone clicks.
const seed = () => summary.results.filter((r) => r.draft && (r.status === "blocked" || r.status === "held")).map((r) => `${r.status === "blocked" ? "Blocked" : "Held"}: ${decisionLine(r, AS_OF)}`);
state.trail = seed();
state.approvedNow = new Set();

const headFor = (doc, field) => DOCS[doc].heads[DOCS[doc].cols.indexOf(field)] || field;
function fieldValue(line, field) {
  const v = line[field];
  if (v === "" || v === null || v === undefined) return "(blank)";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtTime(v);
  return String(v);
}

function quoteHtml(r, uCls) {
  const d = state.docs[r.doc];
  const line = d.lines.find((l) => l.id === r.id);
  if (!line) return "";
  return `<button type="button" class="quote" data-doc="${r.doc}" data-line="${r.id}" data-field="${r.field}">
    <span class="src">${esc(d.title)}, ${esc(r.id)}</span>
    <span class="txt">${esc(headFor(r.doc, r.field))}: <span class="${uCls}">${esc(fieldValue(line, r.field))}</span></span>
  </button>`;
}

function metaFor(r) {
  if (r.status === "go") return r.attempt.n > 1 ? `Retry, attempt ${r.attempt.n}, same key` : `All ${r.conditions.length} checks met`;
  const c = ["notmet", "notfound", "review"].map((s) => r.conditions.find((x) => x.status === s)).find(Boolean);
  return {
    consent: "No consent for this recipient",
    current: { withdrawn: "Consent withdrawn", "not-yet": "Consent not started yet", expired: r.attempt.n > 1 ? "Consent expired before the retry" : "Consent expired" }[c.why],
    scope: `Carries a field the consent leaves out: ${(c.extra || []).join(", ")}`,
    approval: c.stale ? "Edited after it was approved" : "Waiting for a person to approve",
    retry: c.status === "review" ? "Earlier version may have arrived" : "Already delivered once",
  }[c.key] || c.label;
}

function evidenceHtml(r) {
  const condLi = (c) => {
    const s = COND[c.status];
    const quotes = c.refs.map((x) => quoteHtml(x, s.u)).join("");
    return `<li class="cond c-${c.status}">${icon(s.glyph).replace("<svg", `<svg class="${s.cls}"`)}<div>
      <div class="cond-l">${esc(c.label)}<span class="w ${s.cls}">${s.word}</span></div>
      <p class="cond-n">${esc(c.note)}</p>
      ${quotes ? `<div class="quotes">${quotes}</div>` : ""}</div></li>`;
  };
  const later = (c) => r.status === "blocked" && c.status === "review";
  const open = r.conditions.filter((c) => c.status !== "met" && !later(c));
  const met = r.conditions.filter((c) => c.status === "met" || later(c));

  const d = r.draft;
  const calc = d ? `<h3 class="ev-h">The message the agent wants to send</h3><div class="calc">
    <div class="cl"><span class="n">1</span><span>To</span><span class="v">${esc(d.recipient)}</span></div>
    <div class="cl"><span class="n">2</span><span>About</span><span class="v">${esc(d.subject)}</span></div>
    <div class="cl"><span class="n">3</span><span>Offer</span><span class="v">${esc(d.offer)}</span></div>
    <div class="cl"><span class="n">4</span><span>Fields</span><span class="v">${fieldsHtml(r)}</span></div>
    <div class="cl"><span class="n">5</span><span>Version</span><span class="v">${esc(d.version)}</span></div>
    <div class="cl strong"><span class="n">6</span><span>Attempt and key</span><span class="v">${r.attempt.n}, ${esc(r.attempt.key)}</span></div>
  </div>` : "";

  let act = "";
  if (r.status === "approve") {
    act = `<div class="approve-row"><button type="button" class="btn primary" data-approve="${r.id}">Approve version ${esc(d.version)} as ${esc(REVIEWER)}</button></div>`;
  } else if (r.status === "go") {
    const rel = state.released.get(r.id);
    act = rel
      ? `<div class="approve-row done"><span class="approved stamp${state.stamped === r.id ? " thunk" : ""}">${icon("check")}Released, attempt ${r.attempt.n}, ${fmtTime(AS_OF)}</span></div>`
      : `${state.approvedNow.has(r.id) ? `<div class="approve-row done"><span class="approved stamp${state.stamped === r.id ? " thunk" : ""}">${icon("check")}Approved v${esc(d.version)}, ${esc(REVIEWER.split(",")[0])}, ${fmtTime(AS_OF)}</span></div>` : ""}<div class="approve-row"><button type="button" class="btn primary" data-release="${r.id}">Release to the send queue</button></div>`;
  } else if (r.status === "held") {
    act = `<p class="held-line">Held until a person settles: ${esc(open.map((c) => c.label.toLowerCase()).join("; "))}.</p>`;
  } else {
    act = `<p class="held-line">Blocked, and the agent is told why.</p>`;
  }
  const openHtml = open.length ? `<section class="ev-sec ev-open"><h3 class="ev-h">${r.status === "blocked" ? "Why it is blocked" : "What it waits for"}</h3><ul class="conds">${open.map(condLi).join("")}</ul></section>` : "";
  const metHtml = met.length ? `<section class="ev-sec ev-met"><h3 class="ev-h">${open.length ? "Also checked" : "Checks, all met"}</h3><ul class="conds">${met.map(condLi).join("")}</ul></section>` : "";
  return `<div class="evidence enter${open.length ? "" : " no-open"}">${openHtml}<section class="ev-sec ev-calc">${calc}</section><div class="ev-act">${act}</div>${metHtml}</div>`;
}

function fieldsHtml(r) {
  const sc = r.conditions.find((c) => c.key === "scope");
  const extra = new Set(sc ? sc.extra || [] : []);
  return r.draft.fields.split(",").map((f) => f.trim()).map((f) => extra.has(f.toLowerCase()) ? `<s>${esc(f)}</s>` : esc(f)).join(", ");
}

function renderSummary() {
  const sep = `<span class="sep"> · </span>`;
  $("#summary").innerHTML = `<span class="sum-main">${summary.go} of ${summary.results.length} can go</span>
    <span class="sum-side"><span class="bx">${summary.approve} to approve</span><span class="muted">${sep}<span class="bx">${summary.held} held</span>${sep}<span class="bx">${summary.blocked} blocked</span>${sep}<span class="bx wide">checked ${fmtTime(AS_OF)} UTC</span></span></span>`;
}

function renderGroups() {
  const order = [["go", "Can go"], ["approve", "Waiting for your approval"], ["held", "Held, with what is missing"], ["blocked", "Blocked"]];
  $("#groups").innerHTML = order.map(([st, h]) => {
    const rs = summary.results.filter((r) => r.status === st);
    if (!rs.length) return "";
    return `<div class="group"><h2 class="group-h">${h}</h2><div class="rows">${rs.map((r) => {
      const s = state.released.has(r.id) ? { word: "Released", cls: "st-pass", glyph: "check" } : STATUS[r.status];
      const open = state.open === r.id;
      const d = r.draft;
      return `<div class="row-item"><button type="button" class="row" data-row="${r.id}" aria-expanded="${open}">
        <span class="status ${s.cls}">${icon(s.glyph)}${s.word}</span>
        <span class="what"><b>${esc(d ? d.subject : "")} to ${esc(d ? d.recipient : "")}</b><span class="meta">${esc(r.id)}. ${esc(metaFor(r))}</span></span>
        </button>${open ? evidenceHtml(r) : ""}</div>`;
    }).join("")}</div></div>`;
  }).join("");
  state.stamped = null;
}

function renderTrail() {
  $("#trail-sub").textContent = "Every decision this session: who, which version, which consent row, which attempt and key.";
  $("#trail").innerHTML = state.trail.map((t) => `<li>${esc(t)}</li>`).join("");
}

function renderDocs() {
  const keys = Object.keys(state.docs);
  $("#doc-tabs").innerHTML = keys.map((k) => `<button type="button" class="tab" data-tab="${k}" aria-pressed="${state.tab === k}">${esc(state.docs[k].title)}</button>`).join("");
  const d = state.docs[state.tab];
  const rows = d.lines.map((l) => {
    const hl = state.hl && state.hl.id === l.id;
    return `<tr id="ln-${l.id}"${hl ? ' class="hl"' : ""}>${d.cols.map((c) => `<td${hl && state.hl.field === c ? ' class="hit"' : ""}>${esc(c === "id" ? l.id : (l[c] === "" || l[c] == null ? "" : fieldValue(l, c)))}</td>`).join("")}</tr>`;
  }).join("");
  $("#doc-grid").innerHTML = `<table class="grid"><thead><tr>${d.heads.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

function recheck() { summary = checkAll(QUEUE, state.docs, AS_OF); }
function render() { renderSummary(); renderGroups(); renderTrail(); renderDocs(); }

document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-row]");
  if (row) { state.open = state.open === row.dataset.row ? null : row.dataset.row; renderGroups(); return; }
  const q = e.target.closest(".quote");
  if (q) {
    state.tab = q.dataset.doc; state.hl = { id: q.dataset.line, field: q.dataset.field };
    renderDocs();
    const tr = document.getElementById("ln-" + q.dataset.line);
    $("#docs").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (tr) setTimeout(() => tr.scrollIntoView({ block: "nearest", inline: "nearest" }), 300);
    return;
  }
  const ap = e.target.closest("[data-approve]");
  if (ap) {
    const id = ap.dataset.approve;
    state.docs = approve(state.docs, id, REVIEWER, AS_OF);
    recheck();
    const r = summary.results.find((x) => x.id === id);
    state.trail.push(`Approved: ${auditLine(r, AS_OF, REVIEWER)}`);
    state.open = id; state.approvedNow.add(id); state.stamped = id;
    renderSummary(); renderGroups(); renderTrail(); renderDocs();
    return;
  }
  const rel = e.target.closest("[data-release]");
  if (rel) {
    const id = rel.dataset.release;
    const r = summary.results.find((x) => x.id === id);
    const ap = r.conditions.find((c) => c.key === "approval");
    const by = ap && ap.by ? ap.by : REVIEWER;
    state.released.set(id, true); state.stamped = id;
    state.trail.push(`Released: ${auditLine(r, AS_OF, by)}`);
    renderGroups(); renderTrail();
    return;
  }
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.tab = tab.dataset.tab; state.hl = null; renderDocs(); return; }
  if (e.target.closest("#why-btn")) {
    const b = $("#why-btn"), open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(open)); $("#why").hidden = !open; return;
  }
  if (e.target.closest("#reset")) {
    state.docs = JSON.parse(JSON.stringify(DOCS)); state.open = null; state.tab = "drafts"; state.hl = null; state.released = new Map(); state.approvedNow = new Set();
    recheck(); state.trail = seed(); render(); window.scrollTo({ top: 0 });
  }
});

render();
