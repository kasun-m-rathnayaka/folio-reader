using Folio.Application.Common.Interfaces;

namespace Folio.Platform.Browser;

/// <summary>Renders the first page of a stored PDF with PDF.js and stores the cover in OPFS (LIB-4).</summary>
public sealed class PdfJsCoverRenderer(BrowserJs js, OpfsFileStore files) : IPdfRasterizer
{
    public async Task<string> RenderPageToImageAsync(string pdfPath, int pageIndex, string outputImagePath, uint targetDpi = 300,
        uint? maxDimensionPx = null, CancellationToken cancellationToken = default)
    {
        if (pageIndex != 0) throw new NotSupportedException("The browser renders covers from the first page only.");
        // Covers are drawn at 512 px on the long edge (SPEC: textures), whatever the desktop default asks for.
        var bytes = await js.InvokeAsync<byte[]>("renderCover", files.Relative(pdfPath), files.Relative(outputImagePath), 512);
        await files.WriteAsync(outputImagePath, bytes);
        return outputImagePath;
    }
}
