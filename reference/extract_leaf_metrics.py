#!/usr/bin/env python3
"""Extract Leaf/e-NV200 metrics from OVMS user manual"""

from pdfminer.high_level import extract_pages, extract_text
from pdfminer.layout import LTTextContainer
import re

# Read the PDF
pdf_path = "OVMS-31-5360A.User-Manual-4313223.pdf"

# First get full text to count pages
full_text = extract_text(pdf_path)

# Extract page by page
pages_text = []
for page_layout in extract_pages(pdf_path):
    page_text = ""
    for element in page_layout:
        if isinstance(element, LTTextContainer):
            page_text += element.get_text()
    pages_text.append(page_text)

print(f"Total pages: {len(pages_text)}\n")
print("="*80)

# Search for Leaf/e-NV200 related content
leaf_pages = []
appendix_pages = []

for page_num, text in enumerate(pages_text, start=1):
    # Look for Leaf/e-NV200 mentions
    if re.search(r'(leaf|e-?nv200|nissan)', text, re.IGNORECASE):
        leaf_pages.append((page_num, text))

    # Look for appendix sections
    if re.search(r'(appendix|table.*metric|feature.*table)', text, re.IGNORECASE):
        appendix_pages.append((page_num, text))

print(f"\nFound {len(leaf_pages)} pages mentioning Leaf/e-NV200")
print(f"Found {len(appendix_pages)} pages with appendix/table content\n")

# Find pages that are both
relevant_pages = set([p[0] for p in leaf_pages]) & set([p[0] for p in appendix_pages])
print(f"Pages with both Leaf AND appendix/table content: {sorted(relevant_pages)}\n")
print("="*80)

# Extract appendix tables for Leaf
print("\n### SEARCHING FOR LEAF/E-NV200 FEATURE TABLES ###\n")

for page_num, text in leaf_pages:
    # Look for metric/command references
    if re.search(r'(metric|command|v\.(b|c|e|p|t|m)|xnl\.|xrt\.)', text, re.IGNORECASE):
        print(f"\n{'='*80}")
        print(f"PAGE {page_num} - Contains Leaf + Metrics/Commands")
        print(f"{'='*80}")

        # Extract lines with metrics
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if re.search(r'(metric|command|v\.(b|c|e|p|t|m)|xnl\.|xrt\.)', line, re.IGNORECASE):
                # Print context (2 lines before and after)
                start = max(0, i-2)
                end = min(len(lines), i+3)
                context = lines[start:end]
                print('\n'.join(context))
                print('-'*40)

# Also save full text for manual searching
with open('ovms-manual-full-text.txt', 'w', encoding='utf-8') as f:
    for page_num, text in enumerate(pages_text, start=1):
        f.write(f"\n{'='*80}\n")
        f.write(f"PAGE {page_num}\n")
        f.write(f"{'='*80}\n")
        f.write(text)
        f.write('\n\n')

print("\n\n" + "="*80)
print("Full text saved to: ovms-manual-full-text.txt")
print("="*80)
