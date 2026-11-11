# Product screenshot provenance (English and Chinese)

Captured on 23 September 2026 from the installed AI WorkDeck **0.46.0** production frontend. These are screenshots of the real application components, not illustrations or reconstructed interface mockups.

## Isolation and source

The source was the installed desktop package's `Contents/Resources/frontend/dist/build/h5` directory. Its files were served read-only from a separate loopback HTTP server. Chrome used a new, isolated profile, with `awd_app_language` set to `en-US` before the application loaded. A minimal host bridge supplied the loopback API URL and a no-op external-link handler, following the application's existing whole-app browser test approach.

The user's application profile, backend, projects, credentials, and software source tree were not changed. Browser requests outside the demonstration server were blocked. The temporary server and browser were shut down after capture.

## Demonstration data

The local API supplied a fictional project named **Northstar Research · Demo**, containing four Markdown files: Research brief, Source notes, Review checklist, and Meeting notes. The displayed document explicitly says **Demonstration project · Synthetic content** and explains that the names and materials are fictional. Its sample review table covers scope, ownership, and access questions for a knowledge-sharing programme.

The original `hero-dashboard-en.png` capture shows the actual file explorer, Markdown preview and AI assistant. The later litigation Hero pair is described separately below. The assistant contains this unsent prompt:

> List the open questions in this brief and group them by review priority.

The prompt was never submitted. No model was invoked, and no AI answer or completed operation was fabricated.

The Extensions image uses the actual sidebar and Skill detail components. Its local API provides three fixture entries: **Demo · Review checklist**, **Demo · Source notes**, and **Demo · Meeting brief**. Their descriptions identify them as synthetic demonstration entries. They were not published, installed, or executed. The unmodified component's standard marketplace source label is not evidence that these sample entries are actual signed listings; use the website caption to identify the image as an interface demonstration with sample data.

## Assets and capture geometry

The original assets are native browser screenshots at a device scale factor of 2. The two HD Hero assets added later on the same day use a device scale factor of 3. No interface pixels were repainted, enlarged, or translated after capture.

| Asset | Raster size | Native capture |
| --- | --- | --- |
| `public/images/hero-dashboard-en.png` | 3200 × 2000 | Original full 1600 × 1000 CSS-pixel viewport, DPR 2 |
| `public/images/hero-litigation-en-hd.png` | 4800 × 3000 | Full 1600 × 1000 CSS-pixel viewport, DPR 3; English litigation workspace |
| `public/images/hero-litigation-zh-hd.png` | 4800 × 3000 | Full 1600 × 1000 CSS-pixel viewport, DPR 3; Chinese litigation workspace |
| `public/images/feature-agent-en.png` | 1140 × 1520 | Clip x=1030, y=35, width=570, height=760 |
| `public/images/feature-workspace-en.png` | 2480 × 1700 | Clip x=0, y=0, width=1240, height=850 |
| `public/images/feature-plugins-en.png` | 2500 × 940 | From a 1400 × 900 viewport: clip x=45, y=40, width=1250, height=470 |

## Reproduction and verification

1. Serve the installed production frontend on an unused loopback port using an isolated browser profile.
2. Set `awd_app_language=en-US` before loading the application; inject only the local API origin through the supported host bridge.
3. Return the synthetic project/file metadata from the projects endpoints and the synthetic Markdown text from the file download endpoint. Keep member, plugin, account and conversation responses local. Block all non-local browser requests.
4. Open the workbench route, select Research brief, switch its real Markdown editor to Preview, and open the AI Assistant. Type the sample prompt without sending it.
5. Capture the viewport and the assistant/workspace clips at the geometry above.
6. For Extensions, return the three visibly labelled sample entries from the skill marketplace endpoint, open Extensions, and select the review-checklist entry without installing it. Capture the specified upper-content clip.
7. Inspect every image for English UI, readable demo labels, absence of personal data, and crop boundaries; then close the isolated browser and server.

The final images were visually inspected. These screenshots demonstrate interface presentation with synthetic data; they do not validate live model inference, installation, or backend document processing.

## HD bilingual litigation Hero capture (23 September 2026)

The final Hero pair uses a fictional contract dispute: **远帆科技诉澄川贸易｜买卖合同纠纷 · 演示** and **Meridian v. Harbor · Contract dispute · Demo**. It replaces the early HD Markdown research fixture with a genuine Word document and varied case-file metadata. The original `hero-dashboard.png` and `hero-dashboard-en.png` remain unchanged. New `hero-litigation-*-hd.png` filenames prevent old optimized-image caches from serving the earlier composition.

The main documents, **民事起诉状（修订稿）.docx** and **Draft complaint — revised.docx**, were generated as actual OOXML DOCX packages with docx-js. Their text identifies the parties, events and figures as fictional demonstration material and states that the draft is not a real case or filing template. ZIP integrity and all 18 XML/relationship parts were checked; the installed application's real LOWA Writer engine loaded each file successfully (`success: true`, `kind: writer`). The skill's separate schema validator could not run because its Python environment lacked `defusedxml`; no schema-validation pass is claimed.

The source is the unmodified installed **AI WorkDeck 0.46.0** production frontend and its bundled `dist/zetaoffice` runtime. A read-only loopback server serves those assets with COOP/COEP headers and the package's Brotli encoding declarations; `/api/files/801/download` supplies the generated DOCX bytes. A minimal host bridge returns the existing iframe editor descriptor. The normal application component, toolbar, document loader and WASM renderer produce the Word interface. No Markdown file was renamed to DOCX, no interface DOM was reconstructed, and no screenshot pixels were edited.

Each language uses a fresh isolated browser profile with the real application locale (`en-US` or `zh-CN`). Only synthetic API responses are supplied, external page requests are blocked, and neither the user's profile nor their projects or backend is accessed. The local fixture provides an actual folder node with parent-child relationships, displayed expanded by the application's own file-tree expansion method:

| Chinese case-file entry | English case-file entry |
| --- | --- |
| 民事起诉状（修订稿）.docx | Draft complaint — revised.docx |
| 证据目录与举证说明.docx | Evidence index.docx |
| 货款及逾期利息测算.xlsx | Principal and interest.xlsx |
| 庭审汇报与争议焦点.pptx | Hearing brief.pptx |
| 购销合同及补充协议.pdf | Supply agreement & addendum.pdf |
| 送货签收单（2025-11-18）.png | Delivery receipt (2025-11-18).png |
| 微信沟通记录（节选）.pdf | Correspondence extracts.pdf |
| 手机采集 · 仓库现场 / 仓库现场（02-08）.mp4 | Mobile capture · Warehouse visit / Warehouse visit (02-08).mp4 |
| 手机采集 · 仓库现场 / 货物外包装（02-08）.png | Mobile capture · Warehouse visit / Goods packaging (02-08).png |
| 手机采集 · 仓库现场 / 现场情况说明（02-08）.wav | Mobile capture · Warehouse visit / Site notes (02-08).wav |

Only the selected complaint is a generated and opened document. The remaining entries are synthetic file metadata: this image does not prove those files were opened, recorded, transferred from a phone, or processed. The date abbreviated as `02-08` represents the fictional warehouse visit on 8 February 2026.

The AI assistant contains an **unsent** prompt, respectively:

> 请结合合同、签收单与沟通记录，梳理本案争议焦点和待补充证据。

> Review the agreement, delivery receipt and correspondence. Identify disputed issues and missing evidence.

No model is configured or invoked, and no AI answer is fabricated. This historical capture retained one Chinese **语义补全** function label. On 28 September, the active English homepage was switched to `hero-workspace-en-native.png`, captured from the current native English client without that label. See `workspace-tour.md` for provenance; the old image is no longer referenced by the homepage.

### Geometry and capture verification

Both screenshots are native **4800 × 3000 PNGs**, captured at **1600 × 1000 CSS pixels**, **DPR 3**, **8:5**. The file tree is resized through the real divider before the Word document loads. Its CSS bounds are **x=51, y=80, width=340, height=893**. The Word iframe bounds are **x=392, y=119, width=848, height=854**: the document region begins at **24.5%** of image width, ends at **77.5%**, and starts at **11.9%** of image height. The native toolbar occupies approximately **y=80–119** above it.

Capture in the same browser session that establishes DPR 3, after the Writer load-success event and settled paint, without later resetting the viewport. In this environment, reconnecting with a null viewport could reduce output to CSS-pixel resolution; resetting DPR on a running Writer canvas could also leave a stale, offset gray frame. Those failed captures were discarded. The final pair was produced by setting the sidebar width and folder state **before** opening Word, then capturing without further viewport changes.

Both final images were opened and visually inspected for the correctly positioned white document page, readable file extensions, expanded mobile-capture folder, native toolbar, visible fictional-content notice and unsent prompt. PNG headers independently confirm 4800 × 3000. File sizes are **790,026 bytes (English)** and **1,132,690 bytes (Chinese)**. The isolated browsers and loopback server were stopped after capture. This is interface-presentation verification with synthetic data, not a test of model output, mobile transfer, media playback or production document storage.
