"""Extract the Gazelle group's roster and score history from its spreadsheet.

    python3 scripts/extract-gazelle-xlsx.py "Gazelle Handicaps - July 2026.xlsx" gazelle.json

The Gazelle sheet's layout differs from PMT's, so this cannot reuse
extract-handicaps-xlsx.py:

  * One sheet only, "Details". Columns A-F hold the handicap and stroking
    tables; the per-player blocks start at column H.
  * A block is any column where row 1 carries a name and row 2 reads "Scores".
    The block's running handicap sits one column right, on the first data row.
  * Blocks do NOT sit on a fixed stride — they run 8, 11, 14 ... 68 and then
    jump to 72, so every column is inspected rather than stepped over.
  * Scores run down the block's column, newest first. Blanks are skipped.
  * Non-integer scores are real data (rounds at other courses, adjusted by
    hand), so nothing is rounded.
  * There is no money column and no Order of Merit tab. Gazelle does not bet.

Checksum: for every block, mean(best 6 of last 12) must reproduce the block's
own handicap. That is the hard check. The name/handicap table in columns A-B is
a weaker cross-check -- it omits Imran and misspells "Kartk B'ram" -- so a
mismatch there is warned about, not fatal.
"""
import json
import sys

import openpyxl


def calc_handicap(scores):
    """Mean of the best 6 of the last 12 — mirrors calcHandicap()."""
    last12 = scores[:12]
    best = sorted(last12)[: min(6, len(last12))]
    return sum(best) / len(best)


def main(path, out_path):
    ws = openpyxl.load_workbook(path, data_only=True)["Details"]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    width = max(len(r) for r in rows)
    for r in rows:
        r.extend([None] * (width - len(r)))

    header, sub = rows[0], rows[1]

    # ---- per-player blocks -------------------------------------------------
    players, block_handicap, problems = [], {}, []
    for c in range(width):
        if sub[c] != "Scores" or not header[c]:
            continue
        name = str(header[c]).strip()
        scores = [r[c] for r in rows[2:] if isinstance(r[c], (int, float))]
        # The block's own handicap is in the "Handicap" column beside it, on the
        # first row that carries one.
        hcp = next(
            (r[c + 1] for r in rows[2:] if isinstance(r[c + 1], (int, float))), None
        ) if c + 1 < width else None
        if not scores:
            problems.append(f"{name}: block has no scores")
            continue
        if hcp is None:
            problems.append(f"{name}: block has no handicap")
            continue
        derived = calc_handicap(scores)
        if abs(derived - hcp) > 1e-6:
            problems.append(f"{name}: best-6-of-12 {derived:.6f} != block handicap {hcp:.6f}")
        players.append({"name": name, "scores": scores})
        block_handicap[name] = hcp

    # ---- the A/B name + handicap table (secondary, known-imperfect) ---------
    sheet_handicap = {}
    for r in rows[2:]:
        if r[0] and isinstance(r[1], (int, float)):
            sheet_handicap[str(r[0]).strip()] = r[1]
        elif r[0] and "Formula" in str(r[0]):
            break

    for name, hcp in block_handicap.items():
        listed = sheet_handicap.get(name)
        if listed is None:
            print(f"  ! {name}: not in the A/B handicap table (block handicap {hcp:.3f})")
        elif abs(listed - hcp) > 1e-6:
            print(f"  ! {name}: A/B table says {listed:.3f}, block says {hcp:.3f}")

    print(f"\nparsed {len(players)} blocks, {sum(len(p['scores']) for p in players)} scores")
    for p in players:
        print(f"  {p['name']:16s} {len(p['scores']):4d} scores   hcp {block_handicap[p['name']]:.3f}")

    if problems:
        print("\nVALIDATION FAILED — nothing written:")
        for m in problems:
            print("  ✗ " + m)
        sys.exit(1)
    print("\n✓ every block's handicap reconciles with its own scores")

    json.dump(
        {"source": path, "players": players, "blockHandicap": block_handicap,
         "sheetHandicap": sheet_handicap},
        open(out_path, "w"),
        indent=2,
    )
    print(f"wrote {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: extract-gazelle-xlsx.py <xlsx> <out.json>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
