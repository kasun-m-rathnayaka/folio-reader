namespace Folio.Domain.Geometry;

/// <summary>
/// Converts coordinates between PDF points (bottom-left origin) and
/// normalized visible page space [0.0, 1.0] (top-left origin).
/// Verified empirically in Spike S1 (ADR-005).
/// </summary>
public static class CoordinateTransformer
{
    /// <summary>
    /// Transforms a point from PDF space (points, bottom-left origin) to normalized visible page space [0.0, 1.0] (top-left origin).
    /// </summary>
    public static NormalizedPoint PdfToNormalized(double pdfX, double pdfY, PageDimensions page)
    {
        double cropMinX = page.CropMinX;
        double cropMinY = page.CropMinY;
        double cropMaxX = page.EffectiveCropMaxX;
        double cropMaxY = page.EffectiveCropMaxY;

        double visX;
        double visY;

        switch (page.RotationDegrees % 360)
        {
            case 90:
                visX = pdfY - cropMinY;
                visY = pdfX - cropMinX;
                break;
            case 180:
                visX = cropMaxX - pdfX;
                visY = pdfY - cropMinY;
                break;
            case 270:
                visX = cropMaxY - pdfY;
                visY = cropMaxX - pdfX;
                break;
            case 0:
            default:
                visX = pdfX - cropMinX;
                visY = cropMaxY - pdfY;
                break;
        }

        double normX = Math.Clamp(visX / page.VisibleWidthPt, 0.0, 1.0);
        double normY = Math.Clamp(visY / page.VisibleHeightPt, 0.0, 1.0);

        return new NormalizedPoint(normX, normY);
    }

    /// <summary>
    /// Transforms a rectangle from PDF space (points, bottom-left origin) to normalized visible page space [0.0, 1.0] (top-left origin).
    /// </summary>
    public static NormalizedRect PdfRectToNormalized(double pdfLeft, double pdfBottom, double pdfRight, double pdfTop, PageDimensions page)
    {
        var p1 = PdfToNormalized(pdfLeft, pdfBottom, page);
        var p2 = PdfToNormalized(pdfRight, pdfTop, page);

        double minX = Math.Min(p1.X, p2.X);
        double minY = Math.Min(p1.Y, p2.Y);
        double maxX = Math.Max(p1.X, p2.X);
        double maxY = Math.Max(p1.Y, p2.Y);

        return new NormalizedRect(minX, minY, maxX - minX, maxY - minY).Clamp();
    }
}
