import { describe, it, expect } from "vitest";
import { parseDraft, parseEvidence } from "./codexValidation.ts";
import { cutoffTerms, winningIndex } from "../../../shared/codexMarkets.ts";

const cutoff = "2030-06-01T12:00:00.000Z";
const now = Date.parse(cutoff) - 1000;
const raw = {
  title: "Will the closing price be above 100?",
  category: "Crypto",
  whyNow: "Two products are launching.",
  storyUrl: "https://news.example/story",
  sourceName: "Example Exchange",
  sourceUrl: "https://market.example/history",
  archiveExampleUrl: "https://market.example/previous",
  whyUnsettled: "The market price can rise or fall.",
  logoUrl: "https://media.example/image.png",
  endDate: cutoff,
  marketType: "binary",
  outcomes: ["Yes", "No"],
  rule: {
    kind: "threshold",
    metric: "Spot closing price",
    unit: "USD",
    threshold: 100,
    comparison: "gt",
  },
  initialB: 500,
  minB: 125,
  isDynamic: false,
};

describe("cutoff contracts", () => {
  it("pins the equality rule, winning label and same-instant evidence", () => {
    const draft = parseDraft(raw, now);
    expect(winningIndex(draft, [100])).toBe(1);
    expect(winningIndex(draft, [101])).toBe(0);
    expect(
      winningIndex(
        parseDraft({ ...raw, rule: { ...raw.rule, comparison: "gte" } }, now),
        [100],
      ),
    ).toBe(0);
    expect(cutoffTerms(draft)).toContain(cutoff);
    const e = {
      status: "observed",
      note: "Archive candle",
      observedAt: "2030-06-01T17:30:00+05:30",
      evidenceUrl: "https://market.example/read?id=2",
      readings: [101],
    };
    expect(parseEvidence(e, draft, now + 1000)).toMatchObject({
      observedAt: cutoff,
      readings: [101],
    });
    for (const change of [
      { observedAt: "2030-06-01T11:59:59Z" },
      { readings: [NaN] },
      { readings: [] },
      { evidenceUrl: "https://news.example/story" },
    ])
      expect(() =>
        parseEvidence({ ...e, ...change }, draft, now + 2000),
      ).toThrow();
    expect(() => parseEvidence(e, draft, now)).toThrow();
  });

  it("ranks all named options and breaks ties in published order", () => {
    const draft = parseDraft(
      {
        ...raw,
        marketType: "multi",
        outcomes: ["Tokyo", "Berlin", "Chicago"],
        rule: {
          kind: "ranking",
          metric: "Air temperature",
          unit: "°C",
          wins: "lowest",
        },
      },
      now,
    );
    expect(winningIndex(draft, [24, 10, 10])).toBe(1);
    expect(winningIndex(draft, [10, 10, 10])).toBe(0);
    expect(() => winningIndex(draft, [10, 10])).toThrow();
    expect(cutoffTerms(draft)).toContain("Tokyo, Berlin, Chicago");
  });

  it("rejects milestones, incomplete proposals, expired drafts and ambiguous inputs", () => {
    for (const change of [
      { title: "Will Ether hit 3,000 by Friday?" },
      { title: "Will total downloads exceed a million?" },
      { logoUrl: "data:text/html,test" },
      { archiveExampleUrl: "https://unapproved.example/" },
      { whyUnsettled: "" },
      { endDate: "2030-06-01T12:00:00" },
      { isDynamic: "false" },
      { initialB: 9 },
      { minB: 501 },
      { outcomes: ["No", "Yes"] },
      { marketType: "custom" },
      { rule: { ...raw.rule, comparison: "near" } },
    ])
      expect(() => parseDraft({ ...raw, ...change }, now)).toThrow();
    expect(() => parseDraft(raw, Date.parse(cutoff))).toThrow();
  });
});
