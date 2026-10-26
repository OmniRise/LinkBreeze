import { describe, it, expect } from "vitest";
import { assertExportSize, EXPORT_MAX_BYTES } from "@/lib/export/size";

describe("assertExportSize", () => {
  it("accepts realistic export sizes", () => {
    const html = "<!DOCTYPE html><html><body>hi</body></html>";
    const res = assertExportSize(html);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bytes).toBe(html.length);
  });

  it("counts UTF-8 bytes, not string length", () => {
    const res = assertExportSize("é".repeat(10)); // 2 bytes each in UTF-8
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bytes).toBe(20);
  });

  it("rejects output over the 2 MiB cap", () => {
    const over = "a".repeat(EXPORT_MAX_BYTES + 1);
    const res = assertExportSize(over);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.bytes).toBe(EXPORT_MAX_BYTES + 1);
      expect(res.max).toBe(EXPORT_MAX_BYTES);
    }
  });
});
