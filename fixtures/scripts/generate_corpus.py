#!/usr/bin/env python3
"""
Folio Test Corpus Generator (fixtures/pdf)
Zero-dependency Python 3.14 standard library generator that produces all 12
required test fixtures and their companion .golden.json validation files according
to Appendix C of Folio-PDF-Reader-Spec.md.
"""

import os
import sys
import zlib
import json
import hashlib
import struct

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "pdf"))

os.makedirs(OUTPUT_DIR, exist_ok=True)


class SimplePdfBuilder:
    """A minimal, compliant PDF 1.4/1.7 generator with support for text, lines, images,
    annotations, outlines, crop boxes, and rotation."""

    def __init__(self):
        self.objects = []  # list of (obj_num, bytes)
        self.next_obj_num = 1

    def allocate_id(self):
        obj_id = self.next_obj_num
        self.next_obj_num += 1
        return obj_id

    def add_object(self, obj_id, content: bytes):
        self.objects.append((obj_id, content))
        return obj_id

    def add_raw_object(self, content: bytes):
        obj_id = self.allocate_id()
        return self.add_object(obj_id, content)

    def add_stream(self, obj_id, dict_entries: dict, data: bytes, compress=True):
        if compress:
            compressed = zlib.compress(data)
            dict_entries["/Filter"] = "/FlateDecode"
            dict_entries["/Length"] = len(compressed)
            stream_bytes = compressed
        else:
            dict_entries["/Length"] = len(data)
            stream_bytes = data

        dict_str = " ".join(f"{k} {v}" for k, v in dict_entries.items())
        content = (
            f"<< {dict_str} >>\nstream\r\n".encode("latin1")
            + stream_bytes
            + b"\r\nendstream"
        )
        return self.add_object(obj_id, content)

    def build_bytes(self, root_id, info_id=None):
        out = bytearray()
        out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

        # Sort objects by ID
        self.objects.sort(key=lambda x: x[0])
        xref_offsets = {}

        for obj_id, content in self.objects:
            xref_offsets[obj_id] = len(out)
            out.extend(f"{obj_id} 0 obj\n".encode("latin1"))
            out.extend(content)
            out.extend(b"\nendobj\n")

        startxref = len(out)
        max_id = max(xref_offsets.keys()) if xref_offsets else 0
        total_objs = max_id + 1

        out.extend(f"xref\n0 {total_objs}\n".encode("latin1"))
        out.extend(b"0000000000 65535 f \r\n")

        for i in range(1, total_objs):
            if i in xref_offsets:
                out.extend(f"{xref_offsets[i]:010d} 00000 n \r\n".encode("latin1"))
            else:
                out.extend(b"0000000000 65535 f \r\n")

        trailer_dict = f"<< /Size {total_objs} /Root {root_id} 0 R"
        if info_id:
            trailer_dict += f" /Info {info_id} 0 R"
        trailer_dict += " >>"

        out.extend(f"trailer\n{trailer_dict}\nstartxref\n{startxref}\n%%EOF\n".encode("latin1"))
        return bytes(out)


def escape_pdf_string(s: str) -> str:
    s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return f"({s})"


def create_standard_fonts(builder: SimplePdfBuilder):
    f_helv = builder.add_raw_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    f_bold = builder.add_raw_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    f_times = builder.add_raw_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
    f_courier = builder.add_raw_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")
    return {
        "F1": f_helv,
        "F2": f_bold,
        "F3": f_times,
        "F4": f_courier
    }


def make_resource_dict(fonts_dict, xobjects_dict=None):
    res = "<< /Font << "
    for name, obj_id in fonts_dict.items():
        res += f"/{name} {obj_id} 0 R "
    res += ">>"
    if xobjects_dict:
        res += " /XObject << "
        for name, obj_id in xobjects_dict.items():
            res += f"/{name} {obj_id} 0 R "
        res += ">>"
    res += " >>"
    return res


# ==============================================================================
# FIXTURE 01: Clean single-column book, 300+ pages
# ==============================================================================
def generate_01_single_column_300p():
    filename = "01_single_column_book_300p.pdf"
    golden_name = "01_single_column_book_300p.golden.json"
    print(f"Generating {filename} (300 pages)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()
    outline_id = b.allocate_id()

    page_count = 300
    page_ids = []
    golden_pages_data = []

    # Chapter outline entries
    chapters = [
        (1, "Chapter 1: The Foundations of Calm Software"),
        (51, "Chapter 2: Principles of Non-Destructive Storage"),
        (101, "Chapter 3: Cognitive Flow and Visual Rest"),
        (151, "Chapter 4: The Geometry of Annotations"),
        (201, "Chapter 5: Neural Speech and Local Speech Synthesis"),
        (251, "Chapter 6: Synthesis and Spaced Repetition"),
    ]

    for p_num in range(1, page_count + 1):
        p_id = b.allocate_id()
        page_ids.append(p_id)

        # Content stream
        stream = bytearray()

        # Running header (repeated across pages >= 30%)
        header_text = "FOLIO CLASSICAL STUDIES · VOLUME I"
        stream.extend(f"BT /F1 9 Tf 72 745 Td {escape_pdf_string(header_text)} Tj ET\n".encode("latin1"))

        # Running footer with page number
        footer_text = f"Page {p_num}"
        stream.extend(f"BT /F1 9 Tf 288 36 Td {escape_pdf_string(footer_text)} Tj ET\n".encode("latin1"))

        # Check if chapter start
        ch_title = None
        for ch_page, title in chapters:
            if ch_page == p_num:
                ch_title = title
                break

        body_sentences = []
        if ch_title:
            stream.extend(f"BT /F2 18 Tf 72 680 Td {escape_pdf_string(ch_title)} Tj ET\n".encode("latin1"))
            stream.extend(b"BT /F3 11 Tf 72 630 Td 15 TL\n")
            p1 = "In a world of constant notification and fleeting attention, deep reading remains one of humanity's finest arts."
            p2 = "A book demands patience, tactile familiarity, and a quiet space free from algorithmic interruptions."
            p3 = "When software honors the calm nature of paper, the reader ceases to notice the digital medium."
            stream.extend(f"{escape_pdf_string(p1)} ' {escape_pdf_string(p2)} ' {escape_pdf_string(p3)} ' ET\n".encode("latin1"))
            body_sentences.extend([p1, p2, p3])
        else:
            stream.extend(b"BT /F3 11 Tf 72 700 Td 15 TL\n")
            p1 = f"Paragraph {p_num}.1 continues the exploration into structured knowledge systems."
            p2 = "Every thought captured in the margin forms an indelible thread in the personal tapestry of comprehension."
            p3 = "We observe that the physical sensation of turning pages anchors memory far deeper than transient scrolling."
            p4 = "Therefore, continuous scroll must retain the deliberate spatial landmarks of discrete pagination."
            stream.extend(f"{escape_pdf_string(p1)} ' {escape_pdf_string(p2)} ' {escape_pdf_string(p3)} ' {escape_pdf_string(p4)} ' ET\n".encode("latin1"))
            body_sentences.extend([p1, p2, p3, p4])

        contents_id = b.allocate_id()
        b.add_stream(contents_id, {}, bytes(stream), compress=True)

        p_obj = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] "
            f"/Resources {res_str} /Contents {contents_id} 0 R >>"
        ).encode("latin1")
        b.add_object(p_id, p_obj)

        if p_num in [1, 2, 51, 150, 300]:
            golden_pages_data.append({
                "page_index": p_num - 1,
                "page_number": p_num,
                "running_headers": [header_text],
                "running_footers": [footer_text],
                "sentences": body_sentences,
                "is_scanned": False
            })

    # Outline items
    outline_item_ids = []
    for ch_page, title in chapters:
        item_id = b.allocate_id()
        outline_item_ids.append((item_id, ch_page, title))

    for idx, (item_id, ch_page, title) in enumerate(outline_item_ids):
        prev_ref = f"/Prev {outline_item_ids[idx-1][0]} 0 R " if idx > 0 else ""
        next_ref = f"/Next {outline_item_ids[idx+1][0]} 0 R " if idx < len(outline_item_ids) - 1 else ""
        target_page_id = page_ids[ch_page - 1]
        b.add_object(
            item_id,
            f"<< /Title {escape_pdf_string(title)} /Parent {outline_id} 0 R {prev_ref}{next_ref}/Dest [{target_page_id} 0 R /XYZ 72 750 null] >>".encode("latin1")
        )

    b.add_object(
        outline_id,
        f"<< /Type /Outlines /First {outline_item_ids[0][0]} 0 R /Last {outline_item_ids[-1][0]} 0 R /Count {len(outline_item_ids)} >>".encode("latin1")
    )

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count {page_count} >>".encode("latin1"))

    info_dict = (
        f"<< /Title (Folio Classical Studies Volume I) /Author (Folio Research) "
        f"/Creator (Folio Test Corpus Generator) /CreationDate (D:20261009120000Z) >>"
    ).encode("latin1")
    b.add_object(info_id, info_dict)

    b.add_object(
        catalog_id,
        f"<< /Type /Catalog /Pages {pages_id} 0 R /Outlines {outline_id} 0 R >>".encode("latin1")
    )

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 1,
        "filename": filename,
        "description": "Clean single-column book, 300 pages with outline, headers, footers, and uniform typography.",
        "page_count": page_count,
        "has_outline": True,
        "sample_pages": golden_pages_data
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 02: Two-column academic papers
# ==============================================================================
def generate_02_two_column_paper():
    filename = "02_two_column_paper.pdf"
    golden_name = "02_two_column_paper.golden.json"
    print(f"Generating {filename} (Two-column paper)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_ids = []
    golden_pages_data = []

    # Page 1: Title, Abstract (full width), then 2 columns
    p1_id = b.allocate_id()
    page_ids.append(p1_id)
    s1 = bytearray()
    s1.extend(b"BT /F1 8 Tf 72 750 Td (IEEE TRANSACTIONS ON CALM COMPUTING, VOL. 42, NO. 1, 2026) Tj ET\n")
    s1.extend(b"BT /F2 16 Tf 72 700 Td (Non-Destructive Annotation Anchoring in Digital Documents) Tj ET\n")
    s1.extend(b"BT /F1 10 Tf 72 680 Td (Jane Doe, Senior Member, IEEE, and Alan Turing, Fellow, ACM) Tj ET\n")
    
    # Abstract
    s1.extend(b"BT /F2 9 Tf 72 650 Td (Abstract-) Tj /F3 9 Tf (This paper introduces a robust, coordinate-independent geometry model for anchoring user marginalia. By decoupling stored vector anchors from fragile underlying DOM representations, our model ensures 99.9% preservation across viewer refactors and re-extractions.) Tj ET\n")

    # Column 1 (Left: x=72, y=600 down to 100, width=220)
    col1_lines = [
        "1. Introduction. Digital reading environments",
        "frequently corrupt user annotations when document",
        "engines update.",
        "Prior approaches rely heavily on ephemeral",
        "DOM node indices [1], [2]. Such mechanisms",
        "fail upon dynamic layout reflow.",
        "Recent work by Sioyek and Zotero demonstrates",
        "the value of storing annotations outside the",
        "binary artifact [3]."
    ]
    s1.extend(b"BT /F3 9 Tf 72 600 Td 12 TL\n")
    for l in col1_lines:
        s1.extend(f"{escape_pdf_string(l)} ' \n".encode("latin1"))
    s1.extend(b"ET\n")

    # Column 2 (Right: x=320, y=600 down to 100, width=220)
    col2_lines = [
        "2. System Architecture. Our pipeline employs",
        "normalized 0 to 1 coordinates in visible",
        "page space.",
        "Regardless of device DPI or viewport zoom,",
        "coordinates map deterministically to the",
        "bounding box.",
        "As shown by Knuth (1984), typographic",
        "stability requires invariant anchor baselines."
    ]
    s1.extend(b"BT /F3 9 Tf 320 600 Td 12 TL\n")
    for l in col2_lines:
        s1.extend(f"{escape_pdf_string(l)} ' \n".encode("latin1"))
    s1.extend(b"ET\n")

    # Footnote at bottom
    s1.extend(b"0.5 w 72 70 m 180 70 l S\n")
    s1.extend(b"BT /F1 7 Tf 72 58 Td (Manuscript received October 8, 2026. Corresponding author: J. Doe.) Tj ET\n")
    s1.extend(b"BT /F1 9 Tf 530 36 Td (1) Tj ET\n")

    c1_id = b.allocate_id()
    b.add_stream(c1_id, {}, bytes(s1))
    b.add_object(p1_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c1_id} 0 R >>".encode("latin1"))

    # Page 2: References
    p2_id = b.allocate_id()
    page_ids.append(p2_id)
    s2 = bytearray()
    s2.extend(b"BT /F1 8 Tf 72 750 Td (IEEE TRANSACTIONS ON CALM COMPUTING, VOL. 42, NO. 1, 2026) Tj ET\n")
    s2.extend(b"BT /F2 11 Tf 72 700 Td (References) Tj ET\n")
    s2.extend(b"BT /F1 8 Tf 72 670 Td 11 TL\n")
    r1 = "[1] A. Smith, 'Resilient Text Extractors,' Journal of Systems, vol. 12, pp. 45-56, 2021."
    r2 = "[2] B. Johnson and C. Lee, 'Annotation Integrity,' ACM Computing Surveys, vol. 34, 2023."
    r3 = "[3] D. Adams, 'Calm User Interfaces for Power Readers,' Digital Typography, 2025."
    s2.extend(f"{escape_pdf_string(r1)} ' {escape_pdf_string(r2)} ' {escape_pdf_string(r3)} ' ET\n".encode("latin1"))
    s2.extend(b"BT /F1 9 Tf 530 36 Td (2) Tj ET\n")

    c2_id = b.allocate_id()
    b.add_stream(c2_id, {}, bytes(s2))
    b.add_object(p2_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c2_id} 0 R >>".encode("latin1"))

    golden_pages_data.append({
        "page_index": 0,
        "page_number": 1,
        "running_headers": ["IEEE TRANSACTIONS ON CALM COMPUTING, VOL. 42, NO. 1, 2026"],
        "running_footers": ["1"],
        "reading_order": [
            "Title & Author",
            "Abstract",
            "Column 1 (Left)",
            "Column 2 (Right)"
        ],
        "citations": ["[1]", "[2]", "[3]", "(Knuth, 1984)"],
        "footnotes": ["Manuscript received October 8, 2026. Corresponding author: J. Doe."]
    })

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_ids)} >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Non-Destructive Annotation Anchoring) /Author (Jane Doe) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump({"fixture_id": 2, "filename": filename, "sample_pages": golden_pages_data}, f, indent=2)


# ==============================================================================
# FIXTURE 03: Textbook with figures, tables, sidebars, footnotes
# ==============================================================================
def generate_03_textbook_figures_tables():
    filename = "03_textbook_figures_tables.pdf"
    golden_name = "03_textbook_figures_tables.golden.json"
    print(f"Generating {filename} (Textbook with figures and tables)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_ids = []
    p1_id = b.allocate_id()
    page_ids.append(p1_id)

    s = bytearray()
    # Header
    s.extend(b"BT /F1 9 Tf 72 750 Td (CHAPTER 4 - HARDWARE-ACCELERATED READING) Tj ET\n")
    s.extend(b"BT /F2 16 Tf 72 710 Td (4.3 Pipeline Throughput & Latency) Tj ET\n")
    s.extend(b"BT /F3 10 Tf 72 680 Td (The rendering pipeline requires strict CPU thread allocation to maintain frame rates.) Tj ET\n")

    # Vector Figure: Rect at [72, 480, 468, 160]
    s.extend(b"0.85 0.90 0.95 rg 72 480 468 160 re f\n")
    s.extend(b"0.2 0.4 0.7 RG 1.5 w 72 480 468 160 re S\n")
    s.extend(b"BT /F2 10 Tf 200 560 Td (Figure 4.1: End-to-End Audio Buffer Architecture) Tj ET\n")
    s.extend(b"BT /F1 8 Tf 180 540 Td ([Decoder] ---> [Circular Buffer 20s] ---> [WASAPI Sink]) Tj ET\n")

    # Figure Caption
    s.extend(b"BT /F2 9 Tf 72 460 Td (Figure 4.1.) Tj /F3 9 Tf ( Audio synthesis maintains a 20-second lookahead buffer to absorb CPU spikes during background OCR.) Tj ET\n")

    # Table: Ruled lines and data
    s.extend(b"BT /F2 11 Tf 72 410 Td (Table 4.2: Resource Budgets by Milestone) Tj ET\n")
    # Table box
    s.extend(b"0.95 0.95 0.95 rg 72 310 468 90 re f\n")
    s.extend(b"0.4 0.4 0.4 RG 1 w\n")
    s.extend(b"72 310 m 540 310 l 72 400 m 540 400 l 72 370 m 540 370 l S\n") # horizontal
    s.extend(b"72 310 m 72 400 l 200 310 m 200 400 l 350 310 m 350 400 l 540 310 m 540 400 l S\n") # vertical

    # Table text
    s.extend(b"BT /F2 9 Tf 80 380 Td (Subsystem) Tj 210 380 Td (Memory Cap) Tj 360 380 Td (Latency Target) Tj ET\n")
    s.extend(b"BT /F1 9 Tf 80 350 Td (Viewer Core) Tj 210 350 Td (<= 500 MB) Tj 360 350 Td (<= 1.0 s open) Tj ET\n")
    s.extend(b"BT /F1 9 Tf 80 325 Td (Neural TTS) Tj 210 325 Td (<= 350 MB) Tj 360 325 Td (<= 3.0 s audio) Tj ET\n")

    # Sidebar Box at bottom
    s.extend(b"1.0 0.98 0.90 rg 72 180 468 90 re f\n")
    s.extend(b"0.8 0.6 0.2 RG 1 w 72 180 468 90 re S\n")
    s.extend(b"BT /F2 10 Tf 82 250 Td (Key Insight: Single Writer Queue) Tj ET\n")
    s.extend(b"BT /F3 9 Tf 82 225 Td (To avoid SQLite lock contention across concurrent background extractors, all writes) Tj ET\n")
    s.extend(b"BT /F3 9 Tf 82 205 Td (must be channeled through a dedicated background Channel<T> writer.) Tj ET\n")

    # Footnote
    s.extend(b"BT /F1 8 Tf 72 80 Td (* Note: Benchmarks measured on Intel Core i7-1370P CPU-only reference machine.) Tj ET\n")
    s.extend(b"BT /F1 9 Tf 288 36 Td (87) Tj ET\n")

    c1_id = b.allocate_id()
    b.add_stream(c1_id, {}, bytes(s), compress=True)
    b.add_object(p1_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c1_id} 0 R >>".encode("latin1"))

    kids_str = f"{p1_id} 0 R"
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count 1 >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Hardware-Accelerated Reading) /Author (Folio Press) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 3,
        "filename": filename,
        "figures": [
            {
                "label": "Figure 4.1",
                "kind": "figure",
                "bbox_pt": [72, 480, 540, 640],
                "caption": "Audio synthesis maintains a 20-second lookahead buffer to absorb CPU spikes during background OCR."
            }
        ],
        "tables": [
            {
                "label": "Table 4.2",
                "kind": "table",
                "bbox_pt": [72, 310, 540, 400],
                "caption": "Table 4.2: Resource Budgets by Milestone"
            }
        ],
        "sidebars": [
            {
                "title": "Key Insight: Single Writer Queue",
                "bbox_pt": [72, 180, 540, 270]
            }
        ],
        "footnotes": ["* Note: Benchmarks measured on Intel Core i7-1370P CPU-only reference machine."]
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 04: Fully scanned book (Bitmap image pages, zero native text)
# ==============================================================================
def generate_04_scanned_book():
    filename = "04_scanned_book.pdf"
    golden_name = "04_scanned_book.golden.json"
    print(f"Generating {filename} (Fully scanned bitmap pages)...")

    b = SimplePdfBuilder()
    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_ids = []
    # Create a small simulated 300x400 monochrome/grayscale scanned page image
    width, height = 300, 400
    img_data = bytearray(width * height)

    # Fill with white background (255) and add horizontal noisy lines representing scanned text lines
    for i in range(len(img_data)):
        img_data[i] = 245  # slightly warm off-white scan background

    # Draw simulated text line bars
    for y in range(60, 360, 30):
        for x in range(30, 270):
            # Add text stroke marks with noise
            if (x % 7) in [0, 1, 2, 4]:
                for dy in range(-4, 4):
                    img_data[(y + dy) * width + x] = 30  # dark ink

    img_obj_id = b.allocate_id()
    b.add_stream(
        img_obj_id,
        {
            "/Type": "/XObject",
            "/Subtype": "/Image",
            "/Width": width,
            "/Height": height,
            "/ColorSpace": "/DeviceGray",
            "/BitsPerComponent": 8
        },
        bytes(img_data),
        compress=True
    )

    for p in range(1, 4):
        p_id = b.allocate_id()
        page_ids.append(p_id)

        # Place the image over the full page (0,0 to 612,792)
        s = f"q 612 0 0 792 0 0 cm /ImgScan Do Q\n".encode("latin1")
        c_id = b.allocate_id()
        b.add_stream(c_id, {}, s, compress=False)

        res_str = f"<< /XObject << /ImgScan {img_obj_id} 0 R >> >>"
        b.add_object(p_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c_id} 0 R >>".encode("latin1"))

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_ids)} >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Scanned Historical Archive) /Author (Archive Scanning Unit) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 4,
        "filename": filename,
        "is_fully_scanned": True,
        "has_native_text": False,
        "page_count": 3,
        "expected_detection": "scanned",
        "description": "Composed strictly of bitmap images with no PDF text operators (BT/ET)."
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 05: Mixed text + scanned pages
# ==============================================================================
def generate_05_mixed_text_and_scan():
    filename = "05_mixed_text_and_scan.pdf"
    golden_name = "05_mixed_text_and_scan.golden.json"
    print(f"Generating {filename} (Mixed native text and scanned pages)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_text = make_resource_dict(fonts)

    # Scanned image for page 2
    w, h = 200, 200
    img_data = bytes([220 if (x//10 + y//10)%2==0 else 40 for y in range(h) for x in range(w)])
    img_id = b.allocate_id()
    b.add_stream(img_id, {"/Type": "/XObject", "/Subtype": "/Image", "/Width": w, "/Height": h, "/ColorSpace": "/DeviceGray", "/BitsPerComponent": 8}, img_data, compress=True)
    res_scan = f"<< /XObject << /Scan2 {img_id} 0 R >> >>"

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_ids = []

    # Page 1: Native Text
    p1_id = b.allocate_id()
    page_ids.append(p1_id)
    c1_id = b.allocate_id()
    s1 = b"BT /F2 16 Tf 72 700 Td (Page 1: Digital Born Introduction) Tj ET\nBT /F1 11 Tf 72 660 Td (This page contains crisp vector text generated directly by the compositor.) Tj ET\n"
    b.add_stream(c1_id, {}, s1)
    b.add_object(p1_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_text} /Contents {c1_id} 0 R >>".encode("latin1"))

    # Page 2: Scanned Image Page
    p2_id = b.allocate_id()
    page_ids.append(p2_id)
    c2_id = b.allocate_id()
    s2 = b"q 612 0 0 792 0 0 cm /Scan2 Do Q\n"
    b.add_stream(c2_id, {}, s2)
    b.add_object(p2_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_scan} /Contents {c2_id} 0 R >>".encode("latin1"))

    # Page 3: Native Text
    p3_id = b.allocate_id()
    page_ids.append(p3_id)
    c3_id = b.allocate_id()
    s3 = b"BT /F2 16 Tf 72 700 Td (Page 3: Conclusion and Epilogue) Tj ET\nBT /F1 11 Tf 72 660 Td (Returning to pure vector typography following the scanned insert.) Tj ET\n"
    b.add_stream(c3_id, {}, s3)
    b.add_object(p3_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_text} /Contents {c3_id} 0 R >>".encode("latin1"))

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count 3 >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Mixed Document Sample) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 5,
        "filename": filename,
        "page_classification": [
            {"page_index": 0, "has_native_text": True, "needs_ocr": False},
            {"page_index": 1, "has_native_text": False, "needs_ocr": True},
            {"page_index": 2, "has_native_text": True, "needs_ocr": False}
        ]
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 06: Rotated and cropped pages (Coordinate-space conversion)
# ==============================================================================
def generate_06_rotated_and_cropped():
    filename = "06_rotated_and_cropped.pdf"
    golden_name = "06_rotated_and_cropped.golden.json"
    print(f"Generating {filename} (Rotated and cropped pages)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_ids = []

    # Page 1: Standard (0 deg)
    p1_id = b.allocate_id()
    page_ids.append(p1_id)
    c1_id = b.allocate_id()
    b.add_stream(c1_id, {}, b"BT /F2 14 Tf 72 700 Td (Page 1: Normal 0 deg rotation) Tj ET\n")
    b.add_object(p1_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c1_id} 0 R >>".encode("latin1"))

    # Page 2: Rotated 90 deg clockwise (/Rotate 90)
    p2_id = b.allocate_id()
    page_ids.append(p2_id)
    c2_id = b.allocate_id()
    b.add_stream(c2_id, {}, b"BT /F2 14 Tf 72 700 Td (Page 2: Rotated 90 degrees) Tj ET\n")
    b.add_object(p2_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources {res_str} /Contents {c2_id} 0 R >>".encode("latin1"))

    # Page 3: Rotated 270 deg (/Rotate 270)
    p3_id = b.allocate_id()
    page_ids.append(p3_id)
    c3_id = b.allocate_id()
    b.add_stream(c3_id, {}, b"BT /F2 14 Tf 72 700 Td (Page 3: Rotated 270 degrees) Tj ET\n")
    b.add_object(p3_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Rotate 270 /Resources {res_str} /Contents {c3_id} 0 R >>".encode("latin1"))

    # Page 4: Cropped with CropBox [36 36 576 756]
    p4_id = b.allocate_id()
    page_ids.append(p4_id)
    c4_id = b.allocate_id()
    b.add_stream(c4_id, {}, b"BT /F2 14 Tf 72 700 Td (Page 4: Custom CropBox with inset margins) Tj ET\n")
    b.add_object(p4_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /CropBox [36 36 576 756] /Resources {res_str} /Contents {c4_id} 0 R >>".encode("latin1"))

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count 4 >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Coordinate Transformations Test) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 6,
        "filename": filename,
        "pages": [
            {"page_index": 0, "rotation": 0, "media_box": [0, 0, 612, 792], "crop_box": [0, 0, 612, 792]},
            {"page_index": 1, "rotation": 90, "media_box": [0, 0, 612, 792], "crop_box": [0, 0, 612, 792]},
            {"page_index": 2, "rotation": 270, "media_box": [0, 0, 612, 792], "crop_box": [0, 0, 612, 792]},
            {"page_index": 3, "rotation": 0, "media_box": [0, 0, 612, 792], "crop_box": [36, 36, 576, 756]}
        ]
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 07: 1,000+ page PDF (Virtualization, memory, indexing stress)
# ==============================================================================
def generate_07_thousand_page_book():
    filename = "07_thousand_page_book.pdf"
    golden_name = "07_thousand_page_book.golden.json"
    print(f"Generating {filename} (1,000 pages stress test)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_count = 1000
    page_ids = []

    # Share identical stream templates across pages to keep generation instant and lightweight
    # While still having individual page numbers
    for p_num in range(1, page_count + 1):
        p_id = b.allocate_id()
        page_ids.append(p_id)

        stream = f"BT /F2 16 Tf 72 700 Td (Stress Benchmark · Page {p_num} of {page_count}) Tj ET\nBT /F1 10 Tf 72 650 Td 14 TL (This synthetic page serves to stress test DOM virtualization, memory budgets, and the FTS5 full-text indexing pipeline.) ' (Memory consumption must remain <= 1.2 GB for a 1,000-page PDF according to NFR-01.) ' ET\nBT /F1 9 Tf 288 36 Td ({p_num}) Tj ET\n".encode("latin1")
        c_id = b.allocate_id()
        b.add_stream(c_id, {}, stream, compress=True)
        b.add_object(p_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c_id} 0 R >>".encode("latin1"))

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count {page_count} >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Virtualization 1000 Pages Stress Test) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 7,
        "filename": filename,
        "total_pages": page_count,
        "target_benchmarks": {
            "ram_cap_mb": 1200,
            "scroll_fps": 55,
            "cold_open_s": 1.0
        }
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 08: Math-heavy and code-heavy (Cleanup, skip rules, reflow limits)
# ==============================================================================
def generate_08_math_and_code():
    filename = "08_math_and_code.pdf"
    golden_name = "08_math_and_code.golden.json"
    print(f"Generating {filename} (Math and code blocks)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    p1_id = b.allocate_id()
    c1_id = b.allocate_id()

    s = bytearray()
    s.extend(b"BT /F2 16 Tf 72 710 Td (Computational Complexity & Scheduling Algorithms) Tj ET\n")
    s.extend(b"BT /F1 10 Tf 72 670 Td (The optimization objective can be formulated via the Lagrangian function:) Tj ET\n")

    # Math formula lines
    s.extend(b"BT /F3 11 Tf 120 630 Td (L(x, lambda, nu) = f_0(x) + Sum_{i=1}^m lambda_i f_i(x) + Sum_{i=1}^p nu_i h_i(x)) Tj ET\n")
    s.extend(b"BT /F1 10 Tf 72 590 Td (Where the Karush-Kuhn-Tucker (KKT) conditions require that:) Tj ET\n")
    s.extend(b"BT /F3 11 Tf 120 560 Td (grad f_0(x*) + Sum lambda_i* grad f_i(x*) = 0, with lambda_i* >= 0) Tj ET\n")

    # Code block in Courier font
    s.extend(b"0.92 0.92 0.92 rg 72 380 468 150 re f\n")
    s.extend(b"0.3 0.3 0.3 RG 1 w 72 380 468 150 re S\n")
    s.extend(b"BT /F4 9 Tf 82 505 Td 13 TL\n")
    c_lines = [
        "// C# SM-2 Spaced Repetition Scheduling Algorithm",
        "public FlashcardSchedule CalculateNextReview(Flashcard card, ReviewRating rating) {",
        "    if (rating >= ReviewRating.Good) {",
        "        card.IntervalDays = card.Reps == 0 ? 1 : (card.Reps == 1 ? 6 : (int)(card.IntervalDays * card.Ease));",
        "        card.Ease = Math.Max(1.3, card.Ease + (0.1 - (5 - (int)rating) * (0.08 + (5 - (int)rating) * 0.02)));",
        "        card.Reps++;",
        "    } else { card.IntervalDays = 1; card.Reps = 0; }",
        "    return new FlashcardSchedule(DateTime.UtcNow.AddDays(card.IntervalDays));",
        "}"
    ]
    for line in c_lines:
        s.extend(f"{escape_pdf_string(line)} ' ".encode("latin1"))
    s.extend(b"ET\n")

    b.add_stream(c1_id, {}, bytes(s))
    b.add_object(p1_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c1_id} 0 R >>".encode("latin1"))
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{p1_id} 0 R] /Count 1 >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Math and Code Heavy Analysis) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 8,
        "filename": filename,
        "code_blocks": [
            {"bbox_pt": [72, 380, 540, 530], "language": "C#", "skip_in_narration": True}
        ],
        "formulas": [
            "L(x, lambda, nu) = f_0(x) + Sum_{i=1}^m lambda_i f_i(x) + Sum_{i=1}^p nu_i h_i(x)",
            "grad f_0(x*) + Sum lambda_i* grad f_i(x*) = 0, with lambda_i* >= 0"
        ]
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 09: Password-protected PDF (Standard PDF 1.4 encryption)
# ==============================================================================
def generate_09_password_protected():
    filename = "09_password_protected.pdf"
    golden_name = "09_password_protected.golden.json"
    print(f"Generating {filename} (Password-protected)...")

    # Standard PDF 40-bit RC4 encryption implementation
    password = b"folio123"
    # PDF standard padding string (from ISO 32000-1)
    PADDING = bytes([
        0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
        0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
        0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
        0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
    ])

    file_id = b"FOLIO_CORPUS_SECURE_ID_12345"

    def rc4_crypt(key: bytes, data: bytes) -> bytes:
        S = list(range(256))
        j = 0
        out = bytearray(len(data))
        for i in range(256):
            j = (j + S[i] + key[i % len(key)]) % 256
            S[i], S[j] = S[j], S[i]
        i = j = 0
        for idx, char in enumerate(data):
            i = (i + 1) % 256
            j = (j + S[i]) % 256
            S[i], S[j] = S[j], S[i]
            out[idx] = char ^ S[(S[i] + S[j]) % 256]
        return bytes(out)

    # Compute Owner Key (O)
    padded_owner = (password + PADDING)[:32]
    owner_hash = hashlib.md5(padded_owner).digest()[:5]
    padded_user = (password + PADDING)[:32]
    o_val = rc4_crypt(owner_hash, padded_user)

    # Compute Encryption Key
    p_int = -3904  # standard permissions: allow printing, disallow modifying
    p_bytes = struct.pack("<i", p_int)
    m = hashlib.md5()
    m.update(padded_user)
    m.update(o_val)
    m.update(p_bytes)
    m.update(file_id)
    enc_key = m.digest()[:5]

    # Compute User Key (U)
    u_val = rc4_crypt(enc_key, PADDING)

    def encrypt_obj(obj_num, gen_num, data):
        h = hashlib.md5(enc_key + struct.pack("<I", obj_num)[:3] + struct.pack("<I", gen_num)[:2]).digest()
        key = h[:min(len(enc_key) + 5, 16)]
        return rc4_crypt(key, data)

    # Build PDF with encrypted stream and strings
    out = bytearray()
    out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}

    def write_obj(num, body):
        offsets[num] = len(out)
        out.extend(f"{num} 0 obj\n".encode("latin1"))
        out.extend(body)
        out.extend(b"\nendobj\n")

    # 1: Catalog
    write_obj(1, b"<< /Type /Catalog /Pages 2 0 R >>")
    # 2: Pages
    write_obj(2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    # 3: Page
    write_obj(3, b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>")
    # 4: Font
    write_obj(4, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    # 5: Contents (Encrypted stream)
    plain_stream = b"BT /F1 14 Tf 72 700 Td (Secret Decrypted Information) Tj ET\nBT /F1 10 Tf 72 660 Td (This document requires password authentication before reading.) Tj ET\n"
    enc_stream = encrypt_obj(5, 0, plain_stream)
    stream_content = f"<< /Length {len(enc_stream)} >>\nstream\r\n".encode("latin1") + enc_stream + b"\r\nendstream"
    write_obj(5, stream_content)

    # 6: Encrypt Dictionary
    o_hex = o_val.hex()
    u_hex = u_val.hex()
    enc_dict = f"<< /Filter /Standard /V 1 /R 2 /O <{o_hex}> /U <{u_hex}> /P {p_int} >>".encode("latin1")
    write_obj(6, enc_dict)

    startxref = len(out)
    out.extend(b"xref\n0 7\n0000000000 65535 f \r\n")
    for i in range(1, 7):
        out.extend(f"{offsets[i]:010d} 00000 n \r\n".encode("latin1"))

    id_hex = file_id.hex()
    out.extend(f"trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<{id_hex}> <{id_hex}>] >>\nstartxref\n{startxref}\n%%EOF\n".encode("latin1"))

    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(out)

    golden = {
        "fixture_id": 9,
        "filename": filename,
        "is_encrypted": True,
        "password": "folio123",
        "expected_decrypted_text": "Secret Decrypted Information"
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 10: PDF with existing annotations (/Highlight, /Text sticky note)
# ==============================================================================
def generate_10_existing_annotations():
    filename = "10_existing_annotations.pdf"
    golden_name = "10_existing_annotations.golden.json"
    print(f"Generating {filename} (Existing PDF annotations)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    p1_id = b.allocate_id()
    c1_id = b.allocate_id()

    s = bytearray()
    s.extend(b"BT /F2 16 Tf 72 710 Td (External Annotation Import Verification) Tj ET\n")
    s.extend(b"BT /F1 11 Tf 72 670 Td (This paragraph contains a yellow highlight created in an external reader.) Tj ET\n")
    s.extend(b"BT /F1 11 Tf 72 640 Td (Beside this line sits a classic sticky note annotation.) Tj ET\n")
    b.add_stream(c1_id, {}, bytes(s))

    # Annotation 1: Highlight at [72, 668, 480, 684]
    annot1_id = b.add_raw_object(
        b"<< /Type /Annot /Subtype /Highlight /Rect [72 668 480 684] "
        b"/QuadPoints [72 684 480 684 72 668 480 668] "
        b"/C [1.0 1.0 0.0] /Contents (This paragraph contains a yellow highlight) >>"
    )

    # Annotation 2: Sticky Note at [500, 635, 520, 655]
    annot2_id = b.add_raw_object(
        b"<< /Type /Annot /Subtype /Text /Rect [500 635 520 655] "
        b"/Contents (Review this section before submitting draft.) /C [0.2 0.8 0.2] >>"
    )

    p1_obj = (
        f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] "
        f"/Resources {res_str} /Contents {c1_id} 0 R /Annots [{annot1_id} 0 R {annot2_id} 0 R] >>"
    ).encode("latin1")
    b.add_object(p1_id, p1_obj)

    b.add_object(pages_id, f"<< /Type /Pages /Kids [{p1_id} 0 R] /Count 1 >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Importable Annotations Demo) >>")
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 10,
        "filename": filename,
        "annotations": [
            {
                "type": "highlight",
                "color_rgb": [1.0, 1.0, 0.0],
                "rect": [72, 668, 480, 684],
                "quote": "This paragraph contains a yellow highlight"
            },
            {
                "type": "text_note",
                "color_rgb": [0.2, 0.8, 0.2],
                "rect": [500, 635, 520, 655],
                "contents": "Review this section before submitting draft."
            }
        ]
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 11: Corrupt / Truncated PDF (Failure handling)
# ==============================================================================
def generate_11_corrupt_truncated():
    filename = "11_corrupt_truncated.pdf"
    golden_name = "11_corrupt_truncated.golden.json"
    print(f"Generating {filename} (Corrupted/truncated file)...")

    # Generate a half-written PDF stream missing trailer and EOF
    corrupt_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 200 >>\nstream\nBT /F1 12 Tf 72 700 Td (Truncated stream abruptly ends..."
        # Intentionally missing stream closure, xref table, trailer, and %%EOF
    )

    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(corrupt_bytes)

    golden = {
        "fixture_id": 11,
        "filename": filename,
        "is_valid": False,
        "expected_behavior": "Graceful error toast in UI; no crash; categorized as unreadable."
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


# ==============================================================================
# FIXTURE 12: No outline (Generated outline testing)
# ==============================================================================
def generate_12_no_outline():
    filename = "12_no_outline.pdf"
    golden_name = "12_no_outline.golden.json"
    print(f"Generating {filename} (No outline dictionary)...")

    b = SimplePdfBuilder()
    fonts = create_standard_fonts(b)
    res_str = make_resource_dict(fonts)

    pages_id = b.allocate_id()
    catalog_id = b.allocate_id()
    info_id = b.allocate_id()

    page_ids = []
    # 3 Pages with clear visual headings (H1 at 18pt, H2 at 14pt) but NO /Outlines dictionary in the PDF
    headings_meta = []

    for i in range(1, 4):
        p_id = b.allocate_id()
        page_ids.append(p_id)
        c_id = b.allocate_id()

        h1 = f"Section {i}: Cognitive Principles of Information Density"
        h2 = f"Section {i}.1: Typographic Visual Hierarchy"
        headings_meta.append({"page_index": i-1, "title": h1, "level": 1, "font_size": 18})
        headings_meta.append({"page_index": i-1, "title": h2, "level": 2, "font_size": 14})

        s = (
            f"BT /F2 18 Tf 72 710 Td {escape_pdf_string(h1)} Tj ET\n"
            f"BT /F2 14 Tf 72 660 Td {escape_pdf_string(h2)} Tj ET\n"
            "BT /F1 10 Tf 72 620 Td 14 TL (By examining the font scale distribution across pages, the outline heuristics engine) ' "
            "(identifies major section dividers even when the source document omitted the TOC dictionary.) ' ET\n"
        ).encode("latin1")

        b.add_stream(c_id, {}, s)
        b.add_object(p_id, f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources {res_str} /Contents {c_id} 0 R >>".encode("latin1"))

    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
    b.add_object(pages_id, f"<< /Type /Pages /Kids [{kids_str}] /Count 3 >>".encode("latin1"))
    b.add_object(info_id, b"<< /Title (Document Without Embedded Outlines) >>")
    # Deliberately omit /Outlines in Catalog:
    b.add_object(catalog_id, f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("latin1"))

    pdf_bytes = b.build_bytes(catalog_id, info_id)
    with open(os.path.join(OUTPUT_DIR, filename), "wb") as f:
        f.write(pdf_bytes)

    golden = {
        "fixture_id": 12,
        "filename": filename,
        "has_outline_dictionary": False,
        "expected_heuristics_outline": headings_meta
    }
    with open(os.path.join(OUTPUT_DIR, golden_name), "w", encoding="utf-8") as f:
        json.dump(golden, f, indent=2)


def main():
    print("=" * 60)
    print("Folio Test Corpus Generator (Step 0.1)")
    print(f"Target directory: {OUTPUT_DIR}")
    print("=" * 60)

    generate_01_single_column_300p()
    generate_02_two_column_paper()
    generate_03_textbook_figures_tables()
    generate_04_scanned_book()
    generate_05_mixed_text_and_scan()
    generate_06_rotated_and_cropped()
    generate_07_thousand_page_book()
    generate_08_math_and_code()
    generate_09_password_protected()
    generate_10_existing_annotations()
    generate_11_corrupt_truncated()
    generate_12_no_outline()

    print("=" * 60)
    print("All 12 test fixtures and companion .golden.json files successfully generated!")
    print("=" * 60)


if __name__ == "__main__":
    main()
