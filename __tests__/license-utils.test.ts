import { getDaysUntilExpiry, getRowClass, getStatusBadge } from "@/lib/license-utils";

describe("getDaysUntilExpiry", () => {
  it("returns null for null validade", () => {
    expect(getDaysUntilExpiry(null)).toBeNull();
  });

  it("returns positive days for future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 200);
    expect(getDaysUntilExpiry(future)).toBeGreaterThan(190);
  });

  it("returns negative days for past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    expect(getDaysUntilExpiry(past)).toBeLessThan(0);
  });

  it("returns 0 for today", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = getDaysUntilExpiry(today);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1);
  });
});

describe("getRowClass", () => {
  it("returns expired class for past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(getRowClass(past)).toBe("row-expired");
  });

  it("returns red class for <=120 days", () => {
    const d = new Date();
    d.setDate(d.getDate() + 100);
    expect(getRowClass(d)).toBe("row-red");
  });

  it("returns yellow class for <=180 days", () => {
    const d = new Date();
    d.setDate(d.getDate() + 150);
    expect(getRowClass(d)).toBe("row-yellow");
  });

  it("returns green class for >180 days", () => {
    const d = new Date();
    d.setDate(d.getDate() + 200);
    expect(getRowClass(d)).toBe("row-green");
  });

  it("returns no-date class for null", () => {
    expect(getRowClass(null)).toBe("row-no-date");
  });
});

describe("getStatusBadge", () => {
  it("returns badge config for known status", () => {
    const badge = getStatusBadge("Ativo");
    expect(badge).toHaveProperty("label");
    expect(badge).toHaveProperty("color");
  });

  it("returns default badge for unknown status", () => {
    const badge = getStatusBadge("desconhecido-xyz");
    expect(badge).toHaveProperty("label");
    expect(badge).toHaveProperty("color");
  });

  it("handles null status", () => {
    const badge = getStatusBadge(null);
    expect(badge).toHaveProperty("label");
  });
});
