"""Valida PDFs gerados pelo Electron: uma página, dimensões, texto e orientação.
Dependência de QA (não distribuída com o PDV): PyMuPDF, open source AGPL.
"""
import json
import math
from pathlib import Path
import fitz

ROOT = Path("qa-artifacts/label-print")
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
assert len(manifest["scenarios"]) >= 5, "Matriz de perfis de etiqueta incompleta"
for scenario in manifest["scenarios"]:
    path = ROOT / scenario["pdf"]
    with fitz.open(path) as doc:
        assert doc.page_count == 1, f"{scenario['id']}: uma etiqueta deve ocupar exatamente uma página; veio {doc.page_count}"
        page = doc[0]
        mm_width = page.rect.width * 25.4 / 72
        mm_height = page.rect.height * 25.4 / 72
        assert abs(mm_width - scenario["widthMm"]) < 0.9, f"{scenario['id']}: largura incorreta: {mm_width:.2f} mm"
        assert abs(mm_height - scenario["heightMm"]) < 0.9, f"{scenario['id']}: altura incorreta: {mm_height:.2f} mm"
        assert page.rotation == 0, f"{scenario['id']}: PDF tem rotação {page.rotation}"
        raw = page.get_text("dict")
        lines = []
        for block in raw["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                text = "".join(span["text"] for span in line.get("spans", []))
                if not text.strip():
                    continue
                direction = line["dir"]
                assert direction[0] > 0.96 and abs(direction[1]) < 0.12, (
                    f"{scenario['id']}: texto rotacionado no PDF: {direction}: {text}"
                )
                x0, y0, x1, y1 = line["bbox"]
                assert x0 >= -0.5 and y0 >= -0.5, f"{scenario['id']}: texto antes do início do papel"
                assert x1 <= page.rect.width + 0.8 and y1 <= page.rect.height + 0.8, (
                    f"{scenario['id']}: texto fora do papel: {text}"
                )
                lines.append((text, (x0, y0, x1, y1)))
        whole = " ".join(line[0] for line in lines)
        assert scenario["needle"].casefold() in whole.casefold(), f"{scenario['id']}: nome ausente do PDF: {whole}"
        assert scenario["price"] in whole, f"{scenario['id']}: preço ausente do PDF: {whole}"
        names = [bbox for txt, bbox in lines if scenario["needle"].casefold() in txt.casefold()]
        prices = [bbox for txt, bbox in lines if scenario["price"] in txt]
        assert names and prices, f"{scenario['id']}: nome e preço precisam estar legíveis na mesma etiqueta"
        assert min(b[1] for b in prices) > min(b[1] for b in names), (
            f"{scenario['id']}: preço não está abaixo do nome"
        )
        print(f"LABEL_QA_PDF_OK {scenario['id']} paginas=1 tamanho={mm_width:.1f}x{mm_height:.1f}mm horizontal texto={whole[:90]}")
print(f"LABEL_QA_OK: {len(manifest['scenarios'])} perfis e produtos verificados no PDF real do Electron")
