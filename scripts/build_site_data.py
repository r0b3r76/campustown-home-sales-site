"""Builds the summary numbers shown on the site and writes them into index.html.

Run from the repository root:  python scripts/build_site_data.py
Reads data/college_town_home_sales.csv (never edits it) and replaces the block
between /*DATA_START*/ and /*DATA_END*/ in index.html with fresh JSON.

Rules applied (also stated on the page):
  * Price rule: keep sales from $10,000 to $5,000,000; drop the rest.
  * Days on market = contract_date - list_date, only where both dates exist
    (a blank is never treated as zero).
  * Price per sq ft only where living_area_sqft > 0.
  * Rows are keyed by listing_id; nothing is deduplicated by address.
"""
import json, re, pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "college_town_home_sales.csv"
PAGE = ROOT / "index.html"
LOW, HIGH = 10_000, 5_000_000
BANDS = [(0, 1, "Under 1 mi"), (1, 2, "1–2 mi"), (2, 3, "2–3 mi"),
         (3, 5, "3–5 mi"), (5, 10, "5–10 mi"), (10, 99, "10+ mi")]
SHORT = {
    "University of Illinois Urbana-Champaign": "Illinois",
    "Purdue University": "Purdue",
    "The Pennsylvania State University": "Penn State",
    "The University of Iowa": "Iowa",
    "The University of North Carolina at Chapel Hill": "UNC",
    "University of California, Davis": "UC Davis",
    "University of Florida": "Florida",
    "University of Georgia": "Georgia",
    "University of Michigan": "Michigan",
    "University of Virginia": "Virginia",
    "University of Wisconsin-Madison": "Wisconsin",
}

def med(s):
    s = s.dropna()
    return None if s.empty else float(round(s.median(), 1))

df = pd.read_csv(CSV, dtype={"zipcode": str, "county_fips": str, "parcel_number": str})
total = len(df)
too_low = int((df.sale_price < LOW).sum())
too_high = int((df.sale_price > HIGH).sum())
df = df[(df.sale_price >= LOW) & (df.sale_price <= HIGH)].copy()

for c in ("list_date", "contract_date", "sale_date"):
    df[c] = pd.to_datetime(df[c])
df["dom"] = (df.contract_date - df.list_date).dt.days
df.loc[df.dom < 0, "dom"] = None
df["ppsf"] = df.sale_price / df.living_area_sqft.where(df.living_area_sqft > 0)
df["campus"] = df.university.map(SHORT)
df["band"] = pd.cut(df.miles_to_campus, [b[0] for b in BANDS] + [99],
                    labels=[b[2] for b in BANDS], right=False)
df["quarter"] = df.sale_date.dt.to_period("Q").astype(str)

def summary(g):
    return {
        "sales": int(len(g)),
        "median_price": med(g.sale_price),
        "p25": med(g.sale_price.quantile([.25])) if len(g) else None,
        "p75": med(g.sale_price.quantile([.75])) if len(g) else None,
        "median_ppsf": med(g.ppsf),
        "median_dom": med(g.dom),
        "dom_n": int(g.dom.notna().sum()),
        "pct_no_list": round(100 * g.list_date.isna().mean(), 1),
        "median_miles": med(g.miles_to_campus),
        "median_sqft": med(g.living_area_sqft.where(g.living_area_sqft > 0)),
        "median_year": med(g.year_built),
    }

cities = []
for (city, state), g in df.groupby(["city", "state"]):
    row = {"city": city, "state": state, "campus": g.campus.mode()[0]}
    row.update(summary(g))
    cities.append(row)
cities.sort(key=lambda r: -r["median_price"])

# quarters: drop the partial first quarter (2023Q1 has only late-March sales)
quarters = sorted(q for q in df.quarter.dropna().unique() if q not in ("2023Q1", "NaT", "nan"))
campuses = {}
for name in ["All"] + sorted(SHORT.values()):
    g = df if name == "All" else df[df.campus == name]
    entry = summary(g)
    entry["bands"] = [{"band": b, "sales": int(len(x)), "median_price": med(x.sale_price)}
                      for b, x in ((b[2], g[g.band == b[2]]) for b in BANDS)]
    entry["quarters"] = [{"q": q, "sales": int((g.quarter == q).sum()),
                          "median_price": med(g[g.quarter == q].sale_price)} for q in quarters]
    entry["cities"] = sorted(g.city.unique().tolist())
    campuses[name] = entry

data = {
    "rows_total": total, "rows_kept": int(len(df)),
    "excluded_low": too_low, "excluded_high": too_high,
    "low": LOW, "high": HIGH,
    "first_sale": str(df.sale_date.min().date()), "last_sale": str(df.sale_date.max().date()),
    "n_cities": len(cities), "n_campuses": len(SHORT),
    "overall": summary(df),
    "cities": cities, "campuses": campuses,
}

page = PAGE.read_text(encoding="utf-8")
block = "/*DATA_START*/" + json.dumps(data, separators=(",", ":")) + "/*DATA_END*/"
page, n = re.subn(r"/\*DATA_START\*/.*?/\*DATA_END\*/", lambda m: block, page, flags=re.S)
assert n == 1, "index.html is missing the /*DATA_START*/ ... /*DATA_END*/ markers"
PAGE.write_text(page, encoding="utf-8")
print(f"Kept {len(df):,} of {total:,} sales; wrote summary into index.html")
