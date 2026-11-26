# MetaMarket submissions

## Connect

Run commands from the checkout root with Node 22 and the project dependencies installed. The CLI loads the checkout’s ignored `.env`. Set `METAMARKET_CODEX_API_URL` to the same deployment the owner uses for approvals, including the `/mapi` prefix. Local development defaults to `http://localhost:8080/mapi`.

The API server needs `METAMARKET_REVIEW_OWNER_EMAIL` (the owner’s existing admin account) and `METAMARKET_CODEX_TOKEN` (a dedicated random secret). The CLI needs that same token. Configure these in private environment settings. Never put the token in the browser bundle, proposal JSON, source links or chat. Apply the Codex review migration before using a deployment. Restart the API after changing its environment. In local development, start Supabase and run `pnpm dev`. The approval queue is at `/admin` under **Codex reviews**.

## Commands

```text
node scripts/codex-market.mjs drafts
node scripts/codex-market.mjs new-id
node scripts/codex-market.mjs create <uuid> <draft.json>
node scripts/codex-market.mjs revise <same-uuid> <revision> <draft.json>
node scripts/codex-market.mjs expired
node scripts/codex-market.mjs report <uuid> <revision> <evidence.json>
```

A path of `-` accepts JSON on stdin. Use a temporary input file or stdin. Keep the returned ID and revision when reporting results. The displayed review card is the only publication or payout approval.

## Draft fields

This illustrative JSON uses placeholders. Replace them with researched facts, dates and tested links before submitting.

```json
{
  "title": "Will Ether close November above 3,000 USDT?",
  "category": "Crypto",
  "whyNow": "<why this is interesting today>",
  "storyUrl": "https://example.org/current-story",
  "endDate": "2026-12-01T00:00:00Z",
  "sourceName": "Binance ETH/USDT",
  "sourceUrl": "https://example.org/approved-history",
  "archiveExampleUrl": "https://example.org/verified-historical-sample",
  "whyUnsettled": "The closing price can move either way through the final second.",
  "logoUrl": "https://example.org/licensed-image.png",
  "marketType": "binary",
  "outcomes": ["Yes", "No"],
  "rule": {"kind":"threshold","metric":"ETH/USDT closing price of the one-second candle ending at cutoff","unit":"USDT","comparison":"gt","threshold":3000},
  "initialB": 1000, "minB": 250, "isDynamic": false
}
```

Binary thresholds accept `gt`, `gte`, `lt`, or `lte`. Named outcomes use `versus` (two options) or `multi` (two or more). Use `{"kind":"ranking","metric":"…","unit":"…","wins":"highest"}` or `lowest`. In a tie the first tied outcome in published order wins. A binary market always has Yes followed by No.

## Evidence fields

```json
{"status":"observed","observedAt":"2026-12-01T00:00:00Z","readings":[3006.4],"evidenceUrl":"https://example.org/actual-cutoff-reading","note":"The final one-second candle closed at 3,006.40 USDT."}
```

The evidence and archive example URLs must use the approved source origin. For a ranking, provide one number for each named outcome in the same order as the draft. Use the observation boundary as `observedAt`. If the source labels intervals by their start, verify the interval ends at the cutoff and explain it in the note.

```json
{"status":"missing","note":"The approved archive has a gap at the exact cutoff."}
```
