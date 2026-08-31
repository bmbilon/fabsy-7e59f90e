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
ARCHIVED_PROVIDER_SOURCE_SHA256 = "a1e6417339ea3b73aa9cda13dd73d3a4b111d946b316f57393749a54f0c7ccff"
ACTIVATION_RECEIPT_SHA256 = "762387c5e7ef006221c75827f8260496dee1e963e49d85f6c00fa41c1682a13b"


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


def provider_table(record, heading):
    marker = f"## {heading}\n"
    assert marker in record, f"Provider receipt section missing: {heading}"
    section = record.split(marker, 1)[1].split("\n## ", 1)[0]
    result = {}
    for line in section.splitlines():
        if line.startswith("| "):
            columns = [cell.strip().replace("`", "").replace("**", "") for cell in line.strip("|").split("|")]
            if len(columns) == 2:
                result[columns[0]] = columns[1]
    return result


def check_provider_receipt(settings, record_path=None):
    """Check archived metadata; optionally verify its private/local source in place."""
    provider = settings["provider_receipt"]
    assert provider["source"] == "../2026-08-30/google-ads-account-setup.md"
    record = None
    if record_path is not None:
        record_bytes = record_path.read_bytes()
        assert hashlib.sha256(record_bytes).hexdigest() == ARCHIVED_PROVIDER_SOURCE_SHA256, "Private provider record SHA-256 does not match the archived source"
        record = record_bytes.decode("utf-8")
    assert provider["observed_on"] == "2026-08-31"
    assert provider["configuration_receipt_only"] is True
    assert provider["customer_id"] == "938-501-7797"
    assert record is None or provider["customer_id"] in record
    assert provider["account_status"] == "Active" and provider["billing_tax_status"] == "Accepted"
    assert provider["currency"] == "CAD"
    assert provider["advertiser_identity"] == {"status": "Verified", "name": "EXECOM INC.", "country": "CA"}
    assert record is None or "Advertiser identity verified for EXECOM INC., Canada" in record
    assert record is None or "advertiser **EXECOM INC.**, location **CA**" in record
    assert provider["saved_purchase_action_count"] == 2
    assert provider["saved_secondary_purchase_action_count"] == 2
    assert provider["saved_primary_purchase_action_count"] == 0
    assert provider["campaign_count"] == 0 and provider["ad_spend_cad"] == 0
    assert record is None or "both Secondary, with zero Primary actions and zero campaigns" in record
    assert provider["tag_detection"] == "No tag found for this account"
    assert record is None or provider["tag_detection"] in record
    assert provider["separate_account_owner_checked_saved_inventory_and_details"] is True

    # Preserve every internal contract check when the private record is absent.
    # These are archived table values, not a fresh query or a supplied-file check.
    photo = {
        "Conversion name": "Fabsy paid Photo Radar",
        "Conversion type ID": "7740881425",
        "Google Ads destination": "AW-18419256057",
        "Photo Radar purchase label": "TEo-CJH0kescEPmV_s5E",
        "Category / source": "Purchase / Website, manually with code",
        "Action optimization": "Secondary action not used for bidding optimization",
        "Value": "Dynamic, CAD; fallback CA$0 if omitted",
        "Count": "Every conversion",
        "Click / engaged-view / view windows": "90 days / 3 days / 1 day",
        "Attribution": "Data-driven, Google paid channels",
        "Enhanced conversions": "Not configured",
        "Observed tracking status": "Awaiting conversions",
    }
    rr = {
        "Purchase label": "MyAbCPiLj-scEPmV_s5E",
        "Action optimization": "Secondary action not used for bidding optimization",
    }
    if record is not None:
        photo = provider_table(record, "Photo Radar purchase conversion — separate action and label")
        rr = provider_table(record, "Rapid Resolution purchase conversion — website receipt not validated")
    measurement = settings["measurement"]
    assert measurement["conversion_name"] == photo["Conversion name"] == "Fabsy paid Photo Radar"
    assert measurement["platform_action_id"] == photo["Conversion type ID"] == "7740881425"
    assert measurement["platform_action_id_kind"] == "Google Ads conversion type ID"
    assert measurement["google_ads_destination"] == photo["Google Ads destination"] == "AW-18419256057"
    assert measurement["platform_action_label"] == photo["Photo Radar purchase label"] == "TEo-CJH0kescEPmV_s5E"
    assert provider["existing_rapid_resolution_label"] == rr["Purchase label"] == "MyAbCPiLj-scEPmV_s5E"
    assert measurement["platform_action_label"] != provider["existing_rapid_resolution_label"]
    assert measurement["send_to"] == "AW-18419256057/TEo-CJH0kescEPmV_s5E"
    assert measurement["send_to"] == f'{measurement["google_ads_destination"]}/{measurement["platform_action_label"]}'
    assert record is None or measurement["send_to"] in record
    assert measurement["implementation_inputs"] == {
        "VITE_GADS_ID": "AW-18419256057",
        "VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL": "TEo-CJH0kescEPmV_s5E",
    }
    assert measurement["category"] == "Purchase" and measurement["website_source"] == "Website, manually with code"
    assert photo["Category / source"] == "Purchase / Website, manually with code"
    assert measurement["state"] == "saved_secondary_production_receipt_unverified"
    assert measurement["action_optimization"] == "Secondary" and measurement["created_directly_as_secondary"] is True
    assert photo["Action optimization"] == rr["Action optimization"] == "Secondary action not used for bidding optimization"
    assert measurement["source_choice"] == "Direct Google Ads website paid purchase using the saved Photo Radar action; no duplicate GA4 purchase import"
    assert measurement["saved_value_mode"] == "Dynamic" and measurement["saved_fallback_value_cad"] == 0
    assert photo["Value"] == "Dynamic, CAD; fallback CA$0 if omitted"
    assert measurement["count"] == "Every" and photo["Count"] == "Every conversion"
    assert measurement["click_through_window_days"] == 90
    assert measurement["engaged_view_window_days"] == 3 and measurement["view_through_window_days"] == 1
    assert photo["Click / engaged-view / view windows"] == "90 days / 3 days / 1 day"
    assert measurement["attribution_model"] == "Data-driven" and measurement["attribution_channels"] == "Google paid channels"
    assert photo["Attribution"] == "Data-driven, Google paid channels"
    assert measurement["enhanced_conversions_status"] == photo["Enhanced conversions"] == "Not configured"
    assert measurement["tracking_status"] == photo["Observed tracking status"] == "Awaiting conversions"
    for key in ["production_configuration_verified", "production_paid_receipt_verified", "production_attribution_verified"]:
        assert measurement[key] is False, f"Provider setup is not production evidence: {key}"
    assert settings["files_are_not_proof_of_live_delivery_or_campaign_readiness"] is True
    release = settings["release_owner_report"]
    assert release["reported_on"] == "2026-08-31"
    assert release["google_ads_id_in_github_secrets"] is True and release["photo_radar_label_in_github_secrets"] is True
    assert release["photo_radar_label_ci_build_environment_count"] == 2
    assert release["full_build_and_deployment_verified"] is False and release["production_paid_receipt_verified"] is False
    assert "existing Google pixel setup authorization" in release["rapid_resolution_build_configuration"]
    return ARCHIVED_PROVIDER_SOURCE_SHA256


def check_measurement_activation(settings):
    """Check the shareable activation summary, without replaying private evidence."""
    receipt_path = ASSETS / "measurement-activation-receipt.json"
    receipt_bytes = receipt_path.read_bytes()
    assert hashlib.sha256(receipt_bytes).hexdigest() == ACTIVATION_RECEIPT_SHA256, "Measurement activation summary SHA-256 mismatch"
    receipt = json.loads(receipt_bytes)
    assert receipt["recorded_on"] == "2026-08-31"
    assert receipt["status"] == "production_google_activation_verified_paid_receipt_unverified"
    publication = receipt["publication"]
    assert publication["source_commit"] == "3a187b2d6f5fa72e9bb28a4fab55d45279bfce0e"
    assert publication["generated_main_commit"] == "cd5eef208e4ade776e4a947278dbad29edae77f0"
    assert publication["pages_deployment_id"] == "fa1d2d1a-e7d2-47ef-98c5-3a3fdd6af739"
    assert publication["pages_deployment_url"] == "https://fa1d2d1a.fabsy-9qa.pages.dev"
    assert {run["run_id"] for run in publication["ci"]} == {33397537321, 33397537324, 33397537305}
    assert all(run["conclusion"] == "success" and run["source_commit"] == publication["source_commit"] for run in publication["ci"])
    measurement = receipt["measurement"]
    assert measurement["ga4_id"] == "G-26G8CMWTKY"
    assert measurement["ads_id"] == settings["measurement"]["google_ads_destination"]
    assert measurement["photo_radar_label"] == settings["measurement"]["platform_action_label"]
    assert measurement["rapid_resolution_label"] == settings["provider_receipt"]["existing_rapid_resolution_label"]
    assert measurement["production_build_gate_enabled"] is True and measurement["explicit_consent_required"] is True
    assert measurement["consent_defaults"] == {key: "denied" for key in ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]}
    assert measurement["consent_after_opt_in"] == {
        "ad_storage": "granted", "analytics_storage": "granted", "ad_user_data": "granted", "ad_personalization": "denied",
    }
    assert measurement["private_intake_untagged_observed"] is True
    assert measurement["paid_actions"] == "Secondary, unchanged" and measurement["primary_action_change"] is False
    capture = receipt["verification"]["real_google_request_capture"]
    assert capture["context"] == "Isolated pre-release harness against real configured Google properties; not production-browser request capture"
    assert capture["checks"] == capture["passed"] == 11 and capture["failures"] == 0
    live = receipt["verification"]["independent_live_tag_assistant"]
    assert live["connected"] is True and live["observed_hit"] == "GA4 Page View"
    assert live["observed_tags"] == ["G-26G8CMWTKY / GT-WFFLZ6X8", "AW-18419256057"]
    assert live["consent_table_confirmed"] is True and live["public_destinations_restored_on_return"] is True
    assert live["private_intake_google_scripts"] == 0 and live["private_intake_referrer"] == ""
    cleanup = receipt["cleanup"]
    for key in ["tag_assistant_stopped", "measurement_permission_withdrawn", "clean_home_reload", "tag_assistant_tab_closed"]:
        assert cleanup[key] is True, key
    assert cleanup["google_script_elements_after_withdrawal"] == 0 and cleanup["document_referrer_after_withdrawal"] == ""
    gates = receipt["remaining_gates"]
    for key in ["actual_paid_purchase_receipt_verified", "actual_paid_attribution_verified", "fee_refund_website_release_verified", "advertising_budget_approved", "total_advertising_test_cap_approved", "campaign_activation_authorized"]:
        assert gates[key] is False, key
    assert gates["fee_refund_capture_guard_validation_reported_passed"] is True
    assert gates["fee_refund_website_status"] == "Website publication pending; release owner reports capture-guard validation passed before this handoff"
    assert "The existing Cloudflare beacon is unchanged; this is not a claim about every analytics service." in receipt["limitations"]
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-launch-ready", action="store_true")
    parser.add_argument(
        "--provider-record",
        type=Path,
        help="Optional private/local setup record, excluded from this repository; verifies the archived SHA-256 and contents. Omitted: check archived metadata only.",
    )
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
    provider_record_sha256 = check_provider_receipt(settings, args.provider_record)
    activation = check_measurement_activation(settings)
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
    assert measurement["count"] == "Every"
    assert "Stripe Checkout session ID as transaction_id" in measurement["deduplication"]
    assert "No live card charge is authorized or required" in measurement["safe_validation_methods"]
    economics = settings["economics"]
    assert economics["scale_when_mature_new_customer_cac_cad_below"] == 35
    assert economics["cut_when_mature_new_customer_cac_cad_at_or_above"] == 55
    assert economics["contribution_is_measured"] is False
    assert economics["zero_conversion_stop_loss_cad"] is None and economics["zero_conversion_stop_loss_requires_approval"] is True
    assert economics["evaluation_window"] is None and measurement["reporting_lag_observed"] is None
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
        assert row["Headline 1"] == "Fine Reduced Or Fee Refunded"
        assert row["Headline 2"] == "$79 + GST. No Hidden Fees"
        for token in ["Alberta owner camera notices", "Crown offer", "no cut to original fine", "Fee refund", "See terms"]:
            assert token in row["Description 1"], (context, token)
        for token in ["Pay upfront", "within 30 days of Fabsy receiving the offer", "No legal outcome promise"]:
            assert token in row["Description 2"], (context, token)
        headlines = [row[f"Headline {i}"] for i in range(1, 16)]
        descriptions = [row[f"Description {i}"] for i in range(1, 5)]
        assert len(set(headlines)) == 15 and all(0 < len(text) <= 30 for text in headlines), context
        assert len(set(descriptions)) == 4 and all(0 < len(text) <= 90 for text in descriptions), context
        assert all(0 < len(row[key]) <= 15 for key in ["Path 1", "Path 2"])
        for text in headlines + descriptions:
            check_copy(text, context)
        combined = " ".join(descriptions).lower()
        for token in ["owner camera notices", "no demerits", "insurance impact", "no trial", "fines separate", "not-guilty plea", "request disclosure", "you approve any deal"]:
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
        assert variant["headline"] == "Fine reduced—or your fee refunded"
        for field in ["headline", "description", "primary_text"]:
            check_copy(variant[field], variant["id"])
        assert "$79" in variant["primary_text"][:125] and "GST" in variant["primary_text"][:125]
        body = variant["primary_text"].lower()
        for token in ["alberta", "owner", "$82.95 total", "no demerits", "insurance impact", "no trial", "no outcome is promised", "you approve any deal"]:
            assert token in body, (variant["id"], token)
        for token in ["fine reduced—or your fee refunded", "upfront", "no hidden fees", "if fabsy receives a crown offer that does not reduce your original fine", "refunds the actual service fee within 30 days of receiving that offer", "see terms", "not-guilty plea", "request disclosure", "government fines are separate"]:
            assert token in body, (variant["id"], token)
        assert parse_qs(variant["url_parameters"])["utm_source"] == ["meta"]
        assert "{" not in variant["url_parameters"] and "}" not in variant["url_parameters"]

    # This earlier raw-HTML observation remains historical, not current tag evidence.
    assert audit["production_destination_verified"] is False
    assert audit["browser_checkout_verified"] is False
    blockers = [
        "No concrete approved daily advertising budget, total ad-spend test cap, dates, stop-loss or campaign activation; campaign CSV Budget is intentionally blank.",
        "The fee-refund website publication is pending; capture-guard validation has passed per the release owner. The matching Photo Radar destination, terms and checkout still require publication review.",
        "Google measurement activation and a live Page View are verified in the recorded evidence. Actual paid Photo Radar receipt, CAD 79 excluding-GST value, deduplication and attribution remain unverified.",
        "Targeting, inherited negatives, assets, claims, policy, privacy and evaluation settings need account review.",
        "Both saved purchase actions remain Secondary. Receipt validation and explicit campaign-goal approval are required before promotion or activation.",
    ]
    report = {
        "status": "draft_valid_not_launch_ready",
        "launch_ready": False,
        "current_measurement_status": activation["status"],
        "counts_scope": "Prepared draft assets, not live provider inventory",
        "counts": {"campaigns": len(campaigns), "ad_groups": len(groups), "keywords": len(keywords), "rsa": len(ads), "negative_keywords": len(negatives), "meta_variants": len(meta["variants"])},
        "max_rsa_headline_length": max(len(row[f"Headline {i}"]) for row in ads for i in range(1, 16)),
        "max_rsa_description_length": max(len(row[f"Description {i}"]) for row in ads for i in range(1, 5)),
        "checks": ["All draft entities with a status are paused", "No assigned or authorized advertising spend; total_budget_cad is the ad-spend test cap", "Account identity and exact Photo Radar destination/label match archived provider metadata; an optional private record must match its archived SHA-256 and contents", "Historical provider inventory retains two Secondary purchase actions, zero Primary actions and zero campaigns; activation did not change paid-action optimization or campaigns", "Dynamic CAD fallback 0, Every, 90/3/1-day windows and Data-driven Google paid channels preserved", "Historical no-tag/deployment-pending observations are preserved; the separate activation summary supplies current measurement evidence", "Activation summary SHA-256, publication commits/deployment and three successful CI runs checked", "Isolated pre-release real-Google 11/11 capture is distinguished from independent live Tag Assistant Page View/DOM evidence", "Google explicit-consent defaults/opt-in, private-intake exclusion and completed withdrawal/Tag Assistant cleanup preserved", "Actual paid receipt, attribution, fee-refund publication and advertising approvals remain open", "Authorized test-mode/synthetic/debug checks are distinguished from actual paid-customer evidence; no live charge required", "Canonical CAD 79 / GST 3.95 / total 82.95", "RSA copy limits and mandatory refund/price/condition pins", "Upfront fee and original-fine Crown-offer refund within 30 days of Fabsy receiving the offer; no legal outcome promise", "Exact/Phrase pairs and all four camera-notice families", "No blanket holdout negatives or literal positive-negative conflicts", "Alberta presence and restricted network settings", "Meta tax/scope/approval/outcome qualifications", "Paid purchase value and CAC/reduction threshold contract"],
        "limitations": ["Without --provider-record, archived provider metadata is checked but the private/local source file is neither required nor read; its recorded SHA-256 is retained as historical evidence", "The activation summary and its hash are checked offline; this validator does not replay the local release records, browser checks or live provider observations", "Production Tag Assistant observed a Page View, not a Purchase; the 11/11 network capture was an isolated pre-release harness, not production-browser request capture", "The existing Cloudflare beacon is unchanged; the Google consent checks do not establish behavior of every analytics service", "Offline content checks do not validate Ads Editor import, account policy approval, actual matching or current production behavior", "Literal negative matching does not model every Google close variant", "This validator intentionally validates a paused draft, not authorization to launch"],
        "historical_evidence_scope": "provider_configuration_receipt, release_owner_report and destination-audit.json preserve their earlier observations. The activation summary supersedes no-tag/deployment-pending status only; it is not paid-purchase evidence.",
        "provider_record_validation": {
            "mode": "private_source_verified_against_archive" if args.provider_record is not None else "archived_metadata_only",
            "private_record_supplied": args.provider_record is not None,
            "source_hash_verified_this_run": args.provider_record is not None,
            "source_sha256": provider_record_sha256,
            "source_storage": "Private/local evidence, excluded from this repository",
        },
        "provider_configuration_receipt": {
            **settings["provider_receipt"],
            "source_sha256": provider_record_sha256,
            "photo_radar_action": {key: measurement[key] for key in ["conversion_name", "platform_action_id", "platform_action_id_kind", "google_ads_destination", "platform_action_label", "send_to", "action_optimization", "created_directly_as_secondary", "saved_value_mode", "saved_fallback_value_cad", "currency", "count", "click_through_window_days", "engaged_view_window_days", "view_through_window_days", "attribution_model", "attribution_channels", "enhanced_conversions_status", "tracking_status", "production_configuration_verified", "production_paid_receipt_verified", "production_attribution_verified"]},
        },
        "release_owner_report": settings["release_owner_report"],
        "measurement_activation_receipt": {
            "source": "measurement-activation-receipt.json",
            "source_sha256": ACTIVATION_RECEIPT_SHA256,
            **activation,
        },
        "launch_blockers": blockers,
        "asset_sha256": {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(ASSETS.iterdir()) if file.is_file() and file.name != "validation.json"},
    }
    (ASSETS / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ["status", "current_measurement_status", "provider_record_validation", "counts", "max_rsa_headline_length", "max_rsa_description_length", "launch_blockers"]}, indent=2))
    return 1 if args.require_launch_ready else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, KeyError, ValueError, OSError) as error:
        print(f"Draft validation failed: {error}", file=sys.stderr)
        sys.exit(1)
