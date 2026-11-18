"""Verifica o PDF multipágina do catálogo gerado pelo Chromium do Electron real."""
import json
from pathlib import Path
import fitz

root = Path("qa-artifacts/catalog-export")
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
with fitz.open(root / "catalogo.pdf") as doc:
    assert doc.page_count >= 2, "510 produtos precisam ocupar várias páginas A4"
    assert all(page.rect.width > page.rect.height for page in doc), "PDF deve ser paisagem"
    content = "\n".join(page.get_text("text") for page in doc)
    assert "Produto 0001" in content, "Primeiro produto ausente"
    assert manifest["lastProduct"] in content, "Último produto foi truncado"
    assert "Mercearia" in content, "Categoria ausente"
    assert "Documento gerencial não fiscal" in content, "Rodapé não fiscal ausente"
    assert "TOTAL" in content, "Total geral ausente"
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                x0, y0, x1, y1 = line["bbox"]
                assert x0 >= -1 and y0 >= -1, f"Texto fora da página {page.number+1}"
                assert x1 <= page.rect.width+2 and y1 <= page.rect.height+2, (
                    f"Texto cortado na página {page.number+1}"
                )
    print(f"CATALOG_QA_PDF_OK: {manifest['expected']} produtos, "
          f"{doc.page_count} páginas, PDF A4 paisagem, primeiro e último legíveis")
