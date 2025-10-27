# LaTeX Report Compilation Guide

## Quick Start

### Fast Compilation (Recommended)

```bash
# Create cache directory
mkdir -p tikz-cache

# Compile with caching (requires -shell-escape)
pdflatex -shell-escape endtoendreport.tex
pdflatex -shell-escape endtoendreport.tex  # Run twice for TOC/references

# Output: endtoendreport.pdf
```

**Performance:**
- First compile: ~30-45 seconds (generates diagram cache)
- Subsequent compiles: **5-10 seconds** (reuses cached diagrams)

### Online Editors (Overleaf, etc.)

If you **cannot use `-shell-escape`**:

1. **Remove externalization lines** (lines 19-23):
   ```latex
   % Comment out or delete these lines:
   % \usetikzlibrary{external}
   % \tikzexternalize[prefix=tikz-cache/]
   ```

2. **Compile normally:**
   ```bash
   pdflatex endtoendreport.tex
   pdflatex endtoendreport.tex
   ```
   - Compilation time: ~45-60 seconds

### Draft Mode (For Editing Text)

Add `draft` option to documentclass for super-fast compilation:

```latex
\documentclass[12pt,a4paper,draft]{article}
```

This disables diagram rendering (shows placeholders).

## Compilation Commands Reference

### Standard LaTeX Workflow

```bash
# Full compilation with bibliography
pdflatex -shell-escape endtoendreport.tex
bibtex endtoendreport
pdflatex -shell-escape endtoendreport.tex
pdflatex -shell-escape endtoendreport.tex
```

### Using latexmk (Automated)

```bash
latexmk -pdf -shell-escape endtoendreport.tex
```

### Clean Build Files

```bash
rm -f *.aux *.log *.out *.toc *.bbl *.blg
rm -rf tikz-cache/
```

## Performance Optimizations

### What Makes This Fast?

1. **TikZ Externalization:** Compiles each diagram once, caches as PDF
2. **Simplified Sequence Diagram:** Uses `yshift` instead of calc library
3. **Optimized Spacing:** Tighter section spacing reduces page count

### Troubleshooting

**Problem:** `! I can't write on file 'tikz-cache/...'`
- **Solution:** Create directory: `mkdir tikz-cache`

**Problem:** `! Package tikz Error: Sorry, the system call ... did not succeed`
- **Solution:** Use `-shell-escape` flag or disable externalization

**Problem:** Compilation still slow (60+ seconds)
- **Solution:** Check if tikz-cache/ directory exists and contains .pdf files
- **Verify:** You're using `-shell-escape` flag

**Problem:** Diagrams look wrong or missing
- **Solution:** Delete `tikz-cache/` and recompile from scratch

## File Structure

```
.
├── endtoendreport.tex          # Main LaTeX file
├── endtoendreport.pdf          # Output PDF
├── tikz-cache/                 # Generated diagram cache (auto-created)
│   ├── endtoendreport-figure0.pdf
│   ├── endtoendreport-figure1.pdf
│   └── ...
└── COMPILE_REPORT.md          # This file
```

## System Requirements

- **TeX Distribution:** TeX Live 2020+ or MiKTeX
- **Required Packages:** tikz, xcolor, listings, booktabs, etc. (auto-installed)
- **Shell Access:** Required for `-shell-escape` (externalization)

## Academic Submission

For final submission, generate PDF with:

```bash
# Clean build
rm -rf tikz-cache/ *.aux *.log *.out *.toc

# Compile fresh
pdflatex -shell-escape endtoendreport.tex
pdflatex -shell-escape endtoendreport.tex

# Submit: endtoendreport.pdf
```

**Page count:** ~15 pages
**File size:** ~200-300 KB

---

**Questions?** See LaTeX documentation or contact: [your-email]
