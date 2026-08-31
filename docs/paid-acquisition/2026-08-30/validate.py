#!/usr/bin/env python3
"""Check the paused RR pack offline. Never imports assets or contacts a provider."""

import argparse
import csv
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

PACK = Path(__file__).resolve().parent
ARCHIVE = "fabsy-rapid-resolution-launch-pack.zip"
PREFIX = "fabsy-rapid-resolution-launch-pack/"
ENTRIES = [
    "01-campaigns.csv", "02-ad-groups.csv", "03-keywords.csv",
    "04-responsive-search-ads.csv", "05-negative-keywords.csv", "06-assets.csv",
    "README.md", "campaign-review.md", "launch-settings.json", "live-http-audit.json",
    "measurement-readiness.md", "site-readiness.md", "social-copy-drafts.md",
    "validation.json", "messaging-direction.md",
]


def rows(name):
    with (PACK / name).open(encoding="utf-8", newline="") as stream:
        data = list(csv.DictReader(stream))
    assert data and all(None not in row and None not in row.values() for row in data), name
    return data


def blocks(query, negative):
    query, term = query.lower(), negative["Keyword"].lower()
    return query == term if negative["Match type"] == "Negative exact" else f" {term} " in f" {query} "


def safe_ad_copy(text):
    assert not re.search(
        r"no court\b|no english required|no appointments?\b|success guaranteed|guaranteed win|"
        r"you don.t pay|no success fee|\bcs_(?:live|test)_|\b(?:email|session_id|case_id)=",
        text, re.I,
    ), f"Unreviewed claim or private identifier in copy: {text}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Refresh validation.json after local checks")
    parser.add_argument("--check-zip", action="store_true", help="Verify the original 15 entry names and exact bytes")
    parser.add_argument("--require-launch-ready", action="store_true", help="Fail closed while publication, measurement and spend gates remain open")
    args = parser.parse_args()
    assert not (args.write and args.check_zip), "Write the record, rebuild the ZIP, then check the ZIP separately"

    for name in ENTRIES:
        assert (PACK / name).is_file(), name
        if name.endswith(".json"):
            json.loads((PACK / name).read_text(encoding="utf-8"))
    settings = json.loads((PACK / "launch-settings.json").read_text(encoding="utf-8"))
    assert settings["state"] == "draft_paused_not_imported" and settings["spend_authorized"] is False
    assert settings["currency"] == "CAD" and settings["combined_average_daily_budget_cad"] == 100
    assert settings["fourteen_day_planning_amount_cad"] == 1400
    assert settings["fourteen_day_planning_amount_is_hard_cap"] is False
    account = settings["settings_to_verify_in_account"]
    assert account["network"] == "Google Search only" and account["language"] == "en"
    for key in ["search_partners", "display_network", "dynamic_keyword_insertion", "automated_text_or_keyword_expansion", "remarketing"]:
        assert account[key] is False, key
    assert account["positive_keyword_match_types"] == ["Exact", "Phrase"]
    assert account["location_option"] == "Presence: people in or regularly in targeted locations"

    policy = settings["fee_refund_policy"]
    assert policy["fee_paid_upfront"] is True and policy["refund_deadline_days"] == 30
    assert policy["trigger"] == "The Crown rejects Fabsy's efforts to reduce the original fine or demerits or obtain withdrawal, and none of those improvements is obtained"
    assert policy["refund_clock_starts"] == "When Fabsy receives the Crown's rejection of those negotiation efforts"
    assert policy["refund_amount"] == "Full service fee and GST actually paid, including the full bundled fee and GST after any Pro discount"
    assert policy["crown_negotiation_rejection_required"] is True and policy["no_improvement_obtained_required"] is True
    assert policy["payment_starts_refund_clock"] is False and policy["initial_or_unchanged_offer_starts_refund_clock"] is False
    assert policy["gst_paid_is_refunded"] is True
    for key in ["standalone_report_covered", "legal_outcome_guaranteed", "final_offer_required", "minimum_reduction_required", "client_must_accept_offer", "government_fines_covered"]:
        assert policy[key] is False, key
    assert policy["customer_claim_deadline"] is None and policy["publication_requires_matching_site_terms"] is True

    canonical_path = PACK.parents[2] / "src/config/feeRefund.json"
    canonical = json.loads(canonical_path.read_text(encoding="utf-8"))
    for token in ["Crown rejects Fabsy's efforts", "original fine or demerits", "withdraw your ticket", "none of those improvements is obtained", "within 30 days of receiving the rejection"]:
        assert token in canonical["condition"], token
    assert "Payment does not start the 30-day refund clock" in canonical["payment"]
    assert canonical["refundWindowDays"] == 30
    assert settings["copy_revision"] == "crown_negotiation_rejection_refund_20260831"
    correction = settings["timing_correction"]
    assert correction["state"] == "prepared_not_live" and correction["website_publication_verified"] is False
    assert correction["campaign_activation_authorized"] is False

    campaigns, groups, keywords, ads, negatives, assets = [rows(name) for name in ENTRIES[:6]]
    counts = dict(zip(
        ["campaigns", "ad_groups", "positive_keywords", "responsive_search_ads", "negative_keywords", "asset_worksheet_rows"],
        map(len, [campaigns, groups, keywords, ads, negatives, assets]),
    ))
    assert list(counts.values()) == [3, 6, 71, 6, 59, 12], counts
    expected_budgets = {item["campaign"]: Decimal(str(item["average_daily_budget_cad"])) for item in settings["locations"]}
    assert {row["Campaign"] for row in campaigns} == set(expected_budgets)
    assert sum(Decimal(row["Budget"]) for row in campaigns) == Decimal(100)
    for row in campaigns:
        assert row["Campaign status"] == "Paused" and row["Campaign type"] == "Search"
        assert row["Networks"] == "Google Search" and row["Languages"] == "en"
        assert row["Bid strategy type"] == "Maximize conversions"
        assert Decimal(row["Budget"]) == expected_budgets[row["Campaign"]]
    group_ids = {(row["Campaign"], row["Ad Group"]) for row in groups}
    assert len(group_ids) == 6 and all(row["Ad group status"] == "Paused" for row in groups)
    assert all(row["Campaign"] in expected_budgets for row in groups)
    assert all((row["Campaign"], row["Ad Group"]) in group_ids and row["Status"] == "Paused" for row in keywords + ads)
    seen_keywords = set()
    for row in keywords:
        identity = tuple(row[key] for key in ["Campaign", "Ad Group", "Keyword", "Match type"])
        assert identity not in seen_keywords, identity
        seen_keywords.add(identity)
        assert row["Match type"] in {"Exact", "Phrase"}
        assert 0 < len(row["Keyword"]) <= 80 and len(row["Keyword"].split()) <= 10
        assert not any(mark in row["Keyword"] for mark in ['[', ']', '"'])
        if "Calgary" in row["Campaign"]:
            assert "edmonton" not in row["Keyword"].lower()
        if "Edmonton" in row["Campaign"]:
            assert "calgary" not in row["Keyword"].lower()
    assert len({(row["Keyword"], row["Match type"]) for row in negatives}) == len(negatives)
    for negative in negatives:
        assert negative["Match type"] in {"Negative exact", "Negative phrase"}
        assert not any(blocks(row["Keyword"], negative) for row in keywords), negative
    for query in ["fight photo radar alberta", "red light camera ticket help", "class 1 ticket help", "commercial driver traffic ticket", "pointts alberta"]:
        assert any(blocks(query, negative) for negative in negatives), query
    for query in ["should i pay or fight my speeding ticket", "traffic ticket insurance renewal impact", "fight my alberta ticket"]:
        assert not any(blocks(query, negative) for negative in negatives), query

    assert Counter((row["Campaign"], row["Ad Group"]) for row in ads) == Counter({identity: 1 for identity in group_ids})
    for row in ads:
        assert row["Ad type"] == "Responsive search ad"
        assert row["Final URL"] == "https://fabsy.ca/rapid-resolution"
        assert row["Headline 1 position"] == "1" and row["Headline 2 position"] == "2" and row["Description 1 position"] == "1"
        assert row["Headline 1"] == "Ticket Reduced Or Fee Refunded"
        assert row["Headline 2"] == "Rapid Resolution: $198 + GST"
        for token in ["Crown rejects Fabsy's efforts", "no fine/demerit cut or withdrawal", "fee refund", "See terms"]:
            assert token in row["Description 1"], token
        for token in ["Pay upfront", "within 30 days of Fabsy receiving the rejection", "No outcome promise"]:
            assert token in row["Description 2"], token
        headlines = [row[f"Headline {i}"] for i in range(1, 16)]
        descriptions = [row[f"Description {i}"] for i in range(1, 5)]
        assert len(set(headlines)) == 15 and all(0 < len(item) <= 30 for item in headlines)
        assert len(set(descriptions)) == 4 and all(0 < len(item) <= 90 for item in descriptions)
        assert all(0 < len(row[key]) <= 15 for key in ["Path 1", "Path 2"])
        safe_ad_copy(" ".join(headlines + descriptions))
        assert "Fabsy Handles Court & Crown" in headlines
        assert "You approve any deal" in row["Description 3"] and "Trials and fines separate" in row["Description 3"]
        suffix = row["Final URL suffix"]
        assert not suffix.startswith("?") and set(re.findall(r"\{([^}]+)\}", suffix)) == {"adgroupid", "creative", "keyword"}
        query = parse_qs(suffix)
        assert set(query) == {"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"}
        assert query["utm_source"] == ["google"] and query["utm_medium"] == ["cpc"]
        assert query["utm_campaign"] == [row["Campaign"].lower()]

    assert Counter(row["Asset type"] for row in assets) == {"Sitelink": 4, "Callout": 8}
    for row in assets:
        assert row["State"] == "Draft - manual review" and 0 < len(row["Text"]) <= 25
        assert all(len(row[key]) <= 35 for key in ["Description 1", "Description 2"])
        safe_ad_copy(" ".join(row[key] for key in ["Text", "Description 1", "Description 2"]))
        if row["Asset type"] == "Sitelink":
            assert urlsplit(row["Final URL"]).hostname == "fabsy.ca" and row["Final URL"].startswith("https://")
    refund_link = next(row for row in assets if row["Text"] == "Service Fee Refund Terms")
    assert "Crown rejects our negotiations" in refund_link["Description 1"] and "Within 30 days of Fabsy's receipt" in refund_link["Description 2"]
    assert refund_link["Final URL"] == "https://fabsy.ca/terms-of-service"

    social = (PACK / "social-copy-drafts.md").read_text(encoding="utf-8")
    bodies = re.findall(r"^\*\*(?:Primary text|Body):\*\* (.+)$", social, re.M)
    assert len(bodies) == 5 and social.count("**Primary text:**") == 4 and social.count("**Body:**") == 1
    for body in bodies:
        assert body.startswith("Fine or demerits reduced—or your ") and "fee refunded" in body[:100]
        for token in ["upfront", "Crown rejects Fabsy's efforts", "original fine or demerits or withdraw your ticket", "none of those improvements is obtained", "within 30 days of receiving the Crown's rejection", "Payment does not start this clock", "initial or unchanged offer before that rejection does not trigger it", "No legal outcome is guaranteed", "See website for details"]:
            assert token in body, token
        safe_ad_copy(body)
        assert not re.search(r"within 30 days of (?:Fabsy )?receiving (?:that |the )?(?:Crown )?offer|if a Crown offer reduces|30 days (?:after|from) payment", body, re.I), "Stale offer/payment trigger"
    assert "full bundled service fee and GST actually paid" in bodies[2]
    assert "full bundled fee after any Pro discount" in bodies[3]
    for price in ["$198", "$229", "$158.40", "$183.20"]:
        assert price in social, price
    assert "Standalone report purchases and government fines are excluded" in social

    # Validate the dated documentation, without treating it as a new network check.
    for name in ["README.md", "measurement-readiness.md"]:
        document = (PACK / name).read_text(encoding="utf-8")
        for token in ["3a187b2d6f5fa72e9bb28a4fab55d45279bfce0e", "G-26G8CMWTKY", "AW-18419256057", "11/11", "not real paid-purchase ingestion", "website publication is still pending"]:
            assert token in document, (name, token)

    old = json.loads((PACK / "validation.json").read_text(encoding="utf-8"))
    history = old.get("historical_validation", old)
    report = {
        "checked_on": "2026-08-31",
        "result": "pass_local_file_checks_only",
        "status": "draft_valid_not_launch_ready",
        "launch_ready": False,
        "counts_scope": "Prepared files only; no live provider inventory queried",
        "counts": counts,
        "social_counts": {"older_meta_concepts": 4, "reddit_draft": 1},
        "max_rsa_headline_length": max(len(row[f"Headline {i}"]) for row in ads for i in range(1, 16)),
        "max_rsa_description_length": max(len(row[f"Description {i}"]) for row in ads for i in range(1, 5)),
        "checks": [
            "All serving entities paused; no spend authorized; 100 CAD proposed daily budget unchanged",
            "Search-only, English, exact/phrase and Alberta-presence controls retained",
            "No duplicate keyword/ad-group rows, opposite-metro keywords or literal negative conflicts",
            "15 unique headlines and 4 unique descriptions per RSA; 30/90/15 character limits",
            "Refund H1, price/GST H2 and Crown-rejected efforts with no reduction/withdrawal D1 pinned",
            "Upfront payment; 30 days from Fabsy receiving Crown rejection; payment and initial/unchanged offers do not start the clock",
            "Full actual service fee and GST, including full bundle after Pro discount; standalone report and fines excluded",
            "No extra final-offer, minimum-reduction, claim-deadline or plea-acceptance condition",
            "All four older Meta concepts and one Reddit draft lead with conditional fee refund",
            "Sitelink/callout 25 and description 35 character limits; supported static/ValueTrack suffixes",
            "UTF-8 CSV/JSON parse, exact row counts and pilot holdout negative checks",
        ],
        "copy_revision": {"id": settings["copy_revision"], "updated_on": "2026-08-31", "lead_message": "Ticket Reduced Or Fee Refunded", "fee_refund_policy": policy},
        "canonical_policy_source": {"file": "../../../src/config/feeRefund.json", "sha256": hashlib.sha256(canonical_path.read_bytes()).hexdigest()},
        "timing_correction": correction,
        "launch_blockers": ["Crown-rejection timing correction has not been published and verified on the website", "Actual paid-purchase ingestion and attribution remain unverified", "Advertising budget, test cap, campaign-goal approval and activation are not authorized"],
        "measurement_follow_up": {
            "recorded_on": "2026-08-31",
            "status": "production_google_activation_verified_paid_receipt_unverified",
            "source_commit": "3a187b2d6f5fa72e9bb28a4fab55d45279bfce0e",
            "receipt": "../2026-08-31-photo-radar/measurement-activation-receipt.json",
            "receipt_sha256": "762387c5e7ef006221c75827f8260496dee1e963e49d85f6c00fa41c1682a13b",
            "evidence_scope": "Historical owner release records, isolated real-Google request matrix and independent live Tag Assistant Page View/consent/boundary checks; not a new check or verification of this timing correction",
            "actual_paid_purchase_verified": False,
            "actual_paid_attribution_verified": False,
            "paid_actions": "Secondary, unchanged",
            "fee_refund_website_release_verified": False,
            "budget_and_test_cap_approved": False,
        },
        "not_verified": [
            "Crown-rejection timing correction in offer, terms, service authorization and checkout publication; actual refund processing",
            "Authenticated Editor import, pin mapping, rendered placements or ad-policy approval",
            "Actual paid purchase ingestion, matching and attribution; Page View/consent evidence does not prove these",
            "Current campaign policy, goal approval, approved budget and total advertising test cap",
            "Actual search demand, CPC, CAC, capacity, margin or campaign activation",
        ],
        "limitations": "Literal negative checks do not model semantic/close variants. Proposed budgets are not authorization or hard caps. No provider, website, payment or account action is performed by this validator.",
        "historical_validation": history,
        "asset_sha256": {name: hashlib.sha256((PACK / name).read_bytes()).hexdigest() for name in ENTRIES + ["validate.py"] if name != "validation.json"},
    }
    if args.write:
        (PACK / "validation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.check_zip:
        with zipfile.ZipFile(PACK / ARCHIVE) as archive:
            assert archive.namelist() == [PREFIX + name for name in ENTRIES], "ZIP entries/order changed"
            assert archive.testzip() is None, "ZIP CRC failure"
            for name in ENTRIES:
                assert archive.read(PREFIX + name) == (PACK / name).read_bytes(), f"Stale ZIP entry: {name}"
    print(json.dumps({key: report[key] for key in ["status", "launch_ready", "counts", "social_counts", "max_rsa_headline_length", "max_rsa_description_length"]}, indent=2))
    if args.check_zip:
        print("ZIP: exact original 15 entries; CRC and all payload bytes match.")
    return 1 if args.require_launch_ready else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, KeyError, ValueError, OSError, zipfile.BadZipFile) as error:
        print(f"Draft validation failed: {error}", file=sys.stderr)
        sys.exit(1)
