"""Compare compiled pages with reference pages as parsed HTML documents.

The upstream compiler re-serializes HTML (attribute quoting, void-element
syntax, whitespace), so the comparison parses both files and compares
element names, attributes and non-whitespace text.

usage: python3 compare-pages.py REFERENCE_DIRECTORY COMPILED_DIRECTORY
"""

import difflib
import pathlib
import sys

import html5lib


def outline(path):
    document = html5lib.parse(path.read_bytes(), treebuilder="etree", namespaceHTMLElements=False)
    lines = []

    def text(value, depth):
        if value:
            lines.extend(f"{'  ' * depth}| {line.strip()}" for line in value.splitlines() if line.strip())

    def walk(element, depth):
        attributes = " ".join(f"{name}={value!r}" for name, value in sorted(element.attrib.items()))
        lines.append(f"{'  ' * depth}<{element.tag} {attributes}>")
        text(element.text, depth)
        for child in element:
            if isinstance(child.tag, str):
                walk(child, depth + 1)
            text(child.tail, depth)

    walk(document, 0)
    return lines


reference, compiled = map(pathlib.Path, sys.argv[1:3])
pages = sorted(path.name for path in reference.glob("*.htm"))
if not pages:
    sys.exit(f"No pages in {reference}")
failed = []
for name in pages:
    diff = list(difflib.unified_diff(outline(reference / name), outline(compiled / name), lineterm="", n=1))
    if diff:
        failed.append(name)
        print("\n".join(diff[:40]))
print(f"{len(pages) - len(failed)}/{len(pages)} pages match")
sys.exit(1 if failed else 0)
