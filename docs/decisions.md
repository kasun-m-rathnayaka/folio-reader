# Folio — Architecture & Engineering Decision Log (`decisions.md`)

This log records architectural, structural, and implementation decisions for the **Folio** desktop PDF reader and library application.

---

## ADR-001: Reference Target and Execution Environment
- **Status:** Accepted (confirmed)
- **Context:** The application is aimed at high-performance reading and local intelligence on modern Windows devices.
- **Decision:** Target Windows 11 x64, with primary reference hardware calibrated for an Intel Core i7-1370P CPU-only environment (64 GB RAM, discrete GPU optional/not relied upon).
- **Consequences:** All performance, memory, and AI inference budgets (Kokoro TTS, `llama-server` sidecar) are measured and optimized for CPU execution.

---

## ADR-002: Reading Presentation & Layout Defaults
- **Status:** Accepted (confirmed by user)
- **Context:** The product specification defines both exact page layout and dynamic text reflow modes.
- **Decision:** 
  1. Branding is confirmed as **Folio**.
  2. Reflow mode defaults to **continuous scrolling** rather than paginated snapped columns.
  3. LLM-assisted "Smart cleanup" during text-to-speech narration is **enabled by default** (with strict fallback guardrails).
- **Consequences:** The reflow engine focuses on smooth vertical scrolling with viewport virtualization; the read-aloud pipeline defaults to invoking cleanup on detected messy blocks.

---

## ADR-003: Deterministic Test Corpus Generation (Step 0.1)
- **Status:** Accepted
- **Context:** Milestone M0 requires a test corpus of 12 distinct document profiles (Appendix C of the spec) with machine-readable "golden" validation files for text extraction, column ordering, coordinate transformation, and failure modes.
- **Decision:** Implement a zero-dependency Python 3 standard library generator script (`fixtures/scripts/generate_corpus.py`) that deterministically synthesizes all 12 PDF fixtures and matching `.golden.json` files directly into `fixtures/pdf/`.
- **Alternatives Considered:**
  - *External downloads from internet archives:* Prone to network flakiness, copyright ambiguity, and missing exact ground-truth bounding box metadata.
  - *Third-party Python PDF libraries (`pypdf`, `reportlab`):* Avoided to prevent global toolchain contamination and maintain dependency isolation.
- **Consequences:** Tests can run completely offline in hermetic environments. Ground-truth coordinates and bounding boxes are mathematically exact down to point dimensions.

---

## ADR-004: Clean Architecture Layering & Project Separation
- **Status:** Accepted
- **Context:** Section 7.2 dictates a clean architecture with clear separation between Domain, Application, Infrastructure, AI, Audio, UI, and Native Desktop shell.
- **Decision:**
  - `Folio.Domain`: Zero framework dependencies. Entities, value objects, normalized coordinate anchors.
  - `Folio.Application`: Use cases, CQRS commands/queries, ports (interfaces).
  - `Folio.Infrastructure`: EF Core + SQLite (WAL mode), `PdfPig` extraction, `Windows.Data.Pdf` rasterizer, `Windows.Media.Ocr`.
  - `Folio.AI`: `llama-server` process supervisor, Windows Job Object management, Model Catalog, Kokoro ONNX wrapper.
  - `Folio.Audio`: NAudio WASAPI buffer queue, SMTC media transport controls.
  - `Folio.UI`: Razor Class Library with MudBlazor and custom M3 token stylesheet (`--md-sys-*`).
  - `Folio.Reader.Web`: TypeScript facade over `pdfjs-dist` with viewport virtualization and canvas overlay layers.
  - `Folio.Desktop`: WPF shell hosting `BlazorWebView` with custom virtual host mapping (`https://folio.books/`).
- **Consequences:** Core business logic, text extraction, and database routines are testable headless without needing an active WebView2 instance.

---

## ADR-005: Reader Host, Virtual Host Mapping, and Coordinate Space
- **Status:** Accepted (empirically validated in Spike S1)
- **Context:** Large PDFs cannot be transferred across the JS interop bridge without UI pauses, and annotations risk drifting across display zooms and page rotations.
- **Decision:**
  1. Use WebView2 virtual host mapping (`https://folio.books/` mapped to local storage) to stream PDFs directly to `pdf.js` using HTTP range requests (`206 Partial Content`).
  2. Maintain a strict normalized coordinate space $[0.0, 1.0]$ in visible page space (after rotation and CropBox) using the `PageGeometry` model. All stored annotations use normalized geometry.
  3. Adopt `pdfjs-dist` 6.x inside `BlazorWebView` (WPF) with viewport virtualization ($\pm 2$ pages).
- **Consequences:** Benchmarks proved 145 ms cold open on 300p, 138 ms on 1,000p, 62 FPS average scrolling, and only 131 MB RAM consumption, beating NFR-01 budgets by $7\times$ to $9\times$. Fallback to PDFium is not required.

---

## ADR-006: In-Process Neural TTS Engine and Narration Pipeline
- **Status:** Accepted (empirically validated in Spike S2)
- **Context:** Folio requires offline, natural-sounding read-aloud capabilities (`FR-TTS-01..03`) with word-level highlighting without relying on cloud services or bloated external runtime daemons.
- **Decision:**
  1. Integrate `KokoroSharp.CPU` (Kokoro-82M ONNX) running directly in-process via `Microsoft.ML.OnnxRuntime`.
  2. Implement strict clause chunking ($\le 120$ characters) for the initial audio utterance to guarantee time-to-first-audio $\le 3,000\text{ ms}$ on CPU (measured ~1.4s), followed by asynchronous ring-buffering 1–2 chunks ahead for non-blocking playback ($\text{RTF} = 1.03\times$ FP16).
  3. Pipe synthesized 24 kHz 16-bit mono PCM into NAudio `BufferedWaveProvider` driving WASAPI audio endpoints.
  4. Use sentence-exact chunk boundaries combined with character-ratio duration interpolation for word-highlight visual synchronization.
  5. Enforce an aggressive 5-minute idle disposal policy to release the ONNX engine (+218 MB RAM) back to the OS when reading is paused.
- **Consequences:** High-quality neural narration runs completely offline with zero Python dependencies, modest memory footprint (~218 MB), and responsive startup.

---

## ADR-007: `llama-server` Process Lifecycle & Resource Governor
- **Status:** Accepted (empirically validated in Spike S3)
- **Context:** Folio requires local LLM/VLM execution (`FR-AIR-01..07`) without zombie processes, network exposure, or audio starvation during concurrent reading and text-to-speech narration.
- **Decision:**
  1. Manage `llama-server` as an isolated child process tied to a Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000)`. When the Folio parent process exits or crashes, the OS kernel unconditionally terminates the server process tree.
  2. Enforce loopback isolation: bind exclusively to `127.0.0.1` on a dynamically assigned free port, authenticated via a per-session 128-bit cryptographically random bearer token. Unauthenticated requests are rejected with HTTP 401 Unauthorized.
  3. Enforce the Resource Governor RAM guard before spawning or loading models: verify `GlobalMemoryStatusEx` has $\ge \text{modelRAM} + 2.0\text{ GB}$ free physical RAM.
  4. Implement dynamic thread and priority governance: allocate $\approx \text{cores}/2$ threads by default, and drop server priority to `ProcessPriorityClass.BelowNormal` whenever TTS narration is active to protect audio playback from buffer starvation.
  5. Model weights must be verified against their SHA-256 catalog checksum on download, and support HTTP Range resuming.
- **Consequences:** Measured 57.47 tokens/sec on CPU for Qwen2.5-0.5B (TTFT 269 ms) with 495 MB RAM footprint. Zero zombie processes guaranteed by the Windows kernel.

---

## ADR-008: Document Layout Analysis & Content Classification Engine
- **Status:** Accepted (empirically validated in Spike S4)
- **Context:** Text reflow (`FR-RFL-01`) and read-aloud smart skipping (`FR-TTS-05`) require high-accuracy header/footer exclusion ($\ge 95\%$) and reading order reconstruction without horizontal column interleaving.
- **Decision:**
  1. Adopt `UglyToad.PdfPig` (0.1.16) for headless text extraction, font metrics, and page geometry.
  2. Implement horizontal whitespace gutter detection (> 15 points) during line assembly to prevent cross-column text merging.
  3. Apply normalized margin boundary detection (top/bottom 12%) combined with repetition heuristics across sampled pages to exclude running headers, running footers, and page numbers.
  4. Detect footnotes and citations using regex pattern classifiers and font-size differential rules.
- **Consequences:** Measured 192.2 pages/sec extraction throughput on a 300-page book with 100% header/footer recall, 100% multi-column reading order accuracy, and resilient error recovery on corrupt documents. No native C++ PDF library is needed for document text analysis.





