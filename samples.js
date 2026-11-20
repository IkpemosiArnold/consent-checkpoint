// Sample data. Every organisation, person and offer here is made up.
// Members and partners are numbered, not named, so nothing here can be mistaken for a real body.

export const AS_OF = "2026-11-20T10:00";
export const REVIEWER = "Ada, coalition lead";

export const DOCS = {
  drafts: {
    title: "Share drafts",
    cols: ["id", "subject", "recipient", "offer", "fields", "version", "editedAt"],
    heads: ["Draft", "Whose data", "Send to", "Offer", "Fields in the message", "Version", "Last edited"],
    lines: [
      { id: "SD-1", subject: "Member 07", recipient: "Partner 12", offer: "Rooftop solar tender, 40 schools", fields: "name, sector, capacity", version: 1, editedAt: "2026-11-19T15:10" },
      { id: "SD-2", subject: "Member 03", recipient: "Partner 05", offer: "Cold-chain pilot, 3 markets", fields: "name, sector", version: 1, editedAt: "2026-11-17T09:40" },
      { id: "SD-3", subject: "Member 11", recipient: "Partner 12", offer: "Rooftop solar tender, 40 schools", fields: "name, sector, phone", version: 1, editedAt: "2026-11-19T16:05" },
      { id: "SD-4", subject: "Member 07", recipient: "Partner 08", offer: "Joint bid, water kiosks", fields: "name, capacity", version: 2, editedAt: "2026-11-20T08:20" },
      { id: "SD-5", subject: "Member 14", recipient: "Partner 05", offer: "Cold-chain pilot, 3 markets", fields: "name, sector", version: 1, editedAt: "2026-11-19T11:30" },
      { id: "SD-6", subject: "Member 09", recipient: "Partner 12", offer: "Rooftop solar tender, 40 schools", fields: "name, capacity", version: 1, editedAt: "2026-11-18T14:00" },
      { id: "SD-7", subject: "Member 02", recipient: "Partner 08", offer: "Joint bid, water kiosks", fields: "name, sector", version: 1, editedAt: "2026-11-18T10:15" },
    ],
  },
  consents: {
    title: "Consent ledger",
    cols: ["id", "subject", "recipient", "fields", "granted", "expires", "withdrawn"],
    heads: ["Row", "Whose data", "May go to", "Fields allowed", "Granted", "Expires", "Withdrawn"],
    lines: [
      { id: "CL-1", subject: "Member 07", recipient: "Partner 12", fields: "name, sector, capacity", granted: "2026-10-02", expires: "2027-01-31", withdrawn: "" },
      { id: "CL-2", subject: "Member 03", recipient: "Partner 05", fields: "name, sector", granted: "2026-05-19", expires: "2026-11-19", withdrawn: "" },
      { id: "CL-3", subject: "Member 11", recipient: "Partner 12", fields: "name, sector", granted: "2026-09-14", expires: "2027-03-14", withdrawn: "" },
      { id: "CL-4", subject: "Member 07", recipient: "Partner 08", fields: "name, capacity", granted: "2026-10-02", expires: "2027-01-31", withdrawn: "" },
      { id: "CL-5", subject: "Member 14", recipient: "Partner 08", fields: "name, sector", granted: "2026-08-30", expires: "2027-02-28", withdrawn: "" },
      { id: "CL-6", subject: "Member 09", recipient: "Any partner", fields: "name, sector, capacity", granted: "2026-07-01", expires: "2027-06-30", withdrawn: "" },
      { id: "CL-7", subject: "Member 02", recipient: "Partner 08", fields: "name, sector", granted: "2026-06-11", expires: "2027-06-11", withdrawn: "" },
    ],
  },
  approvals: {
    title: "Approvals",
    cols: ["id", "draft", "version", "by", "at"],
    heads: ["Row", "Draft", "Version approved", "By", "At"],
    lines: [
      { id: "AP-1", draft: "SD-2", version: 1, by: "Ada, coalition lead", at: "2026-11-17T10:05" },
      { id: "AP-2", draft: "SD-4", version: 1, by: "Ada, coalition lead", at: "2026-11-19T17:45" },
      { id: "AP-3", draft: "SD-6", version: 1, by: "Ada, coalition lead", at: "2026-11-18T14:30" },
      { id: "AP-4", draft: "SD-7", version: 1, by: "Ada, coalition lead", at: "2026-11-18T10:40" },
    ],
  },
  deliveries: {
    title: "Delivery log",
    cols: ["id", "draft", "attempt", "at", "key", "result"],
    heads: ["Row", "Draft", "Attempt", "At", "Idempotency key", "Result"],
    lines: [
      { id: "DL-1", draft: "SD-2", attempt: 1, at: "2026-11-17T10:06", key: "k-sd2-v1", result: "timeout" },
      { id: "DL-2", draft: "SD-6", attempt: 1, at: "2026-11-18T14:31", key: "k-sd6-v1", result: "502 from partner inbox" },
      { id: "DL-3", draft: "SD-7", attempt: 1, at: "2026-11-18T10:41", key: "k-sd7-v1", result: "delivered" },
    ],
  },
};

// The agent's send queue: what it wants to send now. A retry names the key it would reuse.
export const QUEUE = [
  { draft: "SD-1" },
  { draft: "SD-2", retryOf: "DL-1" },
  { draft: "SD-3" },
  { draft: "SD-4" },
  { draft: "SD-5" },
  { draft: "SD-6", retryOf: "DL-2" },
  { draft: "SD-7", retryOf: "DL-3" },
];
