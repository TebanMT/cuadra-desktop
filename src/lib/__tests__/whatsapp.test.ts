import { describe, it, expect } from "vitest";
import { whatsappPhone, whatsappUrl } from "../whatsapp";

describe("whatsappPhone", () => {
  it("prepends MX country code to 10-digit numbers", () => {
    expect(whatsappPhone("5512345678")).toBe("525512345678");
  });

  it("strips formatting characters (spaces, dashes, parens, +)", () => {
    expect(whatsappPhone("+52 (55) 1234-5678")).toBe("525512345678");
    expect(whatsappPhone("55-1234-5678")).toBe("525512345678");
    expect(whatsappPhone("(55) 12345678")).toBe("525512345678");
  });

  it("respects existing country code when 11+ digits", () => {
    expect(whatsappPhone("525512345678")).toBe("525512345678");
    expect(whatsappPhone("+15551234567")).toBe("15551234567");
  });

  it("returns empty string for unusable inputs", () => {
    expect(whatsappPhone("")).toBe("");
    expect(whatsappPhone(null)).toBe("");
    expect(whatsappPhone(undefined)).toBe("");
    expect(whatsappPhone("123")).toBe("");
    expect(whatsappPhone("abc")).toBe("");
  });
});

describe("whatsappUrl", () => {
  it("builds wa.me URL with the encoded message", () => {
    const url = whatsappUrl("5512345678", "Hola Juan, ¿pasas hoy?");
    expect(url).toBe(
      "https://wa.me/525512345678?text=Hola%20Juan%2C%20%C2%BFpasas%20hoy%3F"
    );
  });

  it("works without a message", () => {
    expect(whatsappUrl("5512345678")).toBe("https://wa.me/525512345678");
  });

  it("returns null when phone is unusable", () => {
    expect(whatsappUrl("", "hola")).toBeNull();
    expect(whatsappUrl(null, "hola")).toBeNull();
    expect(whatsappUrl("abc", "hola")).toBeNull();
  });
});
