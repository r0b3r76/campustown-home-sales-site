# What a home costs near campus

## What this site is for

A dashboard comparing home prices across 18 college towns around 11 university campuses, built from the College-town home sales dataset (35,442 sales, March 2023 to March 2026). It is for students, families and anyone curious about college-town housing, especially people comparing Champaign-Urbana with other college towns. The site shows:

- How the 18 cities compare on median sale price, price per square foot and days on market
- A Champaign-Urbana spotlight
- A campus explorer showing how prices change with distance from campus and over time
- A sortable table of every city

## Live site

https://r0b3r76.github.io/campustown-home-sales-site/

## Data notes

- **Price rule:** sales under $10,000 (40 rows) and over $5,000,000 (31 rows) are left out everywhere, leaving 35,371 of 35,442 sales. All prices are medians, not averages, so extreme sales can't distort them.
- **Days on market** is `contract_date` minus `list_date`, the way real estate sites count it, and not to the closing date. It is computed only for sales that have both dates. A blank date is never treated as zero.
- **Missing list dates are not random.** About 17% of sales have no listing on record, often off-market or new-construction sales, and the share varies by city. Each city's days on market describes only its listed homes, and the table shows each city's share with no listing.
- **Price per square foot** uses only homes with a living area above 0 sq ft.
- **Distance to campus** uses the dataset's `university` and `miles_to_campus` columns. These are straight-line distances to each campus landmark. In the distance chart, bands with fewer than 30 sales are hidden.
- **Quarterly trends** leave out the first quarter of 2023, because the data starts in late March 2023.
- **`home_type` is not used**, because it labels almost everything, including condo units, as single family.
- **Rows are never deduplicated by street address**, because some addresses are condo buildings with several separate units. `listing_id` is the key.

## How the numbers are made

`scripts/build_site_data.py` reads `data/college_town_home_sales.csv`, applies the rules above, and writes the summary numbers into `index.html` between the `/*DATA_START*/` and `/*DATA_END*/` markers. To rebuild them, run this from the repository root (it needs Python with pandas):

```
python scripts/build_site_data.py
```

The dataset files in `data/` are never edited.

## Tools we used

- Claude (Anthropic) as the AI coding agent. See `AGENT_LOG.md`.
- Python and pandas to compute the summary numbers.
- Plain HTML, CSS and JavaScript for the site, with charts drawn as SVG and no outside libraries.
- GitHub Pages for hosting.

## Citation

College-town home sales dataset, version 1.0 (2026). University of Illinois-Deloitte Foundation Center for Business Emerging Technologies. Data collected March 2026.
