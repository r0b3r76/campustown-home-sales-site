"""Builds data/site_data.json, the compact copy of the dataset that the site reads.

Run from the repository root:  python scripts/build_site_data.py
Needs Python 3 with pandas. Reads data/college_town_home_sales.csv (never edits it).

The output keeps every one of the 35,442 rows, so the browser can apply the price rule,
the filters and the question settings itself. Nothing is filtered or estimated here.
Per row it keeps only the columns the site uses, stored column by column to keep the
file small. City and campus area are stored as numbers that index into the lookup lists.

Derived values, computed exactly as docs/data_description_sheet.md describes:
  * dom: days on market = contract_date - list_date, in days, only where both dates exist.
    A blank stays blank (null); it is never turned into zero.
  * ym:  year * 100 + month of sale_date (null for the 6 rows with no sale date).
  * Campus area and city map points: the median latitude and longitude of the sales
    in that area or city.
"""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "college_town_home_sales.csv"
OUT = ROOT / "data" / "site_data.json"

SHORT = {
    "University of Illinois Urbana-Champaign": "Illinois",
    "Purdue University": "Purdue",
    "The Pennsylvania State University": "Penn State",
    "The University of Iowa": "Iowa",
    "The University of North Carolina at Chapel Hill": "UNC Chapel Hill",
    "University of California, Davis": "UC Davis",
    "University of Florida": "Florida",
    "University of Georgia": "Georgia",
    "University of Michigan": "Michigan",
    "University of Virginia": "Virginia",
    "University of Wisconsin-Madison": "Wisconsin",
}


def nullable(series, digits=None):
    out = []
    for v in series:
        if pd.isna(v):
            out.append(None)
        elif digits is None:
            out.append(int(v))
        else:
            r = round(float(v), digits)
            out.append(int(r) if r == int(r) else r)
    return out


def main():
    df = pd.read_csv(CSV, dtype={"zipcode": str, "county_fips": str, "parcel_number": str})
    assert df["listing_id"].is_unique, "listing_id should be unique"
    df["place"] = df["city"] + ", " + df["state"]
    for col in ["list_date", "contract_date", "sale_date"]:
        df[col] = pd.to_datetime(df[col])
    df["dom"] = (df["contract_date"] - df["list_date"]).dt.days
    df["ym"] = df["sale_date"].dt.year * 100 + df["sale_date"].dt.month

    unis = sorted(df["university"].unique(), key=lambda u: SHORT[u])
    uni_index = {u: i for i, u in enumerate(unis)}
    places = sorted(df["place"].unique())
    place_index = {p: i for i, p in enumerate(places)}

    uni_list = []
    for u in unis:
        sub = df[df["university"] == u]
        uni_list.append({
            "name": u,
            "short": SHORT[u],
            "lat": round(float(sub["latitude"].median()), 5),
            "lon": round(float(sub["longitude"].median()), 5),
        })
    place_list = []
    for p in places:
        sub = df[df["place"] == p]
        place_list.append({
            "name": p,
            "uni": uni_index[sub["university"].mode().iloc[0]],
            "lat": round(float(sub["latitude"].median()), 5),
            "lon": round(float(sub["longitude"].median()), 5),
        })

    cols = {
        "c": [place_index[p] for p in df["place"]],
        "u": [uni_index[u] for u in df["university"]],
        "p": nullable(df["sale_price"]),
        "b": nullable(df["beds"]),
        "a": nullable(df["living_area_sqft"]),
        "yb": nullable(df["year_built"]),
        "mi": nullable(df["miles_to_campus"], 1),
        "g": nullable(df["has_garage"]),
        "bs": nullable(df["has_basement"]),
        "fp": nullable(df["has_fireplace"]),
        "tx": nullable(df["tax_annual_amount"], 2),
        "dom": nullable(df["dom"]),
        "ym": nullable(df["ym"]),
    }
    data = {
        "source": "College-town home sales dataset, version 1.0 (2026). University of "
                  "Illinois-Deloitte Foundation Center for Business Emerging Technologies.",
        "rows": len(df),
        "unis": uni_list,
        "places": place_list,
        "cols": cols,
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(df):,} rows, {OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
