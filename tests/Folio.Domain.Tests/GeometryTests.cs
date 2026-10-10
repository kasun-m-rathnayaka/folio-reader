using Folio.Domain.Geometry;

namespace Folio.Domain.Tests;

public class GeometryTests
{
    [Fact]
    public void NormalizedRect_Contains_IdentifiesInnerPointsCorrectly()
    {
        var rect = new NormalizedRect(0.2, 0.2, 0.5, 0.4);

        Assert.True(rect.Contains(new NormalizedPoint(0.25, 0.3)));
        Assert.True(rect.Contains(new NormalizedPoint(0.2, 0.2))); // on boundary
        Assert.False(rect.Contains(new NormalizedPoint(0.1, 0.3))); // left of rect
        Assert.False(rect.Contains(new NormalizedPoint(0.8, 0.5))); // right of rect
    }

    [Fact]
    public void NormalizedRect_IntersectsWith_DetectsOverlaps()
    {
        var r1 = new NormalizedRect(0.1, 0.1, 0.3, 0.3);
        var r2 = new NormalizedRect(0.2, 0.2, 0.4, 0.4);
        var r3 = new NormalizedRect(0.6, 0.6, 0.2, 0.2);

        Assert.True(r1.IntersectsWith(r2));
        Assert.False(r1.IntersectsWith(r3));
    }

    [Fact]
    public void NormalizedRect_Clamp_EnforcesUnitBounds()
    {
        var overflown = new NormalizedRect(-0.2, -0.1, 1.5, 1.5);
        var clamped = overflown.Clamp();

        Assert.Equal(0.0, clamped.X);
        Assert.Equal(0.0, clamped.Y);
        Assert.Equal(1.0, clamped.Width);
        Assert.Equal(1.0, clamped.Height);
    }

    [Fact]
    public void CoordinateTransformer_Rotation0_ConvertsPdfPointsToTopLeftOrigin()
    {
        // 600 x 800 pt page, 0 rotation
        var page = new PageDimensions(600, 800, 0);

        // PDF point at bottom-left: (0, 0) -> normalized visible should be (0, 1.0)
        var pBottomLeft = CoordinateTransformer.PdfToNormalized(0, 0, page);
        Assert.Equal(0.0, pBottomLeft.X, 3);
        Assert.Equal(1.0, pBottomLeft.Y, 3);

        // PDF point at top-left: (0, 800) -> normalized visible should be (0, 0)
        var pTopLeft = CoordinateTransformer.PdfToNormalized(0, 800, page);
        Assert.Equal(0.0, pTopLeft.X, 3);
        Assert.Equal(0.0, pTopLeft.Y, 3);

        // PDF point at top-right: (600, 800) -> normalized visible should be (1.0, 0)
        var pTopRight = CoordinateTransformer.PdfToNormalized(600, 800, page);
        Assert.Equal(1.0, pTopRight.X, 3);
        Assert.Equal(0.0, pTopRight.Y, 3);
    }

    [Fact]
    public void CoordinateTransformer_Rotation90_RotatesCorrectly()
    {
        // 600 x 800 pt page rotated 90 deg clockwise -> visible dimensions: 800 x 600 pt
        var page = new PageDimensions(600, 800, 90);

        Assert.Equal(800.0, page.VisibleWidthPt);
        Assert.Equal(600.0, page.VisibleHeightPt);

        // In 90 CW rotation: PDF (0, 800) maps to top-right visible (1.0, 0.0)
        var p = CoordinateTransformer.PdfToNormalized(0, 800, page);
        Assert.Equal(1.0, p.X, 3);
        Assert.Equal(0.0, p.Y, 3);
    }
}
