using Folio.Application.Common.Interfaces;
using Folio.Domain.Geometry;

namespace Folio.Platform.Browser;

/// <summary>
/// Text and metadata from PDF.js, reading PDFs straight from OPFS. PdfPig in WebAssembly indexed the 300-page fixture in
/// about 18 s against the spec's 10 s budget, so the web uses PDF.js text content instead (SPEC M2 step 3; D-008).
/// Pages carry plain text only, which is all library search stores.
/// </summary>
public sealed class BrowserPdfTextExtractor(BrowserJs js, OpfsFileStore files) : IPdfTextExtractor
{
    private sealed record Metadata(string? Title, string? Author, int PageCount, double Width, double Height);
    private sealed record PageText(string Text, double Width, double Height);

    public async Task<ExtractedMetadata> ExtractMetadataAsync(string pdfPath, CancellationToken cancellationToken = default)
    {
        var meta = await js.InvokeAsync<Metadata>("pdfMetadata", files.Relative(pdfPath));
        return new ExtractedMetadata(Clean(meta.Title), Clean(meta.Author), meta.PageCount, null);
    }

    public async Task<ExtractedPage> ExtractPageAsync(string pdfPath, int pageIndex, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var page = await js.InvokeAsync<PageText>("pdfPageText", files.Relative(pdfPath), pageIndex);
        return new ExtractedPage(pageIndex, new PageDimensions(page.Width, page.Height), [], page.Text);
    }

    public async Task<IReadOnlyList<ExtractedPage>> ExtractAllPagesAsync(string pdfPath, IProgress<double>? progress = null, CancellationToken cancellationToken = default)
    {
        var meta = await js.InvokeAsync<Metadata>("pdfMetadata", files.Relative(pdfPath));
        var pages = new List<ExtractedPage>(meta.PageCount);
        for (var i = 0; i < meta.PageCount; i++)
        {
            pages.Add(await ExtractPageAsync(pdfPath, i, cancellationToken));
            progress?.Report((i + 1d) / meta.PageCount);
        }
        return pages;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
