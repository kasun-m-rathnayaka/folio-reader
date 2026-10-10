namespace Folio.Domain.Geometry;

/// <summary>
/// Dimensions of a PDF page in points, along with crop box bounds and clockwise rotation.
/// </summary>
public readonly record struct PageDimensions(
    double WidthPt,
    double HeightPt,
    int RotationDegrees = 0,
    double CropMinX = 0,
    double CropMinY = 0,
    double CropMaxX = 0,
    double CropMaxY = 0)
{
    public double EffectiveCropMaxX => CropMaxX > CropMinX ? CropMaxX : WidthPt;
    public double EffectiveCropMaxY => CropMaxY > CropMinY ? CropMaxY : HeightPt;

    public double CropWidthPt => EffectiveCropMaxX - CropMinX;
    public double CropHeightPt => EffectiveCropMaxY - CropMinY;

    /// <summary>
    /// The visible width in points after applying rotation.
    /// </summary>
    public double VisibleWidthPt => (RotationDegrees == 90 || RotationDegrees == 270)
        ? CropHeightPt
        : CropWidthPt;

    /// <summary>
    /// The visible height in points after applying rotation.
    /// </summary>
    public double VisibleHeightPt => (RotationDegrees == 90 || RotationDegrees == 270)
        ? CropWidthPt
        : CropHeightPt;
}
