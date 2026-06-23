import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("deployment security", () => {
  it("keeps local environment files ignored and out of Git", () => {
    const trackedEnvFiles = execFileSync(
      "git",
      ["ls-files", "--", ".env", ".env.local"],
      { cwd: projectRoot, encoding: "utf8" },
    ).trim();

    expect(trackedEnvFiles).toBe("");

    for (const envFile of [".env", ".env.local"]) {
      const ignoredFile = execFileSync(
        "git",
        ["check-ignore", "--no-index", envFile],
        { cwd: projectRoot, encoding: "utf8" },
      ).trim();

      expect(ignoredFile).toBe(envFile);
    }
  });

  it("does not inject a Gemini API key into the browser build", () => {
    const viteConfig = readFileSync(
      path.join(projectRoot, "vite.config.ts"),
      "utf8",
    );
    const envExample = readFileSync(
      path.join(projectRoot, ".env.example"),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(viteConfig).not.toContain("GEMINI_API_KEY");
    expect(envExample).not.toContain("GEMINI_API_KEY");
    expect(envExample).not.toContain("FREEMODEL_");
    expect(existsSync(path.join(projectRoot, "src/lib/gemini.ts"))).toBe(false);
    expect(packageJson.dependencies?.["@google/genai"]).toBeUndefined();
  });
});
