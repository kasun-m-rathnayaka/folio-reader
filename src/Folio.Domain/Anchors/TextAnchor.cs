using Folio.Domain.Geometry;

namespace Folio.Domain.Anchors;

public enum ReanchorStatus
{
    ExactMatch,
    FuzzyMatched,
    Detached
}

public readonly record struct ReanchorResult(bool IsSuccess, int? CharacterOffset, ReanchorStatus Status);

/// <summary>
/// Text anchor value object for resilient annotation anchoring across zoom, modes,
/// and re-extraction / OCR updates (FR-ANN-10, §8.5).
/// </summary>
public record TextAnchor
{
    public const int ContextLength = 32;

    public int PageIndex { get; init; }
    public string ExactText { get; init; } = string.Empty;
    public string Prefix { get; init; } = string.Empty;
    public string Suffix { get; init; } = string.Empty;
    public int? CharacterOffset { get; init; }
    public IReadOnlyList<NormalizedRect> Rects { get; init; } = Array.Empty<NormalizedRect>();
    public int ExtractorVersion { get; init; } = 1;

    public static TextAnchor Create(
        int pageIndex,
        string exactText,
        string? pageText,
        IReadOnlyList<NormalizedRect> rects,
        int? offset = null,
        int extractorVersion = 1)
    {
        string prefix = string.Empty;
        string suffix = string.Empty;

        if (!string.IsNullOrEmpty(pageText) && !string.IsNullOrEmpty(exactText))
        {
            int index = offset ?? pageText.IndexOf(exactText, StringComparison.Ordinal);
            if (index >= 0)
            {
                int prefixStart = Math.Max(0, index - ContextLength);
                int prefixLen = index - prefixStart;
                prefix = pageText.Substring(prefixStart, prefixLen);

                int suffixStart = index + exactText.Length;
                int suffixLen = Math.Min(ContextLength, pageText.Length - suffixStart);
                if (suffixLen > 0)
                {
                    suffix = pageText.Substring(suffixStart, suffixLen);
                }

                offset = index;
            }
        }

        return new TextAnchor
        {
            PageIndex = pageIndex,
            ExactText = exactText ?? string.Empty,
            Prefix = prefix,
            Suffix = suffix,
            CharacterOffset = offset,
            Rects = rects ?? Array.Empty<NormalizedRect>(),
            ExtractorVersion = extractorVersion
        };
    }

    /// <summary>
    /// Resolves annotation position against fresh page text using exact offset,
    /// then exact phrase with prefix/suffix context, then marks detached (§8.5).
    /// </summary>
    public ReanchorResult Reanchor(string newPageText)
    {
        if (string.IsNullOrEmpty(newPageText) || string.IsNullOrEmpty(ExactText))
        {
            return new ReanchorResult(false, null, ReanchorStatus.Detached);
        }

        // 1. Direct offset match
        if (CharacterOffset.HasValue &&
            CharacterOffset.Value >= 0 &&
            CharacterOffset.Value + ExactText.Length <= newPageText.Length)
        {
            string slice = newPageText.Substring(CharacterOffset.Value, ExactText.Length);
            if (string.Equals(slice, ExactText, StringComparison.Ordinal))
            {
                return new ReanchorResult(true, CharacterOffset.Value, ReanchorStatus.ExactMatch);
            }
        }

        // 2. Full context search (Prefix + Exact + Suffix)
        if (!string.IsNullOrEmpty(Prefix) && !string.IsNullOrEmpty(Suffix))
        {
            string fullContext = Prefix + ExactText + Suffix;
            int contextIdx = newPageText.IndexOf(fullContext, StringComparison.OrdinalIgnoreCase);
            if (contextIdx >= 0)
            {
                int matchedOffset = contextIdx + Prefix.Length;
                return new ReanchorResult(true, matchedOffset, ReanchorStatus.FuzzyMatched);
            }
        }

        // 3. Exact text search on page
        int exactIdx = newPageText.IndexOf(ExactText, StringComparison.OrdinalIgnoreCase);
        if (exactIdx >= 0)
        {
            return new ReanchorResult(true, exactIdx, ReanchorStatus.FuzzyMatched);
        }

        // 4. Detached fallback
        return new ReanchorResult(false, null, ReanchorStatus.Detached);
    }
}
