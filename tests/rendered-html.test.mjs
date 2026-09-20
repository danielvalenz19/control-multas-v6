import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the built Vite HTML shell", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html[^>]+lang=["']es["']/i);
  assert.match(html, /Sistema Municipal de Multas \| PMT San Antonio/i);
  assert.match(html, /<script[^>]+type=["']module["'][^>]+src=["']\/assets\//i);
});
