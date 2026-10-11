namespace Folio.Domain.Anchors;

public record MarginaliaItem
{
    public Guid Id { get; init; }
    public double IdealY { get; init; }
    public double Height { get; init; }
    public double PositionY { get; set; }

    public double Top => PositionY;
    public double Bottom => PositionY + Height;
}

/// <summary>
/// Layout relaxation engine that prevents note cards from overlapping while
/// keeping them as close as possible to their anchor positions in vertical reading order (FR-ANN-02).
/// </summary>
public static class MarginaliaLayoutEngine
{
    /// <summary>
    /// Relaxes vertical positions for a collection of note cards on a page.
    /// Preserves strict vertical order and enforces minimum gap between cards.
    /// </summary>
    /// <param name="items">List of marginalia items sorted by IdealY.</param>
    /// <param name="minGap">Minimum spacing between adjacent cards (e.g. 0.015 normalized or 12px).</param>
    /// <param name="minBound">Top boundary (typically 0.0).</param>
    /// <param name="maxBound">Bottom boundary (typically 1.0 or container height).</param>
    public static List<MarginaliaItem> Relax(
        IEnumerable<MarginaliaItem> items,
        double minGap = 0.015,
        double minBound = 0.0,
        double maxBound = 1.0)
    {
        var list = items.OrderBy(x => x.IdealY).Select(x => new MarginaliaItem
        {
            Id = x.Id,
            IdealY = x.IdealY,
            Height = x.Height,
            PositionY = Math.Max(minBound, x.IdealY - (x.Height / 2.0))
        }).ToList();

        if (list.Count <= 1)
        {
            if (list.Count == 1)
            {
                list[0].PositionY = Math.Clamp(list[0].PositionY, minBound, Math.Max(minBound, maxBound - list[0].Height));
            }
            return list;
        }

        // Pass 1: Forward push (resolve overlaps downwards)
        for (int i = 1; i < list.Count; i++)
        {
            double prevBottom = list[i - 1].PositionY + list[i - 1].Height;
            if (list[i].PositionY < prevBottom + minGap)
            {
                list[i].PositionY = prevBottom + minGap;
            }
        }

        // Pass 2: Backward pull (if bottom-most items overflow maxBound, push upwards)
        if (list[^1].PositionY + list[^1].Height > maxBound)
        {
            list[^1].PositionY = maxBound - list[^1].Height;

            for (int i = list.Count - 2; i >= 0; i--)
            {
                double nextTop = list[i + 1].PositionY;
                if (list[i].PositionY + list[i].Height > nextTop - minGap)
                {
                    list[i].PositionY = nextTop - minGap - list[i].Height;
                }
            }
        }

        // Pass 3: Clamp top if shifted above minBound
        if (list[0].PositionY < minBound)
        {
            double shift = minBound - list[0].PositionY;
            for (int i = 0; i < list.Count; i++)
            {
                list[i].PositionY += shift;
            }
        }

        return list;
    }
}
