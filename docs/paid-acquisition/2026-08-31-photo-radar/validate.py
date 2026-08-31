#!/usr/bin/env python3
"""Validate this paused acquisition draft offline; never imports or contacts Ads."""

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import parse_qs

ASSETS = Path(__file__).resolve().parent
REPO = ASSETS.parents[2]


def read_json(name):
    return json.loads((ASSETS / name).read_text(encoding="utf-8"))


def rows(name):
    with (ASSETS / name).open(newline="", encoding="utf-8") as stream:
        result = list(csv.DictReader(stream))
    assert result and all(None not in row and None not in row.values() for row in result), name
    return result


def check_copy(text, context):
    forbidden = r"illegal now|banned now|guarantee|success rate|win rate|insurance sav|insurance report|\bIIR\b|\blawyer\b|law firm|48.hour|cheap clicks|low CPC"
    assert not re.search(forbidden, text, re.I), f"Unreviewed claim in {context}"
    amounts = re.findall(r"\$\d+(?:\.\d+)?", text)
    assert all(amount in {"$79", "$82.95"} for amount in amounts), f"Wrong offer in {context}"
    assert not amounts or "GST" in text, f"Tax qualification missing in {context}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-launch-ready", action="store_true")
    args = parser.parse_args()

    settings = read_json("launch-settings.json")
    meta = read_json("meta-copy.json")
    audit = read_json("destination-audit.json")
    offer = json.loads((REPO / "src/config/offers.json").read_text())["photoRadar"]
    assert offer["priceCad"] == 79 and offer["gstCad"] == 3.95 and offer["totalCad"] == 82.95
    assert offer["orderType"] == "photo_radar" and offer["reviewPath"] == "ate"
    assert settings["spend_authorized"] is False and settings["import_authorized"] is False
    assert settings["state"] == "draft_paused_not_imported"
    assert settings["average_daily_budget_cad"] is None and settings["total_budget_cad"] is None
    assert settings["start_date"] is None and settings["end_date"] is None
    assert settings["source_offer"]["net_price_cad"] == offer["priceCad"]
    assert settings["source_offer"]["checkout_total_cad"] == offer["totalCad"]
    assert settings["source_offer"]["intake_path"] == offer["intakePath"]
    account = settings["settings_to_verify_in_account"]
    assert account["network"] == "Google Search only"
    assert account["target_location"] == "Alberta, Canada"
    assert account["location_option"] == "Presence: people in or regularly in targeted locations"
    assert account["positive_keyword_match_types"] == ["Exact", "Phrase"]
    for key in ["search_partners", "display_network", "dynamic_keyword_insertion", "ai_max_or_keyword_expansion", "text_customization", "final_url_expansion", "automatically_created_unreviewed_assets", "auto_apply_recommendations", "remarketing", "customer_lists", "enhanced_conversions", "business_profile_link_or_location_assets"]:
        assert account[key] is False, key
    measurement = settings["measurement"]
    assert measurement["one_primary_action_per_purchase"] is True
    assert measurement["value_cad_excluding_gst"] == 79 and measurement["currency"] == "CAD"
    assert measurement["count"] == "Every" and measurement["platform_action_id"] is None
    economics = settings["economics"]
    assert economics["scale_when_mature_new_customer_cac_cad_below"] == 35
    assert economics["cut_when_mature_new_customer_cac_cad_at_or_above"] == 55
    assert economics["contribution_is_measured"] is False
    assert economics["first_twenty_crown_reduction_watch"]["paid_ate_files"] == 20
    assert economics["first_twenty_crown_reduction_watch"]["median_below_cad"] == 40

    campaigns = rows("01-campaigns.csv")
    groups = rows("02-ad-groups.csv")
    keywords = rows("03-keywords.csv")
    ads = rows("04-responsive-search-ads.csv")
    negatives = rows("05-negative-keywords.csv")
    assert len(campaigns) == 1
    campaign = settings["campaign"]
    assert campaigns[0]["Campaign"] == campaign
    assert campaigns[0]["Campaign status"] == "Paused" and campaigns[0]["Budget"] == ""
    assert campaigns[0]["Campaign type"] == "Search"
    assert campaigns[0]["Networks"] == "Google Search" and campaigns[0]["Languages"] == "en"
    assert all(row["Campaign"] == campaign for row in groups + keywords + ads)
    assert len(groups) == 3 and all(row["Ad group status"] == "Paused" for row in groups)
    group_names = {row["Ad Group"] for row in groups}
    assert len(group_names) == 3
    assert all(row["Ad Group"] in group_names and row["Status"] == "Paused" for row in keywords + ads)

    pairs = defaultdict(set)
    seen = set()
    for row in keywords:
        identity = (row["Ad Group"], row["Keyword"], row["Match type"])
        assert identity not in seen, f"Duplicate keyword: {identity}"
        seen.add(identity)
        assert row["Match type"] in {"Exact", "Phrase"}
        assert len(row["Keyword"]) <= 80 and len(row["Keyword"].split()) <= 10
        assert not any(mark in row["Keyword"] for mark in ['[', ']', '"']), "Use the match-type column"
        pairs[(row["Ad Group"], row["Keyword"])].add(row["Match type"])
    assert all(matches == {"Exact", "Phrase"} for matches in pairs.values())
    for group in group_names:
        text = " ".join(row["Keyword"] for row in keywords if row["Ad Group"] == group)
        for family in ["photo radar", "red light camera", "intersection safety camera", "owner of motor vehicle"]:
            assert family in text, (group, family)

    assert Counter(row["Ad Group"] for row in ads) == Counter({group: 1 for group in group_names})
    for row in ads:
        context = row["Ad Group"]
        assert row["Ad type"] == "Responsive search ad"
        assert row["Final URL"] == settings["destination"] == "https://fabsy.ca/photo-radar"
        assert row["Headline 1 position"] == "1" and row["Headline 2 position"] == "2"
        assert row["Description 1 position"] == "1"
        assert row["Headline 2"] == "$79 + GST. No Success Fee"
        for token in ["Alberta", "owner camera notices", "$79 + GST", "No trial", "No success fee", "No outcome promised"]:
            assert token in row["Description 1"], (context, token)
        headlines = [row[f"Headline {i}"] for i in range(1, 16)]
        descriptions = [row[f"Description {i}"] for i in range(1, 5)]
        assert len(set(headlines)) == 15 and all(0 < len(text) <= 30 for text in headlines), context
        assert len(set(descriptions)) == 4 and all(0 < len(text) <= 90 for text in descriptions), context
        assert all(0 < len(row[key]) <= 15 for key in ["Path 1", "Path 2"])
        for text in headlines + descriptions:
            check_copy(text, context)
        combined = " ".join(descriptions).lower()
        for token in ["no demerits", "insurance impact", "not-guilty plea", "request disclosure", "you approve any deal"]:
            assert token in combined, (context, token)
        suffix = row["Final URL suffix"]
        assert not suffix.startswith("?")
        assert set(re.findall(r"\{([^}]+)\}", suffix)) == {"adgroupid", "creative", "keyword"}
        assert set(parse_qs(suffix)) == {"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"}
        assert parse_qs(suffix)["utm_source"] == ["google"]
        assert parse_qs(suffix)["utm_medium"] == ["cpc"]

    protected = {"photo radar", "red light", "red light camera", "intersection safety camera", "owner", "owner of motor vehicle", "insurance", "pay", "ticket", "camera", "calgary", "edmonton", "alberta"}
    assert len({(row["Keyword"], row["Match type"]) for row in negatives}) == len(negatives)
    for negative in negatives:
        term = negative["Keyword"].lower()
        assert negative["Match type"] in {"Negative exact", "Negative phrase"}
        assert term not in protected, f"Blanket eligible-intent exclusion: {term}"
        for positive in keywords:
            query = positive["Keyword"].lower()
            blocks = query == term if negative["Match type"] == "Negative exact" else f" {term} " in f" {query} "
            assert not blocks, f"Literal positive-negative conflict: {query} / {term}"

    assert meta["spend_authorized"] is False and meta["budget_cad"] is None
    assert meta["state"] == "copy_only_not_uploaded" and meta["conversion_value_cad_excluding_gst"] == 79
    assert meta["destination"] == settings["destination"]
    assert len(meta["variants"]) == 3 and len({item["id"] for item in meta["variants"]}) == 3
    for variant in meta["variants"]:
        # Editorial budgets for this pack, not a universal Meta placement specification.
        assert 0 < len(variant["headline"]) <= 40 and 0 < len(variant["description"]) <= 30
        for field in ["headline", "description", "primary_text"]:
            check_copy(variant[field], variant["id"])
        assert "$79" in variant["primary_text"][:125] and "GST" in variant["primary_text"][:125]
        body = variant["primary_text"].lower()
        for token in ["alberta", "owner", "$82.95 total", "no demerits", "insurance impact", "no trial", "no success fee", "no outcome is promised", "you approve any deal"]:
            assert token in body, (variant["id"], token)
        assert parse_qs(variant["url_parameters"])["utm_source"] == ["meta"]
        assert "{" not in variant["url_parameters"] and "}" not in variant["url_parameters"]

    assert audit["production_destination_verified"] is False
    assert audit["browser_checkout_verified"] is False
    blockers = [
        "No budget or activation authorization; campaign CSV Budget is intentionally blank.",
        "Billing/account identity and advertiser status need an authorized account check.",
        "Production Photo Radar destination and checkout are not verified.",
        "A single paid Photo Radar conversion with CAD 79 value and deduplication is not verified.",
        "Targeting, inherited negatives, assets, privacy and evaluation settings need account review.",
    ]
    report = {
        "status": "draft_valid_not_launch_ready",
        "launch_ready": False,
        "counts": {"campaigns": len(campaigns), "ad_groups": len(groups), "keywords": len(keywords), "rsa": len(ads), "negative_keywords": len(negatives), "meta_variants": len(meta["variants"])},
        "max_rsa_headline_length": max(len(row[f"Headline {i}"]) for row in ads for i in range(1, 16)),
        "max_rsa_description_length": max(len(row[f"Description {i}"]) for row in ads for i in range(1, 5)),
        "checks": ["All entities with a status are paused", "No assigned or authorized spend", "Canonical CAD 79 / GST 3.95 / total 82.95", "RSA copy limits and mandatory pins", "Exact/Phrase pairs and all four camera-notice families", "No blanket holdout negatives or literal positive-negative conflicts", "Alberta presence and restricted network settings", "Meta tax/scope/approval/outcome qualifications", "Paid purchase value and CAC/reduction threshold contract"],
        "limitations": ["Offline content checks do not validate Ads Editor import, account policy approval, actual matching or production behavior", "Literal negative matching does not model every Google close variant", "This validator intentionally validates a paused draft, not authorization to launch"],
        "launch_blockers": blockers,
        "asset_sha256": {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(ASSETS.iterdir()) if file.is_file() and file.name != "validation.json"},
    }
    (ASSETS / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ["status", "counts", "max_rsa_headline_length", "max_rsa_description_length", "launch_blockers"]}, indent=2))
    return 1 if args.require_launch_ready else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, KeyError, ValueError) as error:
        print(f"Draft validation failed: {error}", file=sys.stderr)
        sys.exit(1)
