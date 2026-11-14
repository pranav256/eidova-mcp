import assert from "node:assert/strict";
import test from "node:test";
import {
  GUIDANCE_PROVENANCE,
  getPrincipleByTopic,
  getReviewRules,
  listPrinciples,
  principles,
  reviewRules,
  searchPrinciples,
  type PrincipleArea,
} from "../src/guidance.ts";

test("every advertised guidance domain has original usable content", async () => {
  const areas: PrincipleArea[] = ["ui", "ux", "react-native", "swiftui", "three-js", "shopify", "sales", "motion", "widget", "illustration"];
  for (const area of areas) {
    const index = await listPrinciples(area);
    assert.ok(index.length >= 2, `${area} lacks an index`);
    for (const item of index) {
      const entry = await getPrincipleByTopic(item.topic, area);
      assert.equal(entry?.id, item.id);
      assert.ok(entry!.sourceFile, `${entry!.id} lacks a provenance record`);
      assert.ok(!entry!.content.startsWith('Source:'), 'Guidance should begin with useful instructions.');
      assert.ok(entry!.content.includes("Verify:"));
      assert.ok(entry!.content.length > 300, `${entry!.id} lacks substantive content`);
    }
  }
  assert.equal(GUIDANCE_PROVENANCE.retrieval, "lexical");
});

test('craft, targets and recovery guidance remain practical and retrievable', async () => {
  assert.match((await getPrincipleByTopic('polish','ui'))!.content,/design:\/\/open-design\/skills\/unslop/);
  const accessibility=(await getPrincipleByTopic('accessibility','ui'))!.content;
  assert.match(accessibility,/24 by 24/);assert.match(accessibility,/44 by 44/);assert.match(accessibility,/entirely obscured/);
  assert.match((await getPrincipleByTopic('errors','ux'))!.content,/summary linked to affected fields/);
  assert.ok((await getReviewRules('accessibility')).some(rule=>rule.id==='rule/eidova/target-size'));
});

test("topic aliases normalize spaces and underscores while preserving domain", async () => {
  assert.equal((await getPrincipleByTopic("  BLUR_test ", "ui"))?.topic, "hierarchy");
  assert.equal((await getPrincipleByTopic("value proposition", "ux"))?.topic, "positioning");
  assert.equal((await getPrincipleByTopic("ACERS", "sales"))?.topic, "objection-handling");
  assert.equal((await getPrincipleByTopic("keyboard", "ui"))?.topic, "accessibility");
  assert.equal(await getPrincipleByTopic("keyboard", "shopify"), null);
  assert.equal(await getPrincipleByTopic("unknown-topic", "ui"), null);
  assert.equal(await getPrincipleByTopic(" "), null);
  assert.ok(await getPrincipleByTopic("better-widgets", "ux"));
  assert.ok(await getPrincipleByTopic("page-families", "ux"));
});

test("lexical search favors exact topics, limits results and stays in area", async () => {
  const exact = await searchPrinciples("auth-session-recipes", 3, "react-native");
  assert.equal(exact[0].topic, "auth-session-recipes");
  assert.equal(exact[0].matchScore, 100);
  assert.ok(exact.length <= 3);
  const results = await searchPrinciples("shader compilation renderer", 4, "three-js");
  assert.ok(results.length > 0);
  assert.ok(results.every(entry => entry.area === "three-js"));
  assert.ok(results.every(entry => entry.matchScore >= 0 && entry.matchScore <= 100));
  assert.deepEqual(await searchPrinciples("zxqvf", 5, "ui"), []);
  assert.deepEqual(await searchPrinciples("the and of", 5), []);
  assert.deepEqual(await searchPrinciples("spacing", 0), []);
  assert.deepEqual(await searchPrinciples("spacing", -1), []);
});

test("retrieved objects cannot mutate guidance for another caller", async () => {
  const entry = await getPrincipleByTopic("spacing", "ui");
  entry!.aliases.push("injected");
  entry!.content = "replaced";
  assert.equal(await getPrincipleByTopic("injected", "ui"), null);
  assert.notEqual((await getPrincipleByTopic("spacing", "ui"))!.content, "replaced");
  const index = await listPrinciples("ui");
  index[0].aliases.push("also-injected");
  assert.equal(await getPrincipleByTopic("also-injected", "ui"), null);
  const rules = await getReviewRules("all");
  rules[0].content = "replaced";
  assert.notEqual((await getReviewRules("all"))[0].content, "replaced");
});

test("review categories filter correctly and retain provenance and evidence requirements", async () => {
  assert.equal((await getReviewRules()).length, reviewRules.length);
  assert.equal(new Set(reviewRules.map(rule => rule.id)).size, reviewRules.length);
  assert.equal(new Set(principles.map(entry => entry.id)).size, principles.length);
  const categories = ["accessibility", "visual-design", "animation", "content", "comprehension", "ai-features", "coverage-gaps"];
  for (const category of categories) {
    const selected = await getReviewRules(category);
    assert.ok(selected.length > 0);
    assert.ok(selected.every(rule => rule.category === category));
    assert.ok(selected.every(rule => rule.content.includes(rule.id) && rule.content.includes("Evidence:") && rule.content.includes("Exceptions:")));
  }
  assert.deepEqual(await getReviewRules("unknown"), []);
});
