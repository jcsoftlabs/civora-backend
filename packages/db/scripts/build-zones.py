"""
Génère data/zones-ht.json à partir du référentiel administratif officiel d'Haïti.

Source : CNIGS (Centre National de l'Information Géo-Spatiale), « Haiti - Subnational Administrative Boundaries »
(COD-AB), publié sur HDX : https://data.humdata.org/dataset/cod-ab-hti, fichier hti_admin_boundaries.xlsx.
Licence : CC BY-IGO (attribution obligatoire). Codes compatibles avec la codification IHSI.

Usage : python3 -I scripts/build-zones.py <hti_admin_boundaries.xlsx> data/zones-ht.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from xlsx import read  # noqa: E402

# Corrections d'orthographe par rapport à la source (nom officiel du département).
NAME_FIXES = {"Grande'Anse": "Grand'Anse"}


def label(pcode: str) -> str:
    """Segment ltree : lettres, chiffres et soulignés uniquement."""
    return pcode.lower().replace("-", "_")


def rows(sheets, name):
    head, *body = sheets[name]
    return [dict(zip(head, r)) for r in body]


def clean(s):
    s = (s or "").strip()
    return NAME_FIXES.get(s, s) or None


def main(src: str, out: str) -> None:
    sheets = read(src)
    zones = [{"code": "HT", "level": "pays", "name": "Haïti", "nameHt": "Ayiti", "parent": None, "path": "ht"}]
    for r in rows(sheets, "hti_admin1"):
        zones.append({
            "code": r["adm1_pcode"], "level": "departement", "parent": "HT",
            "name": clean(r["adm1_name1"]), "nameHt": clean(r["adm1_name2"]),
            "path": f"ht.{label(r['adm1_pcode'])}",
        })
    # Les noms créoles des communes sont donnés dans la feuille des chefs-lieux.
    commune_ht = {r["adm2_pcode"]: clean(r["adm2_name2"]) for r in rows(sheets, "hti_admincapitals") if r.get("adm2_name2")}
    for r in rows(sheets, "hti_admin2"):
        zones.append({
            "code": r["adm2_pcode"], "level": "commune", "parent": r["adm1_pcode"],
            "name": clean(r["adm2_name1"]), "nameHt": clean(r["adm2_name2"]) or commune_ht.get(r["adm2_pcode"]),
            "path": f"ht.{label(r['adm1_pcode'])}.{label(r['adm2_pcode'])}",
        })
    for r in rows(sheets, "hti_admin3"):
        zones.append({
            "code": r["adm3_pcode"], "level": "section_communale", "parent": r["adm2_pcode"],
            "name": clean(r["adm3_name1"]), "nameHt": clean(r["adm3_name2"]),
            "path": f"ht.{label(r['adm1_pcode'])}.{label(r['adm2_pcode'])}.{label(r['adm3_pcode'])}",
        })

    codes = [z["code"] for z in zones]
    assert len(codes) == len(set(codes)), "codes en double"
    known = set(codes)
    assert all(z["parent"] is None or z["parent"] in known for z in zones), "parent inconnu"
    assert all(z["name"] for z in zones), "nom manquant"

    doc = {
        "source": "CNIGS, Haiti - Subnational Administrative Boundaries (COD-AB), HDX, https://data.humdata.org/dataset/cod-ab-hti",
        "license": "CC BY-IGO",
        "note": "Codification 2018 (140 communes). Les communes créées depuis sont à ajouter quand le CNIGS ou l'IHSI les publient.",
        "zones": zones,
    }
    Path(out).write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    counts = {}
    for z in zones:
        counts[z["level"]] = counts.get(z["level"], 0) + 1
    print(counts)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
