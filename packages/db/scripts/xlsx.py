# Lit un .xlsx avec la bibliothèque standard : feuilles, en-têtes, nombre de lignes, exemples.
import json, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters: n = n * 26 + ord(ch) - 64
    return n - 1

def read(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    sheets = {}
    for s in wb.find("m:sheets", NS):
        rid = s.get("{%s}id" % NS["r"])
        xml = ET.fromstring(z.read("xl/" + target[rid].lstrip("/").replace("xl/", "")))
        rows = []
        for row in xml.iter("{%s}row" % NS["m"]):
            vals = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                t = c.get("t")
                if t == "s" and v is not None: val = shared[int(v.text)]
                elif t == "inlineStr": val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                else: val = v.text if v is not None else None
                vals[col_index(c.get("r"))] = val
            if vals: rows.append([vals.get(i) for i in range(max(vals) + 1)])
        sheets[s.get("name")] = rows
    return sheets

if __name__ == "__main__":
    sheets = read(sys.argv[1])
    if len(sys.argv) > 2:
        json.dump(sheets, open(sys.argv[2], "w"), ensure_ascii=False)
    for name, rows in sheets.items():
        print(f"== {name}: {len(rows)} lignes")
        if rows:
            print("   en-têtes:", rows[0])
            for r in rows[1:3]: print("   ", r)
