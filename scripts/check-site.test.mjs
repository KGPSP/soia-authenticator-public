import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { checkSite } from "./check-site.mjs";

const root = process.cwd();

test("publishes every required Polish route under the GitHub Pages base path", async () => {
  const report = await checkSite(root);

  assert.equal(report.routeCount, 9);
  assert.equal(report.language, "pl");
  assert.equal(report.basePath, "/soia-authenticator-public/");
});

test("publishes only phone screenshots and no tablet family", async () => {
  const report = await checkSite(root);

  assert.equal(report.googlePhoneScreenshots, 4);
  assert.equal(report.iphoneScreenshots, 4);
  assert.equal(report.tabletAssets, 0);
});

test("serves the 9:16 screenshot layout from a fingerprinted stylesheet", async () => {
  const report = await checkSite(root);

  assert.match(
    report.stylesheetAsset,
    /^\/soia-authenticator-public\/assets\/css\/soia-[a-f0-9]{8}\.css$/u,
  );
  assert.equal(report.screenshotAspectRatio, "9 / 16");
});

test("keeps public contacts on their intended pages", async () => {
  const support = await readFile(join(root, "pomoc/index.html"), "utf8");
  const privacy = await readFile(
    join(root, "polityka-prywatnosci/index.html"),
    "utf8",
  );

  assert.match(support, /mailto:informacje@kg\.straz\.gov\.pl/u);
  assert.doesNotMatch(support, /iod@kg\.straz\.gov\.pl/u);
  assert.match(privacy, /mailto:iod@kg\.straz\.gov\.pl/u);
});

test("does not publish forms, trackers, private paths, or external runtime assets", async () => {
  const report = await checkSite(root);

  assert.deepEqual(report.externalRuntimeUrls, []);
  assert.deepEqual(report.forbiddenMatches, []);
});

test("rejects a private local path added anywhere in the public repository", async () => {
  const leakPath = join(root, "temporary-private-leak.txt");
  await writeFile(
    leakPath,
    ["", "Users", "example", "private-source"].join("/"),
    "utf8",
  );
  try {
    await assert.rejects(() => checkSite(root), /temporary-private-leak\.txt/u);
  } finally {
    await rm(leakPath, { force: true });
  }
});
