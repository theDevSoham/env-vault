import { describe, expect, it } from "vitest";
import { parseDotenv, serializeDotenv, serializeJson } from "../envformat";

describe("parseDotenv", () => {
  it("parses plain, quoted, exported and commented lines", () => {
    const { entries, invalidLines } = parseDotenv(
      [
        "# comment",
        "DATABASE_URL=postgres://db/prod",
        'JWT_SECRET="line1\\nline2"',
        "SINGLE='keep $LITERAL'",
        "export API_KEY=abc123",
        "TRAILING=value # note",
        "",
        "not a valid line",
        "1BAD=x",
      ].join("\n")
    );
    expect(entries).toEqual([
      { name: "DATABASE_URL", value: "postgres://db/prod" },
      { name: "JWT_SECRET", value: "line1\nline2" },
      { name: "SINGLE", value: "keep $LITERAL" },
      { name: "API_KEY", value: "abc123" },
      { name: "TRAILING", value: "value" },
    ]);
    expect(invalidLines).toEqual([8, 9]);
  });

  it("round-trips through serializeDotenv", () => {
    const entries = [
      { name: "SIMPLE", value: "abc" },
      { name: "SPACED", value: "has spaces" },
      { name: "MULTILINE", value: "a\nb" },
      { name: "QUOTED", value: 'say "hi"' },
      { name: "EMPTY", value: "" },
      { name: "HASH", value: "a#b" },
    ];
    const { entries: reparsed, invalidLines } = parseDotenv(serializeDotenv(entries));
    expect(invalidLines).toEqual([]);
    expect(reparsed).toEqual(entries);
  });

  it("serializeJson produces a flat object", () => {
    expect(JSON.parse(serializeJson([{ name: "A", value: "1" }]))).toEqual({ A: "1" });
  });
});
