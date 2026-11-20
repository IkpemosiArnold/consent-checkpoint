// The checkpoint between the agent and a send. Plain code, no model.
// Every condition names the record lines it read. Anything it cannot find is held, never guessed.

export const fields = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

// A consent row's "expires" date is the last day it is good for: valid until 23:59 UTC that day. All times are UTC.
export function consentState(row, at) {
  if (!row) return { ok: false, why: "none" };
  if (row.granted && at.slice(0, 10) < row.granted) return { ok: false, why: "not-yet" };
  if (row.withdrawn && at.slice(0, 10) >= row.withdrawn) return { ok: false, why: "withdrawn" };
  if (row.expires && at.slice(0, 10) > row.expires) return { ok: false, why: "expired" };
  return { ok: true, why: "current" };
}

// The ledger is append-only: a renewal is a new row. Prefer a row that is good now, else the latest.
export function findConsent(draft, consents, at) {
  const mine = consents.filter((c) => c.subject === draft.subject);
  const pick = (rows) => (at && rows.find((c) => consentState(c, at).ok)) || rows[rows.length - 1] || null;
  const exact = mine.filter((c) => c.recipient === draft.recipient);
  return exact.length ? pick(exact) : pick(mine.filter((c) => c.recipient === "Any partner"));
}

export function fmtTime(s) {
  if (!s) return "";
  const [d, t] = s.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${day} ${mon} ${y}${t ? ", " + t : ""}`;
}

export function checkDraft(item, docs, at) {
  const D = (k) => docs[k].lines;
  const draft = D("drafts").find((d) => d.id === item.draft);
  if (!draft) return { id: item.draft, status: "held", conditions: [{ key: "draft", label: "Draft on file", status: "notfound", note: "No draft with this id. It is held.", refs: [] }] };
  const conds = [];
  const ref = (doc, id, field) => ({ doc, id, field });

  // 1. A consent row exists for this subject and this recipient.
  const c = findConsent(draft, D("consents"), at);
  if (!c) {
    const others = D("consents").filter((x) => x.subject === draft.subject);
    conds.push({ key: "consent", label: "Consent on file", status: "notfound",
      note: others.length
        ? `${draft.subject} has consent for ${others.map((x) => x.recipient).join(", ")}, not for ${draft.recipient}. Not assumed.`
        : `No consent row for ${draft.subject}. Not assumed.`,
      refs: [ref("drafts", draft.id, "recipient"), ...others.map((x) => ref("consents", x.id, "recipient"))] });
  } else {
    conds.push({ key: "consent", label: "Consent on file", status: "met",
      note: `${c.id} lets ${draft.subject}'s details go to ${c.recipient === "Any partner" ? "any partner" : c.recipient}.`,
      refs: [ref("consents", c.id, "recipient")] });

    // 2. The consent is still good at the moment of sending. A retry is checked at retry time, not at the first attempt.
    const st = consentState(c, at);
    const when = item.retryOf ? "at retry time" : "at send time";
    const prev = D("deliveries").filter((l) => l.draft === draft.id && l.result !== "delivered");
    const first = prev.length ? ` The first attempt (${fmtTime(prev[0].at.slice(0, 10))}) was inside it; this retry is checked again now, ${fmtTime(at)} UTC.` : ` Checked ${when}, ${fmtTime(at)} UTC.`;
    const word = { current: `Good until the end of ${fmtTime(c.expires)}.`, expired: `Expired at the end of ${fmtTime(c.expires)}.${first}`, withdrawn: `Withdrawn on ${fmtTime(c.withdrawn)}.`, "not-yet": `Starts on ${fmtTime(c.granted)}.` }[st.why];
    conds.push({ key: "current", label: "Consent current", status: st.ok ? "met" : "notmet", why: st.why, note: word,
      refs: [ref("consents", c.id, st.why === "withdrawn" ? "withdrawn" : st.why === "not-yet" ? "granted" : "expires")] });

    // 3. Every field in the message is one the consent allows.
    const allowed = new Set(fields(c.fields));
    const extra = fields(draft.fields).filter((f) => !allowed.has(f));
    conds.push({ key: "scope", label: "Fields within consent", status: extra.length ? "notmet" : "met",
      note: extra.length ? `The message carries ${extra.join(", ")}. ${c.id} allows ${c.fields} only.` : `All of ${draft.fields} are allowed.`,
      extra, refs: [ref("drafts", draft.id, "fields"), ref("consents", c.id, "fields")] });
  }

  // 4. A named person approved this version of the draft, after its last edit.
  const aps = D("approvals").filter((a) => a.draft === draft.id);
  const good = aps.find((a) => a.version === draft.version && a.at >= draft.editedAt);
  if (good) {
    conds.push({ key: "approval", label: "Approved by a person", status: "met", by: good.by,
      note: `${good.by} approved version ${good.version} on ${fmtTime(good.at)}.`, refs: [ref("approvals", good.id, "version")] });
  } else if (aps.length) {
    const last = aps[aps.length - 1];
    conds.push({ key: "approval", label: "Approved by a person", status: "review", stale: true,
      note: `${last.by} approved version ${last.version}. The draft is now version ${draft.version}, edited ${fmtTime(draft.editedAt)}. It needs approving again.`,
      refs: [ref("approvals", last.id, "version"), ref("drafts", draft.id, "version")] });
  } else {
    conds.push({ key: "approval", label: "Approved by a person", status: "review",
      note: "No approval on file yet.", refs: [ref("drafts", draft.id, "id")] });
  }

  // 5. Retries: never send twice. Reuse the first attempt's key so the receiver can drop a duplicate.
  const logs = D("deliveries").filter((l) => l.draft === draft.id);
  const done = logs.find((l) => l.result === "delivered");
  let attempt = { n: 1, key: `k-${draft.id.toLowerCase().replace("-", "")}-v${draft.version}` };
  if (done) {
    conds.push({ key: "retry", label: "Not already sent", status: "notmet",
      note: `${done.id} shows it delivered on ${fmtTime(done.at)} under ${done.key}. Sending again would be a duplicate.`,
      refs: [ref("deliveries", done.id, "result")] });
  } else if (logs.length) {
    const last = logs[logs.length - 1];
    if (last.key !== attempt.key) {
      // The message changed since the failed attempt. Reusing the old key could get the new version dropped as a duplicate.
      attempt = { n: last.attempt + 1, key: attempt.key };
      conds.push({ key: "retry", label: "Not already sent", status: "review",
        note: `Attempt ${last.attempt} sent an earlier version under ${last.key} (${last.result}). This version gets a new key, ${attempt.key}, once a person confirms the earlier one did not arrive.`,
        refs: [ref("deliveries", last.id, "key")] });
    } else {
      attempt = { n: last.attempt + 1, key: last.key };
      conds.push({ key: "retry", label: "Not already sent", status: "met",
        note: `Attempt ${last.attempt} failed (${last.result}). The retry is attempt ${attempt.n} and reuses ${last.key}.`,
        refs: [ref("deliveries", last.id, "result")] });
    }
  } else {
    conds.push({ key: "retry", label: "Not already sent", status: "met",
      note: `No attempt in the delivery log. This is attempt 1, key ${attempt.key}.`,
      refs: [ref("drafts", draft.id, "id")] });
  }

  const has = (s) => conds.some((x) => x.status === s);
  const status = has("notmet") ? "blocked" : has("notfound") ? "held" : has("review") ? "approve" : "go";
  return { id: draft.id, draft, consent: c, attempt, status, conditions: conds };
}

export function checkAll(queue, docs, at) {
  const results = queue.map((q) => checkDraft(q, docs, at));
  const n = (s) => results.filter((r) => r.status === s).length;
  return { results, go: n("go"), approve: n("approve"), held: n("held"), blocked: n("blocked") };
}

// What the reviewer's approval adds. It is recorded against the exact version, so a later edit voids it.
export function approve(docs, draftId, by, at) {
  const draft = docs.drafts.lines.find((d) => d.id === draftId);
  const id = `AP-${docs.approvals.lines.length + 1}`;
  return { ...docs, approvals: { ...docs.approvals, lines: [...docs.approvals.lines, { id, draft: draftId, version: draft.version, by, at }] } };
}

// One line per decision the checkpoint made on its own (blocked or held), for the audit trail.
export function decisionLine(r, at) {
  const why = r.conditions.filter((c) => c.status !== "met").map((c) => c.label.toLowerCase()).join("; ");
  return `${fmtTime(at)} UTC · ${r.id} v${r.draft.version} to ${r.draft.recipient} · ${r.status} · ${why} · attempt ${r.attempt.n}, key ${r.attempt.key}`;
}

// One line per decision for the audit trail.
export function auditLine(r, at, by) {
  const c = r.consent ? r.consent.id : "no consent row";
  return `${fmtTime(at)} UTC · ${r.id} v${r.draft.version} to ${r.draft.recipient} · ${c} · approved by ${by} · attempt ${r.attempt.n}, key ${r.attempt.key}`;
}
