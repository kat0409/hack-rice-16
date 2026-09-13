"""Parser tests (design-doc.md §18.1: "chunk boundary and metadata retention").

The PDF and DOCX tests build real files with the same libraries the parser reads
them with. That is deliberate: those code paths had never executed before these
tests existed, and a fixture file checked into the repo would not prove the
page-number and heading extraction actually works.
"""

from __future__ import annotations

import pytest

from graphite.parse import ParseError, normalize, parse_file


class TestNormalize:
    def test_repairs_hyphenated_line_breaks(self):
        assert "recursion" in normalize("recur-\nsion")

    def test_preserves_genuine_hyphens(self):
        assert normalize("in-order traversal") == "in-order traversal"

    def test_collapses_horizontal_whitespace_only(self):
        # Blank lines separate paragraphs and must survive.
        assert normalize("a    b\n\nc") == "a b\n\nc"

    def test_collapses_excess_blank_lines(self):
        assert normalize("a\n\n\n\n\nb") == "a\n\nb"

    def test_normalizes_unicode_forms(self):
        # NFKC folds a non-breaking space to a regular one.
        assert normalize("a b") == "a b"


class TestMarkdown:
    def test_builds_nested_section_path(self, tmp_path):
        f = tmp_path / "n.md"
        f.write_text("# Lecture 1\n\n## Binary Search\n\nIt halves the range.\n")

        blocks = parse_file(f).blocks
        assert len(blocks) == 1
        assert blocks[0].section_path == "Lecture 1 > Binary Search"

    def test_sibling_heading_pops_the_stack(self, tmp_path):
        f = tmp_path / "n.md"
        f.write_text(
            "# L\n\n## A\n\nalpha text\n\n## B\n\nbeta text\n"
        )
        paths = [b.section_path for b in parse_file(f).blocks]
        assert paths == ["L > A", "L > B"]

    def test_hash_inside_code_fence_is_not_a_heading(self, tmp_path):
        f = tmp_path / "n.md"
        f.write_text("# Real\n\n```python\n# just a comment\nx = 1\n```\n")

        blocks = parse_file(f).blocks
        # The comment must not have opened a new section.
        assert all(b.section_path == "Real" for b in blocks)
        assert any("x = 1" in b.text for b in blocks)

    def test_empty_file_raises_parse_empty(self, tmp_path):
        f = tmp_path / "n.md"
        f.write_text("   \n\n  \n")
        with pytest.raises(ParseError) as exc:
            parse_file(f)
        assert exc.value.code == "PARSE_EMPTY"


class TestPdf:
    def test_extracts_text_with_page_numbers(self, tmp_path):
        pymupdf = pytest.importorskip("pymupdf")

        doc = pymupdf.open()
        for text in ("Array indexing is constant time.", "Binary search halves."):
            page = doc.new_page()
            page.insert_text((72, 72), text)
        f = tmp_path / "n.pdf"
        doc.save(f)
        doc.close()

        parsed = parse_file(f)
        assert parsed.page_count == 2
        assert {b.page for b in parsed.blocks} == {1, 2}
        assert any("Array indexing" in b.text for b in parsed.blocks)

    def test_pdf_without_text_raises_parse_empty(self, tmp_path):
        pymupdf = pytest.importorskip("pymupdf")

        doc = pymupdf.open()
        doc.new_page()  # blank page, i.e. what a scan looks like to the parser
        f = tmp_path / "scan.pdf"
        doc.save(f)
        doc.close()

        with pytest.raises(ParseError) as exc:
            parse_file(f)
        assert exc.value.code == "PARSE_EMPTY"


class TestDocx:
    def test_extracts_headings_as_section_path(self, tmp_path):
        docx = pytest.importorskip("docx")

        d = docx.Document()
        d.add_heading("Lecture 2", level=1)
        d.add_heading("Recursion", level=2)
        d.add_paragraph("A function that calls itself.")
        f = tmp_path / "n.docx"
        d.save(f)

        blocks = parse_file(f).blocks
        assert len(blocks) == 1
        assert blocks[0].section_path == "Lecture 2 > Recursion"
        assert "calls itself" in blocks[0].text


def test_unsupported_extension_is_rejected(tmp_path):
    f = tmp_path / "notes.pages"
    f.write_text("x")
    with pytest.raises(ParseError) as exc:
        parse_file(f)
    assert exc.value.code == "UNSUPPORTED_FILE_TYPE"
