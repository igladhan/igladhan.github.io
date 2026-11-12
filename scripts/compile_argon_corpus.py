#!/usr/bin/env python3
"""
Argon Archival Compiler & Validator
Merges all regional JSON shards in data/shards/, validates canonical taxonomy,
normalizes Wikimedia Commons filenames, computes deterministic MediaWiki MD5
asset URLs, deduplicates entries, and emits data/depictions.json + data/depictions.js.
"""

import glob
import hashlib
import json
import os
import urllib.parse
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARDS_DIR = os.path.join(ROOT, "data", "shards")
OUT_JSON = os.path.join(ROOT, "data", "depictions.json")
OUT_JS = os.path.join(ROOT, "data", "depictions.js")

CANONICAL_REGIONS = {
    "Ancient Near East & Persia",
    "Egypt & Africa",
    "Greece & Aegean",
    "Etruria, Rome & Byzantium",
    "Medieval, Celtic & Norse Europe",
    "Renaissance & Early Modern Europe",
    "East Asia & Eurasian Steppe",
    "South & Southeast Asia",
    "The Americas & Oceania",
}

CANONICAL_ERAS = {
    "Prehistory & Bronze Age",
    "Iron Age & Classical Antiquity",
    "Post-Classical & Medieval",
    "Renaissance & Early Modern",
    "Enlightenment & 19th Century",
}

CANONICAL_MEDIUMS = {
    "Sculpture & Relief",
    "Ceramics & Vessels",
    "Manuscript & Print",
    "Painting & Fresco",
    "Mosaic & Glazed Brick",
    "Textile & Tapestry",
    "Metalwork, Glyptic & Regalia",
}

CANONICAL_MORPHOLOGIES = {
    "Draconic & Serpentine",
    "Avian & Winged Hybrids",
    "Therianthropic (Human-Beast)",
    "Composite Chimeras",
    "Single-Horned & Sacred Beasts",
    "Marine & Abyssal Monsters",
    "Giants, Demons & Spirits",
}

VALID_EXTENSIONS = (".jpg", ".jpeg", ".png")


def infer_era(year_sort: int) -> str:
    if year_sort <= -1200:
        return "Prehistory & Bronze Age"
    if year_sort <= 499:
        return "Iron Age & Classical Antiquity"
    if year_sort <= 1399:
        return "Post-Classical & Medieval"
    if year_sort <= 1749:
        return "Renaissance & Early Modern"
    return "Enlightenment & 19th Century"


def normalize_commons_filename(commons_file: str, commons_url: str) -> str:
    raw = ""
    if commons_url and "/wiki/File:" in commons_url:
        raw = commons_url.split("/wiki/File:", 1)[1].split("#", 1)[0].split("?", 1)[0]
    elif commons_file:
        raw = commons_file
    raw = urllib.parse.unquote(raw).strip()
    if raw.lower().startswith("file:"):
        raw = raw[5:].strip()
    # Unquote a second time in case double-encoded in snippet
    raw = urllib.parse.unquote(raw).strip()
    raw = raw.replace(" ", "_")
    if not raw:
        return ""
    return raw[0].upper() + raw[1:]


def classify_creature_family(rec: dict) -> str:
    blob = f"{rec.get('creature', '')} {rec.get('title', '')} {rec.get('localName', '')}".lower()
    morph = rec.get("morphology", "")

    if any(k in blob for k in ("sphinx", "androsphinx", "criosphinx")):
        return "Sphinxes (Androsphinx, Criosphinx & Winged Sphinx)"
    if any(k in blob for k in ("griffin", "gryphon", "homa", "leogryph")):
        return "Griffins & Eagle-Lion Hybrids"
    if any(k in blob for k in ("unicorn", "monoceros", "qilin", "kirin", "haetae", "haechi", "indus unicorn", "yale", "karg", "ci wara", "chiwara")):
        return "Unicorns, Qilin & Sacred Horned Beasts"
    if any(k in blob for k in ("medusa", "gorgon", "taotie", "kirtimukha", "kala", "humbaba", "gwimyeon", "dokkaebi", "bes")):
        return "Gorgons, Taotie, Kirtimukha & Apotropaic Faces"
    if any(k in blob for k in ("centaur", "satyr", "silenus", "faun", "pan ", "hippogriff", "pegasus", "sleipnir", "winged horse", "onokentauros")):
        return "Centaurs, Pegasus, Satyrs & Equine Hybrids"
    if any(k in blob for k in ("siren", "harpy", "kinnar", "inmyeonjo", "birdman", "tangata manu", "caladrius")):
        return "Sirens, Harpies, Kinnara & Avian-Humans"
    if any(k in blob for k in ("phoenix", "fenghuang", "bonghwang", "hō-ō", "ho-o", "simurgh", "senmurv", "garuda", "anzû", "anzu", "imdugud", "bennu", "thunderbird", "zhuque", "jujak", "gandaberunda", "jinwu")):
        return "Phoenix, Simurgh, Garuda & Solar Birds"
    if any(k in blob for k in ("lamassu", "apkallu", "buraq", "cherub", "kirubel", "shedu")):
        return "Lamassu, Apkallu, Buraq & Winged Threshold Spirits"
    if any(k in blob for k in ("cerberus", "hydra", "amphisbaena", "double-headed serpent", "sisiutl", "nine-headed")):
        return "Cerberus, Hydra & Multi-Headed Beasts"
    if any(k in blob for k in ("makara", "cetus", "ketos", "kraken", "octopus", "polypus", "hippocamp", "scylla", "triton", "ningyo", "amabie", "melusine", "mélusine", "marakihau", "aspidochelone", "sea monster", "sea monk", "sea bishop", "sea serpent", "orca", "killer whale", "mudfish", "shachihoko", "namazu", "capricorn", "mishipeshu", "underwater panther", "sea bear")):
        return "Leviathans, Makaras, Kraken & Abyssal Merfolk"
    if any(k in blob for k in ("dragon", "zhulong", "long", "wyvern", "fafnir", "jörmungandr", "jormungandr", "níðhöggr", "nidhoggr", "mušḫuššu", "mushhushshu", "sirrush", "quetzalcoatl", "feathered serpent", "xiuhcoatl", "vision serpent", "nāga", "naga", "apep", "apophis", "rainbow serpent", "qinglong", "cheongnyong", "rồng", "yong", "eoryong", "unryong", "xuanwu", "hyeonmu", "glycon", "kiyohime", "bansonyi", "basilisk", "cockatrice", "rattlesnake")):
        return "Dragons, Feathered Serpents, Nāgas & Cosmic Wyrms"
    if any(k in blob for k in ("shishi", "komainu", "chinthe", "yali", "vyala", "snow lion", "sengge", "barong", "nghê", "bixie", "lupa", "capitoline wolf", "baihu", "baekho")):
        return "Sacred Guardian Lions, Bixie, Yali & Tigers"
    if any(k in blob for k in ("minotaur", "löwenmensch", "were-jaguar", "narasimha", "apedemak", "therianthrope", "blemmye", "wild man", "wild men", "bat-man", "bat god", "camazotz", "cynocephal")):
        return "Minotaur, Were-Jaguars & Therianthropes"
    if any(k in blob for k in ("chimera", "ammit", "taweret", "manticore", "nue", "baku", "navagunjara", "sharabha", "tarasque", "ahuizotl", "cipactli", "bonnacon", "serpopard", "kponyugo", "tupilaq", "zhenmushou", "kamadhenu", "pictish beast", "manaia")):
        return "Chimeras, Ammit, Manticores & Composite Hybrids"
    if any(k in blob for k in ("kitsune", "tamamo", "fox", "jiuweihu", "tengu", "kappa", "nekomata", "tsukumogami", "gashadokuro", "skeleton", "tsuchigumo")):
        return "Kitsune, Tengu, Kappa & Yōkai Metamorphs"
    if any(k in blob for k in ("cyclops", "polyphemus", "oni", "tentōki", "yaksha", "thotsakan", "div", "dev", "pazuzu", "lamashtu", "charun", "vanth", "tuchulcha", "typhon", "alkyoneus", "orcus", "xingtian", "fūjin", "raijin", "ai apaec", "mimi", "devil")):
        return "Cyclopes, Oni, Divs, Giants & Underworld Demons"

    if morph == "Draconic & Serpentine":
        return "Dragons, Feathered Serpents, Nāgas & Cosmic Wyrms"
    if morph == "Avian & Winged Hybrids":
        return "Phoenix, Simurgh, Garuda & Solar Birds"
    if morph == "Marine & Abyssal Monsters":
        return "Leviathans, Makaras, Kraken & Abyssal Merfolk"
    if morph == "Single-Horned & Sacred Beasts":
        return "Unicorns, Qilin & Sacred Horned Beasts"
    if morph == "Giants, Demons & Spirits":
        return "Cyclopes, Oni, Divs, Giants & Underworld Demons"
    if morph == "Therianthropic (Human-Beast)":
        return "Minotaur, Were-Jaguars & Therianthropes"
    return "Chimeras, Ammit, Manticores & Composite Hybrids"


def build_wikimedia_urls(norm_filename: str) -> dict:
    md5_hex = hashlib.md5(norm_filename.encode("utf-8")).hexdigest()
    quoted = urllib.parse.quote(norm_filename, safe="(),!-_.'~*")
    return {
        "commonsFile": norm_filename,
        "commonsUrl": f"https://commons.wikimedia.org/wiki/File:{quoted}",
        "thumbUrl": f"https://commons.wikimedia.org/wiki/Special:FilePath/{quoted}?width=640",
        "fullImageUrl": f"https://upload.wikimedia.org/wikipedia/commons/{md5_hex[0]}/{md5_hex[:2]}/{quoted}",
    }


def main() -> None:
    shard_paths = sorted(glob.glob(os.path.join(SHARDS_DIR, "*.json")))
    if not shard_paths:
        raise SystemExit("No shard files found in data/shards/")

    compiled = []
    seen_files = set()
    seen_ids = set()
    skipped = []

    for path in shard_paths:
        shard_name = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as f:
            records = json.load(f)
        if not isinstance(records, list):
            raise ValueError(f"{shard_name} root must be a JSON array")

        for idx, rec in enumerate(records):
            norm_file = normalize_commons_filename(
                rec.get("commonsFile", ""),
                rec.get("commonsUrl", ""),
            )
            if not norm_file or not norm_file.lower().endswith(VALID_EXTENSIONS):
                skipped.append((shard_name, rec.get("id"), f"Invalid extension or missing file: {norm_file}"))
                continue

            if norm_file.lower() in seen_files:
                skipped.append((shard_name, rec.get("id"), f"Duplicate commonsFile: {norm_file}"))
                continue

            item_id = str(rec.get("id") or f"{shard_name[:-5]}-{idx+1:02d}").strip()
            if item_id in seen_ids:
                item_id = f"{item_id}-{idx+1}"

            year_sort = int(rec.get("yearSort", 0))
            era = rec.get("era", "").strip()
            if era not in CANONICAL_ERAS:
                era = infer_era(year_sort)

            region = rec.get("region", "").strip()
            if region not in CANONICAL_REGIONS:
                skipped.append((shard_name, item_id, f"Invalid region: {region}"))
                continue

            medium_cat = rec.get("mediumCategory", "").strip()
            if medium_cat not in CANONICAL_MEDIUMS:
                medium_cat = "Sculpture & Relief"

            morphology = rec.get("morphology", "").strip()
            if morphology not in CANONICAL_MORPHOLOGIES:
                morphology = "Composite Chimeras"

            urls = build_wikimedia_urls(norm_file)
            anatomy = [str(x).strip() for x in (rec.get("anatomy") or []) if str(x).strip()]

            clean_item = {
                "id": item_id,
                "title": str(rec.get("title", "")).strip(),
                "creature": str(rec.get("creature", "")).strip(),
                "creatureFamily": classify_creature_family(rec),
                "localName": str(rec.get("localName", "")).strip(),
                "civilization": str(rec.get("civilization", "")).strip(),
                "region": region,
                "originLocation": str(rec.get("originLocation", "")).strip(),
                "dateDisplay": str(rec.get("dateDisplay", "")).strip(),
                "yearSort": year_sort,
                "era": era,
                "medium": str(rec.get("medium", "")).strip(),
                "mediumCategory": medium_cat,
                "morphology": morphology,
                "creator": str(rec.get("creator", "Unknown historical artisan")).strip(),
                "repository": str(rec.get("repository", "")).strip(),
                "commonsFile": urls["commonsFile"],
                "commonsUrl": urls["commonsUrl"],
                "thumbUrl": urls["thumbUrl"],
                "fullImageUrl": urls["fullImageUrl"],
                "anatomy": anatomy[:5],
                "description": str(rec.get("description", "")).strip(),
            }

            seen_files.add(norm_file.lower())
            seen_ids.add(item_id)
            compiled.append(clean_item)

    compiled.sort(key=lambda x: (x["yearSort"], x["title"]))

    payload = {
        "archiveTitle": "Bestiarium Mundi — Global Archive of Historical Mythical Creature Depictions",
        "totalCount": len(compiled),
        "regionCounts": dict(Counter(x["region"] for x in compiled)),
        "eraCounts": dict(Counter(x["era"] for x in compiled)),
        "morphologyCounts": dict(Counter(x["morphology"] for x in compiled)),
        "mediumCounts": dict(Counter(x["mediumCategory"] for x in compiled)),
        "familyCounts": dict(Counter(x["creatureFamily"] for x in compiled)),
        "items": compiled,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.MYTHICAL_ARCHIVE = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print(f"Compiled {len(compiled)} verified historical depictions from {len(shard_paths)} shards.")
    print("By Region:", json.dumps(payload["regionCounts"], indent=2))
    if skipped:
        print(f"Skipped {len(skipped)} entries:")
        for s in skipped:
            print("  -", s)


if __name__ == "__main__":
    main()
