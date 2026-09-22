import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("keeps a local path", () => {
    expect(safeNext("/tasks/PM-1")).toBe("/tasks/PM-1");
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/a?b=c#d")).toBe("/a?b=c#d");
  });

  it("rejects an absolute URL", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com/x")).toBe("/");
  });

  it("rejects a protocol-relative URL, which looks local but is not", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/path")).toBe("/");
  });

  it("rejects backslash variants some clients normalise to slashes", () => {
    // String.raw so these are genuine backslashes. Written as "/\evil.com" the
    // escape is invalid and JS silently yields "/evil.com" — an ordinary path,
    // so the test would assert nothing.
    expect(safeNext(String.raw`/\evil.com`)).toBe("/");
    expect(safeNext(String.raw`/path\to`)).toBe("/");
  });

  it("falls back on empty or non-string input", () => {
    expect(safeNext("")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(42)).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(safeNext("https://evil.com", "/login")).toBe("/login");
  });
});
