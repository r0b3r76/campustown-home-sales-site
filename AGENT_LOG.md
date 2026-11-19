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
