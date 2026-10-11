using System.Text.RegularExpressions;
using Folio.Domain.Audio;
using Folio.Domain.Geometry;

namespace Folio.Application.Audio;

public interface ISentenceSegmenter
{
    IReadOnlyList<SentenceSpoken> Segment(
        string pageText,
        int pageIndex,
        IReadOnlyList<NormalizedRect> fallbackRects,
        ILayoutBlockClassifier classifier,
        ITextNormalizer normalizer);
}

public class SentenceSegmenter : ISentenceSegmenter
{
    // Regex splits sentences on periods, exclamation points, question marks followed by space or newline,
    // protecting common abbreviations via negative lookbehinds.
    private static readonly Regex SentenceSplitter = new(
        @"(?<!\b(?:e\.g|i\.e|dr|mr|mrs|ms|prof|vs|fig|ch|al|u\.s|no))\b[.!?]+(?:\s+|\r?\n+|$)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public IReadOnlyList<SentenceSpoken> Segment(
        string pageText,
        int pageIndex,
        IReadOnlyList<NormalizedRect> fallbackRects,
        ILayoutBlockClassifier classifier,
        ITextNormalizer normalizer)
    {
        if (string.IsNullOrWhiteSpace(pageText)) return Array.Empty<SentenceSpoken>();

        var sentences = new List<SentenceSpoken>();
        var matches = SentenceSplitter.Matches(pageText);

        int lastIndex = 0;
        foreach (Match match in matches)
        {
            int endIndex = match.Index + match.Length;
            string rawSentence = pageText.Substring(lastIndex, endIndex - lastIndex).Trim();
            if (!string.IsNullOrEmpty(rawSentence))
            {
                var kind = classifier.ClassifyBlock(rawSentence, fallbackRects.FirstOrDefault(), 12.0, 12.0);
                bool skip = classifier.ShouldSkipNarration(kind, rawSentence);
                string spoken = normalizer.Normalize(rawSentence);

                sentences.Add(new SentenceSpoken
                {
                    PageIndex = pageIndex,
                    OriginalText = rawSentence,
                    SpokenText = spoken,
                    Kind = kind,
                    CharacterOffset = lastIndex,
                    Rects = fallbackRects,
                    ShouldSkip = skip,
                    EstimatedDurationSeconds = Math.Max(1.0, spoken.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length / 2.6) // ~155 words/min
                });
            }
            lastIndex = endIndex;
        }

        // Remaining text at end of page without trailing period
        if (lastIndex < pageText.Length)
        {
            string remaining = pageText.Substring(lastIndex).Trim();
            if (!string.IsNullOrEmpty(remaining))
            {
                var kind = classifier.ClassifyBlock(remaining, fallbackRects.FirstOrDefault(), 12.0, 12.0);
                bool skip = classifier.ShouldSkipNarration(kind, remaining);
                string spoken = normalizer.Normalize(remaining);

                sentences.Add(new SentenceSpoken
                {
                    PageIndex = pageIndex,
                    OriginalText = remaining,
                    SpokenText = spoken,
                    Kind = kind,
                    CharacterOffset = lastIndex,
                    Rects = fallbackRects,
                    ShouldSkip = skip,
                    EstimatedDurationSeconds = Math.Max(1.0, spoken.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length / 2.6)
                });
            }
        }

        return sentences;
    }
}
