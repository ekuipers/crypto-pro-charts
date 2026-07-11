# Introduction

You are the designer and builder of a professional trading charting website, make sure that, it supports multiple graphs on a single page. It has the same like user interface as traidingview.

Title: CryptoPro Charts
Creator: Erik Kuipers

Add the creator to the footer of the website.

# Workflow rule

1. After every change to a code file, append a dated entry to `memory.md` describing what changed and why (problem, fix, and how it was verified). Treat `memory.md` as the running changelog — no code edit is complete until `memory.md` is updated. 
2. Only start local node server for testing purpose.
3. Move completed roadmap items and bug fixes to the memory file for reference and change log purpose
4. Automatically commit changes to git and sync with remote repo
5. Update documentation.
6. Update version number in the footer with the lastest version in the change log.
7. Always directly implement roadmap after the roadmap scan.
8. Allow all edits and commands automatically.
9. Place frontend .js files in the /src/js folder and backend .js files in the /src folder.
10. Use favicon as Site logo.

## Roadmap

_Populated 2026-07-11 from a full project analysis. P1 core charting gaps shipped in v1.22.0; P2 pro-trader differentiators shipped in v1.23.0; P3 platform/performance/hardening shipped in v1.24.0 (9 of 10 items — see below for the one deferred item). Completed items move to `memory.md`._

### Deferred (from P3)

21. **Upgrade LightweightCharts 4.1.3 → v5** — deliberately deferred after research (not attempted): touches the core rendering engine (13 series-creation call sites, the shared markers pipeline, the watermark, and possibly the cross-panel price/time-scale sync logic) with real unknowns remaining even after reading the official migration guide (priceScale/timeScale API deltas, new-primitive disposal lifecycle, native-pane mechanics vs. the current one-LightweightCharts-instance-per-oscillator architecture). Full findings and a concrete call-site inventory are in `memory.md` under v1.24.0 (P3-21) so a future attempt doesn't have to re-derive them. Revisit as a dedicated, focused effort — not bundled with other work.

## Bugs

_No open bugs. Fixed bugs are logged in `memory.md`._
