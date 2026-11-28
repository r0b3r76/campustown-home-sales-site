# Agent log

Add a dated entry each time you work with your AI coding agent, with the newest entry at the bottom. Each entry records what you asked the agent, what it produced, and what you checked or changed. Paste your key prompts in exactly as you typed them. Include at least one time the agent got something wrong, and how you caught it.

Copy this outline for each entry:

```markdown
## YYYY-MM-DD: What you worked on

- **Asked:** "Paste your prompt here."
- **Agent produced:** What it made or changed.
- **Checked or changed:** How you checked it, and what you fixed.
```

## 2026-11-19: First version of the site (Claude)

- **Asked:** Shared screenshots of the assignment page and wrote: "i have today to complete this". Claude read `AGENTS.md` and `docs/data_description_sheet.md` before writing any analysis code.
- **Agent produced:** `scripts/build_site_data.py`, which reads `data/college_town_home_sales.csv` (without editing it), applies a price rule (keep $10,000 to $5,000,000), and writes the summary numbers into `index.html`. A new `index.html` replacing the placeholder: headline numbers, a city comparison bar chart (median price, price per sq ft, days on market), a Champaign-Urbana spotlight, a campus explorer (price by distance from campus and by quarter), a sortable table of all 18 cities, and a "How these numbers were made" section.
- **Checked or changed:** Compared the computed city medians with the data description sheet (Davis $889,000, Champaign $240,000, overall median $410,000, all match). The agent got some things wrong along the way: the first run of the script crashed because 6 rows have no sale date, which broke the quarter list, and the first version of the table showed half square feet (2,375.5) and inconsistent percent formatting (18% next to 15.3%). Both were caught by running the script and looking at a screenshot of the page, then fixed. Days on market uses contract date minus list date, never closing date, as the data sheet warns.

## 2026-11-27: Part 2, round 1: working version with all ten questions and features (Claude)

- **Asked:** Shared screenshots of the full Part 2 assignment page (graded questions, insights, required features, design and polish, repository rubric) and wrote: "id like to complete this assignment this evening, i can do the same and give you a bunch of pictures and such and we can work through it". Claude read `AGENTS.md` and `docs/data_description_sheet.md` before writing analysis code.
- **Agent produced:** Before building any page, Claude computed every answer in pandas as a reference. Then it built `scripts/build_site_data.py`, which writes `data/site_data.json`, a compact copy of all 35,442 rows (days on market derived as contract date minus list date, blanks kept blank). It replaced `index.html` with a new site: Q1 to Q10 with written answers and charts (eight chart types), Q7 to Q10 recalculating from their own inputs, filters for campus area, city, year, bedrooms and price, range sliders with number inputs (price, living area, miles to campus), Any/Yes/No/Unknown filters for garage, basement and fireplace, a Leaflet map that filters by campus area and city, a side-by-side comparison, a sortable city table, filters saved in the page address, light and dark modes, the P1 insight and a Data and methods section. Charts use ECharts; ECharts and Leaflet are saved in `assets/vendor/` so the site does not depend on a CDN.
- **Checked or changed:** Claude loaded the page in a headless browser and compared every number with the pandas reference: all Q1 to Q6 values, 160 random settings across Q7 to Q10, and a combined filter setting in the explore section. All matched. The check caught a mistake in Claude's own test script (it assumed campus areas were in alphabetical order by full name, while the site orders them by short name), which made Q10 look wrong until the test was fixed. Screenshots at desktop, tablet and phone sizes showed no sideways scrolling but did show overlapping axis titles on three charts, which were fixed. Ties are reported: Q5 has a four-way tie for the fastest campus area (7.0 days).

## 2026-11-27: Part 2, design round 1: typography, color palette and layout (Claude)

- **Asked:** "completed that commit" (after uploading round 1). Claude had proposed three design rounds after the working version; this first one covers typography, colors and layout.
- **Agent produced:** Self-hosted fonts (Fraunces for headings, Inter for text, both under the SIL Open Font License, in `assets/fonts/`). A defined palette with light and dark versions: warm paper background, ink text, one coral accent for answers and one cobalt blue for comparisons, with every other mark in a quiet gray-blue. Redesigned the header (new logo mark), hero (larger headline, one joined strip of headline numbers), section headings, question cards (numbered Q badges, an "Interactive" tag on Q7 to Q10, tinted answer boxes, shaded control panels) and spacing between sections. The charts now wait for the fonts to load so their labels are measured in the right font.
- **Checked or changed:** Ran the palette validator on the blue and coral pair. Light mode passed; dark mode failed the lightness band at first (both colors too light for the dark surface), so both were stepped darker and passed. Retook screenshots in light and dark mode at desktop, tablet and phone sizes: no sideways scrolling, no console errors. Toned down the answer-box tint after it read as too pink in dark mode.

## 2026-11-27: Part 2, design round 2: charts on phones and chart details (Claude)

- **Asked:** Uploaded design round 1. Claude proposed the next round from its own phone screenshots of the live version.
- **Agent produced:** Chart titles and subtitles moved out of the chart canvas into HTML above each chart, so long titles wrap on phones instead of being cut off or overlapping the Q2 legend. On phones, value axes show fewer ticks and hide overlapping labels, bar labels switch to short prices ($889K instead of $889,000), and the Q3 slope chart keeps city names visible. Q4 has extra room so negative labels never touch the campus names. Q5's labels now say "median 7.0" instead of a bare "7.0 days". Q10 uses whole-mile ticks. Tooltips stay inside the chart and wrap. The map's zoom buttons, tooltips and attribution follow the light or dark theme, and the map has a legend.
- **Checked or changed:** Screenshots at phone width showed two leftovers after the first pass: Q4's "−4.6%" label still touched "UNC Chapel Hill", and the rotated "Sales" axis titles overlapped tick labels on three charts. Both were fixed and checked again. The numbers check against pandas was rerun after the changes: 0 differences.

## 2026-11-27: Part 2, design round 3: controls, interaction details and README (Claude)

- **Asked:** Continued from the design plan agreed in this session (three design rounds after the working version); this last round covers controls and finishing touches.
- **Agent produced:** Dropdowns and number inputs styled to match the site (custom arrow, hover and focus rings in the theme color). Garage, basement and fireplace filters became a segmented control with hover states. Buttons, table headers and rows respond on hover, the sort icons stay SVG and show the sorted column and direction, slider handles grow on hover and show a focus ring for keyboard users, and "View the numbers" uses a rotating chevron. The header highlights the section you are reading, and on phones the section links move to a second row instead of disappearing. Added Q1 to Q10 jump links. The hero's "11 · 18" became "18 cities and towns near 11 campuses". Text on blue controls switches to dark ink in dark mode for contrast. Rewrote `README.md`: removed the template's "Start here" section and placeholder title, and described what the site answers, the data rules, how it was built and checked, and how to rebuild the data file.
- **Checked or changed:** Screenshots in light and dark mode at desktop and phone sizes. The browser's number spinners overlapped long prices like $5,000,000 in the price inputs, so they were hidden. The numbers check against pandas was rerun: 0 differences.

## 2026-11-27: Fix the map background (Claude)

- **Asked:** Sent a screenshot of the live map after round 1 was published: the background showed "API KEY REQUIRED" watermarks instead of streets and states.
- **Agent produced:** The agent got this wrong. It had used CARTO's basemap tiles, which now require an API key, and it could not see map tiles from its own test browser, so the problem only showed up on the live site. The map now uses OpenStreetMap's standard tiles, which need no key, with the required attribution. In dark mode the same tiles are darkened with a CSS filter instead of loading a second tile set. The Data and methods section and the README now credit OpenStreetMap only.
- **Checked or changed:** Caught by checking the live site in a real browser, which is why the agent asked for a screenshot of the map. Reloaded the page with no console errors and reran the numbers check (0 differences); the tiles themselves were checked again on the live site after upload.
