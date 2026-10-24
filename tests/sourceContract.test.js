import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Vue app delegates history to aggregate loader and retains chart and panel integration", () => {
	const app = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
	assert.match(app, /loadUserStarHistory/);
	assert.match(app, /chartInstance\.data\.labels/);
	assert.match(app, /RepoListPanel/);
	assert.match(app, /v-model\.number="maxRepos"/);
	assert.doesNotMatch(app, /stargazers_url|starred_at|GITHUB_TOKEN/);
});

test("deployment does not inject browser-exposed PATs", () => {
	const workflow = readFileSync(
		new URL("../.github/workflows/deploy.yml", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(workflow, /VITE_GITHUB_TOKEN/);
	const app = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
	assert.doesNotMatch(app, /Authorization\s*:/);
});
