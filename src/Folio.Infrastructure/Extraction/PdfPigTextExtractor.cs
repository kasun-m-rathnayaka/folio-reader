using Folio.Application.Common.Interfaces;
using Folio.Domain.Geometry;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace Folio.Infrastructure.Extraction;

/// <summary>
/// Headless text extraction and layout line clustering using UglyToad.PdfPig.
/// Maps all geometry into normalized visible page space [0.0, 1.0].
/// </summary>
public class PdfPigTextExtractor : IPdfTextExtractor
{
    public Task<ExtractedMetadata> ExtractMetadataAsync(string pdfPath, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(pdfPath))
        {
            throw new FileNotFoundException($"PDF file not found: {pdfPath}", pdfPath);
        }

        using var document = PdfDocument.Open(pdfPath);
        var info = document.Information;

        DateTimeOffset? creationDate = null;
        if (!string.IsNullOrWhiteSpace(info.CreationDate) &&
            DateTimeOffset.TryParse(info.CreationDate, out var parsedDate))
        {
            creationDate = parsedDate;
        }

        var metadata = new ExtractedMetadata(
            Title: string.IsNullOrWhiteSpace(info.Title) ? null : info.Title.Trim(),
            Author: string.IsNullOrWhiteSpace(info.Author) ? null : info.Author.Trim(),
            PageCount: document.NumberOfPages,
            CreationDate: creationDate);

        return Task.FromResult(metadata);
    }

    public Task<ExtractedPage> ExtractPageAsync(string pdfPath, int pageIndex, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(pdfPath))
        {
            throw new FileNotFoundException($"PDF file not found: {pdfPath}", pdfPath);
        }

        using var document = PdfDocument.Open(pdfPath);
        if (pageIndex < 0 || pageIndex >= document.NumberOfPages)
        {
            throw new ArgumentOutOfRangeException(nameof(pageIndex), $"Page index {pageIndex} is out of range [0, {document.NumberOfPages - 1}].");
        }

        var page = document.GetPage(pageIndex + 1);
        var dimensions = new PageDimensions(page.Width, page.Height, (int)page.Rotation.Value);
        var extractedLines = ExtractAndClusterLines(page, dimensions);

        string plainText = string.Join("\n", extractedLines.Select(l => l.Text));
        var result = new ExtractedPage(pageIndex, dimensions, extractedLines, plainText);

        return Task.FromResult(result);
    }

    public Task<IReadOnlyList<ExtractedPage>> ExtractAllPagesAsync(
        string pdfPath,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(pdfPath))
        {
            throw new FileNotFoundException($"PDF file not found: {pdfPath}", pdfPath);
        }

        using var document = PdfDocument.Open(pdfPath);
        int totalPages = document.NumberOfPages;
        var pages = new List<ExtractedPage>(totalPages);

        for (int p = 0; p < totalPages; p++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var page = document.GetPage(p + 1);
            var dimensions = new PageDimensions(page.Width, page.Height, (int)page.Rotation.Value);
            var extractedLines = ExtractAndClusterLines(page, dimensions);
            string plainText = string.Join("\n", extractedLines.Select(l => l.Text));

            pages.Add(new ExtractedPage(p, dimensions, extractedLines, plainText));
            progress?.Report((double)(p + 1) / totalPages);
        }

        return Task.FromResult<IReadOnlyList<ExtractedPage>>(pages);
    }

    private static IReadOnlyList<ExtractedLine> ExtractAndClusterLines(Page page, PageDimensions dimensions)
    {
        var rawWords = page.GetWords().ToList();
        if (rawWords.Count == 0)
        {
            return Array.Empty<ExtractedLine>();
        }

        // Sort words by baseline (Y descending in PDF space), then X ascending
        var sortedWords = rawWords
            .OrderByDescending(w => w.BoundingBox.Bottom)
            .ThenBy(w => w.BoundingBox.Left)
            .ToList();

        var lines = new List<ExtractedLine>();
        var currentCluster = new List<Word>();
        double currentBaseline = sortedWords[0].BoundingBox.Bottom;

        foreach (var word in sortedWords)
        {
            bool sameBaseline = Math.Abs(word.BoundingBox.Bottom - currentBaseline) <= 4.0;
            // Prevent gutter bridging (> 15pt gap separates columns)
            bool largeGutterGap = currentCluster.Count > 0 &&
                                  (word.BoundingBox.Left - currentCluster.Last().BoundingBox.Right > 15.0);

            if (sameBaseline && !largeGutterGap)
            {
                currentCluster.Add(word);
            }
            else
            {
                if (currentCluster.Count > 0)
                {
                    lines.Add(CreateExtractedLine(currentCluster, dimensions));
                    currentCluster.Clear();
                }
                currentCluster.Add(word);
                currentBaseline = word.BoundingBox.Bottom;
            }
        }

        if (currentCluster.Count > 0)
        {
            lines.Add(CreateExtractedLine(currentCluster, dimensions));
        }

        return lines;
    }

    private static ExtractedLine CreateExtractedLine(List<Word> words, PageDimensions dimensions)
    {
        var sorted = words.OrderBy(w => w.BoundingBox.Left).ToList();
        string text = string.Join(" ", sorted.Select(w => w.Text));

        var extractedWords = new List<ExtractedWord>(sorted.Count);
        foreach (var w in sorted)
        {
            var wordRect = CoordinateTransformer.PdfRectToNormalized(
                w.BoundingBox.Left,
                w.BoundingBox.Bottom,
                w.BoundingBox.Right,
                w.BoundingBox.Top,
                dimensions);
            extractedWords.Add(new ExtractedWord(w.Text, wordRect));
        }

        double minLeft = sorted.Min(w => w.BoundingBox.Left);
        double maxTop = sorted.Max(w => w.BoundingBox.Top);
        double maxRight = sorted.Max(w => w.BoundingBox.Right);
        double minBottom = sorted.Min(w => w.BoundingBox.Bottom);

        var lineRect = CoordinateTransformer.PdfRectToNormalized(
            minLeft,
            minBottom,
            maxRight,
            maxTop,
            dimensions);

        return new ExtractedLine(text, lineRect, extractedWords);
    }
}
