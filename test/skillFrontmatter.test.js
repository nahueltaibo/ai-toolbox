import { test } from "node:test";
import assert from "node:assert/strict";
import { getFrontmatterVersion, setFrontmatterVersion } from "../src/skillFrontmatter.js";

const sample = "---\nname: demo\ndescription: A demo skill.\n---\n# Demo\n\nBody text.\n";

test("getFrontmatterVersion returns null when there's no metadata block yet", () => {
  assert.equal(getFrontmatterVersion(sample), null);
});

test("setFrontmatterVersion adds a metadata block and leaves the body untouched", () => {
  const stamped = setFrontmatterVersion(sample, "1.0.0");
  assert.equal(getFrontmatterVersion(stamped), "1.0.0");
  assert.match(stamped, /# Demo\n\nBody text\.\n$/);
  assert.match(stamped, /^name: demo/m);
});

test("setFrontmatterVersion overwrites an existing version in place", () => {
  const stamped = setFrontmatterVersion(sample, "1.0.0");
  const restamped = setFrontmatterVersion(stamped, "2.0.0");
  assert.equal(getFrontmatterVersion(restamped), "2.0.0");
});

test("setFrontmatterVersion preserves other keys already in the metadata map", () => {
  const withMetadata = "---\nname: demo\nmetadata:\n  category: writing\n---\nbody\n";
  const stamped = setFrontmatterVersion(withMetadata, "1.0.0");
  assert.equal(getFrontmatterVersion(stamped), "1.0.0");
  assert.match(stamped, /category: writing/);
});

test("setFrontmatterVersion does not reflow a long description onto multiple lines", () => {
  const long =
    "---\nname: demo\ndescription: " +
    "A".repeat(120) +
    "\n---\nbody\n";
  const stamped = setFrontmatterVersion(long, "1.0.0");
  assert.match(stamped, new RegExp(`^description: A{120}$`, "m"));
});

test("setFrontmatterVersion leaves content with no frontmatter block untouched", () => {
  const noFrontmatter = "# Just a heading\n\nNo frontmatter here.\n";
  assert.equal(setFrontmatterVersion(noFrontmatter, "1.0.0"), noFrontmatter);
});

test("getFrontmatterVersion returns null for content with no frontmatter block", () => {
  assert.equal(getFrontmatterVersion("# No frontmatter\n"), null);
});
