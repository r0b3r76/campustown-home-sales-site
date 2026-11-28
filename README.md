# Near Campus: Home Sales in 18 College Towns

An interactive analysis of 35,442 home sales around 11 university campuses, in 18 cities and towns across 11 states, from March 2023 to March 2026.

**Live site:** https://r0b3r76.github.io/campustown-home-sales-site/

## What this site is for

The site answers ten business questions about college-town housing for a buyer, investor or analyst comparing markets. Each answer comes with a chart:

| | Question | Chart |
|---|---|---|
| Q1 | Which city has the highest median sale price? | Bar chart |
| Q2 | Using all rows, which city's mean is furthest above its median, and why? | Dumbbell chart |
| Q3 | How does the price rule change the ranking of cities by mean price? | Slope chart |
| Q4 | How did each campus area's median price change from 2024 to 2025? | Diverging bar chart |
| Q5 | Which campus area sells fastest and which slowest (median days on market)? | Box plot |
| Q6 | Where is the property tax burden, as a percent of sale price, highest and lowest? | Lollipop chart |
| Q7 | For a chosen number of bedrooms, which city is cheapest? | Bar chart (interactive) |
| Q8 | For a chosen price range, which city sells fastest? | Lollipop chart (interactive) |
| Q9 | For a chosen city and year, how many sales happened each month? | Column chart (interactive) |
| Q10 | For a campus area, budget and minimum bedrooms, how far from campus are the homes? | Histogram (interactive) |

The site also has an **Explore** section with filters (campus area, city, year, bedrooms, price, living area, miles to campus, garage, basement, fireplace), an interactive map, a side-by-side comparison of two places, and a sortable table of every city. The current filters are saved in the page address, so a copied link opens the same view. A toggle switches between light and dark modes.

Two **insights** close the site: how blank listing dates would distort days on market if they were treated as zero (P1), and what working with a coding agent was like compared with a Jupyter notebook (P2).

## Data notes

- **Price rule:** analyses use sales from $10,000 to $5,000,000, inclusive (35,371 of 35,442 rows). This removes 40 sales under $10,000, including one at $0, and 31 sales over $5,000,000, up to $81,510,000. Q2 and Q3 use all rows on purpose, and Q9 counts all rows with a sale date.
- **Days on market** is `contract_date` minus `list_date`, only for rows with both dates (28,042 rows, 28,028 in the price scope). A blank date is never treated as zero, and `sale_date` is not used for it.
- **Medians** are used unless a question asks for a mean.
- **Campus area** is the `university` column. **City** is city and state together.
- **Missing values:** blank basement and fireplace values are "Unknown", not "No". Price per square foot and the living-area filter skip rows with no living area or a living area of 0. Q6 uses tax amounts above $0 and below 10% of the sale price, which drops errors such as a $1,000,000,000 tax bill.
- **No deduplication by address.** `listing_id` is the key, so the 66 rows that share a street address (mostly separate State College condo units) are all kept.
- Ranges include their end values, and ties are reported, not broken.

## How it was built

- **Coding agent:** Claude (Claude Opus 5.5), working from screenshots of the assignment. The full log of prompts, what the agent produced and what was checked is in [`AGENT_LOG.md`](AGENT_LOG.md).
- **Checking the numbers:** every answer was first computed independently in pandas, then the site's numbers were compared with it in a headless browser: all of Q1 to Q6, 160 random settings across Q7 to Q10, and a combined filter setting in the explore section. Any difference was treated as a bug.
- **Site:** plain HTML, CSS and JavaScript, with no build step. All numbers are calculated in the visitor's browser from `data/site_data.json`.
- **Libraries:** [Apache ECharts](https://echarts.apache.org/) 6.1 for charts and [Leaflet](https://leafletjs.com/) 1.9 for the map, both saved in `assets/vendor/`. Map tiles from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Fonts: Fraunces and Inter (SIL Open Font License), saved in `assets/fonts/`.
- **Hosting:** GitHub Pages, published by `.github/workflows/pages.yml` on each push to `main`.

### Rebuilding the data file

`data/site_data.json` is made from `data/college_town_home_sales.csv` by a script (the dataset files are never edited):

```
python scripts/build_site_data.py
```

It needs Python 3 with pandas, and it writes the same file every time.

| Path | What it is |
|---|---|
| `index.html` | The site |
| `assets/js/app.js` | All calculations, charts, filters and the map |
| `assets/css/site.css` | Styles for light and dark modes |
| `data/site_data.json` | Compact copy of the dataset that the site reads |
| `scripts/build_site_data.py` | Makes `data/site_data.json` |
| `data/college_town_home_sales.*` | The original dataset (CSV, Excel, SQLite, DuckDB, Parquet), unchanged |
| `docs/data_description_sheet.md` | What every column means, and the data problems |
| `AGENTS.md`, `AGENT_LOG.md` | Instructions for the coding agent, and the log of working with it |

## Citation

College-town home sales dataset, version 1.0 (2026). University of Illinois-Deloitte Foundation Center for Business Emerging Technologies. Data collected March 2026.
