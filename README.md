# Consent Checkpoint

An agent can draft a share in seconds: one member's details, an offer, a recipient. The risky part is the moment it sends. This page puts an approval checkpoint in plain code between the agent and that moment, and shows its working.

Seven shares an agent queued for a made-up coalition are checked against four records: the share drafts, the consent ledger, the approvals and the delivery log. Every condition shows the record line it read. Anything the records do not show is held with what is missing. Nothing is guessed, and a named person approves each version before it can go.

**Sample result:** 1 of 7 can go. 2 wait for approval, 1 held, 3 blocked.

## The five checks

1. **Consent on file** for this member and this recipient. Consent for one recipient is never stretched to another; an "any partner" row covers a recipient only when there is no specific row. The ledger is append-only, so a renewed row is used over an expired one.
2. **Consent current at the moment of sending.** A retry is checked again at retry time, not at the first attempt. The expiry date is the last good day, to 23:59 UTC. All times are UTC.
3. **Fields within consent.** Every field in the message must be one the consent allows; an extra field is named and struck.
4. **Approved by a person**, for this exact version and after its last edit. Editing a draft voids an older approval.
5. **Not already sent.** A retry reuses the first attempt's idempotency key and counts the attempt. If the message changed since that attempt, a person confirms the earlier one did not arrive before it goes under a new key. A draft already delivered is never sent again.

## What it shows

- **SD-6, can go.** The first attempt failed with a 502. The retry is attempt 2 and reuses `k-sd6-v1`.
- **SD-1, approve.** All checks hold except a person's approval. Approve it and it moves to "can go"; release it and the audit trail records who, which version, which consent row, which attempt and key.
- **SD-4, approve again.** Approved as version 1, then edited to version 2.
- **SD-5, held.** The member consented to Partner 08, not Partner 05.
- **SD-2, blocked.** The first attempt (17 Nov) was inside the consent. The consent ended on 19 Nov, so the retry on 20 Nov is blocked.
- **SD-3, blocked.** The message carries a phone number the consent does not allow.
- **SD-7, blocked.** Already delivered under `k-sd7-v1`. Sending again would be a duplicate.

## Run it

Static files, no build step, no keys, no network calls. Serve the folder and open `index.html`. Tests: `npm test` (Node 20 or later), 17 tests.

## Files

- `check.js`: the checks, with no DOM.
- `samples.js`: the made-up records.
- `app.js`, `index.html`, `style.css`: the page.
- `fonts/`: Public Sans and Courier Prime, SIL Open Font License (`fonts/OFL.txt`).

Built on 20 Nov 2026 with AI coding agents, directed by Arnold Ikpemosi Adeyemi.
