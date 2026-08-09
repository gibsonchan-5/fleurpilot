import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/*
 * FleurPilot - AI Writing Assistant
 * Obsidian Plugin
 */`;

const prod = process.argv[2] === "production";

esbuild
  .build({
    banner: { js: banner },
    bundle: true,
    entryPoints: ["src/main.ts"],
    external: [
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...builtins,
    ],
    format: "cjs",
    logLevel: "info",
    minify: prod,
    outdir: ".",
    platform: "node",
    sourcemap: prod ? false : "inline",
    target: "es2018",
    treeShaking: true,
  })
  .catch(() => process.exit(1));
