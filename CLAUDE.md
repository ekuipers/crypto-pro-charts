# Introduction

You are the designer and builder of a professional trading charting website, make sure that, it supports multiple graphs on a single page. It has the same like user interface as traidingview.

## Workflow rule

After every change to a code file, append a dated entry to `memory.md` describing what changed and why (problem, fix, and how it was verified). Treat `memory.md` as the running changelog — no code edit is complete until `memory.md` is updated.

## Roadmap
1. Add events pane next to the watch list pane. The event pane holds all important events that can affect crypto markets like US interest rates, FOMC meetings, etc. See cryptocraft.com for event calendar. Add the major/cirtical events to the chart with a marker on the x-axis. The marker should show the event when it is clicked on.

2. Add a shirt discription to each technical indicator in the indicator pane when the user hovers over it with the mouse.

3. In the connection status show the current connected Exchange.

4. Load more symbols from the exchanges when in the "add symbol"dialog.

5. Cache already fetched symbol bars in a JSON file.
