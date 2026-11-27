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
