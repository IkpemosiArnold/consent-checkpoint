import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDraft, checkAll, approve, consentState, findConsent } from "./check.js";
import { DOCS, QUEUE, AS_OF } from "./samples.js";

const byId = (s, id) => s.results.find((r) => r.id === id);
const cond = (r, key) => r.conditions.find((c) => c.key === key);
const clone = (o) => JSON.parse(JSON.stringify(o));

test("the sample reads 1 can go, 2 wait for approval, 1 held, 3 blocked", () => {
  const s = checkAll(QUEUE, DOCS, AS_OF);
  assert.deepEqual([s.go, s.approve, s.held, s.blocked], [1, 2, 1, 3]);
});

test("expired consent blocks a retry even though the first attempt was inside the consent", () => {
  const r = byId(checkAll(QUEUE, DOCS, AS_OF), "SD-2");
  assert.equal(r.status, "blocked");
  assert.equal(cond(r, "current").status, "notmet");
  assert.match(cond(r, "current").note, /retry is checked again now/);
  // The same retry on the day the consent was still good would pass that check.
  const ok = checkDraft({ draft: "SD-2", retryOf: "DL-1" }, DOCS, "2026-11-19T23:00");
  assert.equal(cond(ok, "current").status, "met");
});

test("the expiry date is the last good day, to the minute", () => {
  const row = { granted: "2026-01-01", expires: "2026-11-19", withdrawn: "" };
  assert.equal(consentState(row, "2026-11-19T23:59").ok, true);
  assert.equal(consentState(row, "2026-11-20T00:00").ok, false);
  assert.equal(consentState(row, "2026-11-20T00:00").why, "expired");
});

test("withdrawn consent blocks from the day it is withdrawn", () => {
  const docs = clone(DOCS);
  docs.consents.lines.find((c) => c.id === "CL-1").withdrawn = "2026-11-20";
  const r = checkDraft({ draft: "SD-1" }, docs, AS_OF);
  assert.equal(r.status, "blocked");
  assert.match(cond(r, "current").note, /Withdrawn/);
  assert.deepEqual(cond(r, "current").refs[0], { doc: "consents", id: "CL-1", field: "withdrawn" });
});

test("a field outside the consent blocks the send and is named", () => {
  const r = byId(checkAll(QUEUE, DOCS, AS_OF), "SD-3");
  assert.equal(r.status, "blocked");
  assert.deepEqual(cond(r, "scope").extra, ["phone"]);
});

test("consent for another recipient is not stretched to this one: held, not guessed", () => {
  const r = byId(checkAll(QUEUE, DOCS, AS_OF), "SD-5");
  assert.equal(r.status, "held");
  assert.equal(cond(r, "consent").status, "notfound");
  assert.match(cond(r, "consent").note, /Partner 08, not for Partner 05/);
});

test("an 'any partner' consent covers a named recipient when there is no specific row", () => {
  const c = findConsent({ subject: "Member 09", recipient: "Partner 12" }, DOCS.consents.lines);
  assert.equal(c.id, "CL-6");
});

test("an approval of an older version does not carry over to an edited draft", () => {
  const r = byId(checkAll(QUEUE, DOCS, AS_OF), "SD-4");
  assert.equal(r.status, "approve");
  assert.equal(cond(r, "approval").stale, true);
});

test("approving records the exact version, and a later edit voids it", () => {
  let docs = approve(clone(DOCS), "SD-1", "Ada, coalition lead", AS_OF);
  assert.equal(checkDraft({ draft: "SD-1" }, docs, AS_OF).status, "go");
  docs = clone(docs);
  const d = docs.drafts.lines.find((x) => x.id === "SD-1");
  d.version = 2; d.editedAt = "2026-11-20T10:30";
  assert.equal(checkDraft({ draft: "SD-1" }, docs, "2026-11-20T10:31").status, "approve");
});

test("a retry reuses the first attempt's key and counts the attempt", () => {
  const r = byId(checkAll(QUEUE, DOCS, AS_OF), "SD-6");
  assert.equal(r.status, "go");
  assert.deepEqual(r.attempt, { n: 2, key: "k-sd6-v1" });
});

test("a draft already delivered is never sent again", () => {
  const r = byId(checkAll(QUEUE, DOCS, AS_OF), "SD-7");
  assert.equal(r.status, "blocked");
  assert.equal(cond(r, "retry").status, "notmet");
  assert.match(cond(r, "retry").note, /duplicate/);
});

test("every condition points at a record line that exists", () => {
  const s = checkAll(QUEUE, DOCS, AS_OF);
  for (const r of s.results) for (const c of r.conditions) for (const ref of c.refs) {
    const line = DOCS[ref.doc].lines.find((l) => l.id === ref.id);
    assert.ok(line, `${r.id} ${c.key} -> ${ref.doc} ${ref.id}`);
    assert.ok(DOCS[ref.doc].cols.includes(ref.field), `${ref.doc} has no ${ref.field}`);
  }
});

test("an unknown draft is held and nothing is assumed", () => {
  const r = checkDraft({ draft: "SD-99" }, DOCS, AS_OF);
  assert.equal(r.status, "held");
});

test("a first send shows all five checks", () => {
  const docs = approve(clone(DOCS), "SD-1", "Ada, coalition lead", AS_OF);
  const r = checkDraft({ draft: "SD-1" }, docs, AS_OF);
  assert.equal(r.conditions.length, 5);
  assert.equal(cond(r, "retry").status, "met");
});

test("a retry of an edited message does not reuse the old key without a person confirming", () => {
  let docs = clone(DOCS);
  const d = docs.drafts.lines.find((x) => x.id === "SD-6");
  d.version = 2; d.editedAt = "2026-11-19T09:00";
  docs = approve(docs, "SD-6", "Ada, coalition lead", AS_OF);
  const r = checkDraft({ draft: "SD-6", retryOf: "DL-2" }, docs, AS_OF);
  assert.equal(cond(r, "retry").status, "review");
  assert.equal(r.attempt.key, "k-sd6-v2");
  assert.equal(r.status, "approve");
});

test("a renewed consent row is used instead of the expired one", () => {
  const docs = clone(DOCS);
  docs.consents.lines.push({ id: "CL-8", subject: "Member 03", recipient: "Partner 05", fields: "name, sector", granted: "2026-11-20", expires: "2027-11-20", withdrawn: "" });
  const r = checkDraft({ draft: "SD-2", retryOf: "DL-1" }, docs, AS_OF);
  assert.equal(r.consent.id, "CL-8");
  assert.ok(["approve", "go"].includes(r.status));
});

test("an expired consent on a first send is checked at send time", () => {
  const docs = clone(DOCS);
  docs.consents.lines.find((c) => c.id === "CL-1").expires = "2026-11-19";
  const r = checkDraft({ draft: "SD-1" }, docs, AS_OF);
  assert.equal(r.status, "blocked");
  assert.match(cond(r, "current").note, /at send time/);
  assert.equal(cond(r, "current").why, "expired");
});
