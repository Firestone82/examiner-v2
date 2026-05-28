#!/usr/bin/env python3
"""Merge multiple wheel DLC progress exports into one.

Each input is a single-DLC progress export (filetype "examiner-dlc-data")
produced by the per-DLC export button in the app. When several people
rated the same DLC on different machines, this script joins their
exports so every member's votes end up in one bundle. On overlaps
(same member rated the same question in multiple files) the higher
star rating wins.

Usage:
    python merge_wheel_exports.py out.json in1.json in2.json [in3.json ...]
"""

import json
import sys
from datetime import datetime, timezone


def merge_member_scores(target, incoming):
    # { qid: { memberId: stars } } — union of voters, max on overlap.
    for qid, voters in incoming.items():
        bucket = target.setdefault(qid, {})
        for member_id, stars in voters.items():
            if stars is None:
                continue
            current = bucket.get(member_id, 0) or 0
            if stars > current:
                bucket[member_id] = stars


def merge_scores(target, incoming):
    # { qid: stars } self-ratings — keep the higher one.
    for qid, stars in incoming.items():
        if stars is None:
            continue
        current = target.get(qid, 0) or 0
        if stars > current:
            target[qid] = stars


def merge_members(target, incoming):
    # Roster list; dedupe by id, preserving first-seen order.
    if not isinstance(incoming, list):
        return
    seen = {m.get('id') for m in target if isinstance(m, dict)}
    for m in incoming:
        if not isinstance(m, dict):
            continue
        mid = m.get('id')
        if mid in seen:
            continue
        seen.add(mid)
        target.append(m)


def main():
    if len(sys.argv) < 4:
        print(__doc__.strip())
        sys.exit(1)

    out_path = sys.argv[1]
    in_paths = sys.argv[2:]

    merged_member_scores = {}
    merged_scores = {}
    merged_members = []
    dlc_name = None
    base_payload = None
    base_bundle = None

    for path in in_paths:
        with open(path, 'r', encoding='utf-8') as f:
            payload = json.load(f)

        if payload.get('filetype') != 'examiner-dlc-data':
            print(f"Warning: {path} is not an examiner-dlc-data export, skipping.")
            continue

        name = payload.get('dlcName')
        if dlc_name is None:
            dlc_name = name
            base_payload = payload
            base_bundle = dict(payload.get('data') or {})
        elif name != dlc_name:
            print(f"Error: {path} is for DLC '{name}', expected '{dlc_name}'.")
            sys.exit(2)

        bundle = payload.get('data') or {}
        merge_member_scores(merged_member_scores, bundle.get('memberScores') or {})
        merge_scores(merged_scores, bundle.get('scores') or {})
        merge_members(merged_members, bundle.get('wheelMembers') or [])

    if base_payload is None:
        print("Error: no valid inputs.")
        sys.exit(2)

    out_bundle = base_bundle
    out_bundle['memberScores'] = merged_member_scores
    out_bundle['scores'] = merged_scores
    if merged_members:
        out_bundle['wheelMembers'] = merged_members
    # The in-progress prompter session is per-device; drop it on merge.
    out_bundle.pop('session', None)

    out_payload = {
        'filetype': 'examiner-dlc-data',
        'version': base_payload.get('version', '1.0'),
        'exportDate': datetime.now(timezone.utc).isoformat(),
        'dlcName': dlc_name,
        'data': out_bundle,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out_payload, f, indent=2)

    voter_count = len({mid for q in merged_member_scores.values() for mid in q})
    print(f"Merged {len(in_paths)} export(s) for '{dlc_name}': "
          f"{len(merged_member_scores)} question(s), {voter_count} voter(s) "
          f"-> {out_path}")


if __name__ == '__main__':
    main()
