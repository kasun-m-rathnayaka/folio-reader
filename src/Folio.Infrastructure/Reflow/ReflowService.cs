using Folio.Application.OCR;
using Folio.Application.Reflow;
using Folio.Domain.OCR;
using UglyToad.PdfPig;

namespace Folio.Infrastructure.Reflow;

/// <summary>
/// Continuous responsive document reflow engine (FR-RFL-01..05, §8.4).
/// Reconstructs linear flowing document model with cross-mode anchor synchronization.
/// </summary>
public class ReflowService : IReflowService
{
    private readonly IOcrService _ocrService;

    public ReflowService(IOcrService ocrService)
    {
        _ocrService = ocrService;
    }

    public async Task<ReflowDocument> BuildReflowDocumentAsync(Guid bookId, string pdfPath, CancellationToken ct = default)
    {
        if (!File.Exists(pdfPath))
        {
            throw new FileNotFoundException($"PDF file not found at {pdfPath}");
        }

        var blocks = new List<ReflowBlock>();
        int globalOffset = 0;
        int totalWords = 0;

        using var pdfDoc = PdfDocument.Open(pdfPath);
        for (int i = 1; i <= pdfDoc.NumberOfPages; i++)
        {
            int pageIndex = i - 1;
            var page = pdfDoc.GetPage(i);
            var words = page.GetWords().ToList();

            if (words.Count < 5 && page.GetImages().Any())
            {
                // Scanned page fallback: perform in-process Windows OCR
                try
                {
                    var ocrResult = await _ocrService.RecognizePageAsync(pdfPath, pageIndex, ct);
                    if (!string.IsNullOrWhiteSpace(ocrResult.FullText))
                    {
                        var paras = ocrResult.FullText.Split(new[] { "\r\n\r\n", "\n\n" }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (var p in paras)
                        {
                            string trimmed = p.Trim();
                            if (!string.IsNullOrEmpty(trimmed))
                            {
                                blocks.Add(new ReflowBlock(ReflowBlockKind.Paragraph, trimmed, pageIndex, globalOffset));
                                globalOffset += trimmed.Length + 2;
                                totalWords += trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
                            }
                        }
                    }
                }
                catch { }
            }
            else
            {
                // Native vector page extraction
                var pageText = string.Join(" ", words.Select(w => w.Text));
                if (!string.IsNullOrWhiteSpace(pageText))
                {
                    // Detect headings vs paragraphs based on word count / length
                    var rawParas = pageText.Split(new[] { ". ", ".\n" }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var p in rawParas)
                    {
                        string trimmed = p.Trim();
                        if (string.IsNullOrEmpty(trimmed)) continue;

                        var kind = (trimmed.Length < 60 && !trimmed.EndsWith('.'))
                            ? ReflowBlockKind.Heading2
                            : ReflowBlockKind.Paragraph;

                        blocks.Add(new ReflowBlock(kind, trimmed, pageIndex, globalOffset));
                        globalOffset += trimmed.Length + 2;
                        totalWords += trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
                    }
                }
            }
        }

        return new ReflowDocument(bookId, blocks, totalWords);
    }

    public int MapReflowOffsetToPageIndex(ReflowDocument doc, int characterOffset)
    {
        if (doc.Blocks.Count == 0) return 0;

        var block = doc.Blocks.LastOrDefault(b => b.GlobalCharOffset <= characterOffset)
            ?? doc.Blocks.First();

        return block.PageIndex;
    }

    public int MapPageToReflowOffset(ReflowDocument doc, int pageIndex, double offsetPercent)
    {
        var pageBlocks = doc.Blocks.Where(b => b.PageIndex == pageIndex).ToList();
        if (pageBlocks.Count == 0)
        {
            var closest = doc.Blocks.OrderBy(b => Math.Abs(b.PageIndex - pageIndex)).FirstOrDefault();
            return closest?.GlobalCharOffset ?? 0;
        }

        int targetIdx = (int)Math.Clamp(Math.Round(pageBlocks.Count * offsetPercent), 0, pageBlocks.Count - 1);
        return pageBlocks[targetIdx].GlobalCharOffset;
    }
}
