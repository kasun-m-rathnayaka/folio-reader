using System.Text.RegularExpressions;
using Folio.Domain.Audio;
using Folio.Domain.Geometry;

namespace Folio.Application.Audio;

public interface ILayoutBlockClassifier
{
    TextBlockKind ClassifyBlock(string text, NormalizedRect boundingBox, double averageFontSize, double currentFontSize);
    bool ShouldSkipNarration(TextBlockKind kind, string text);
}

public class LayoutBlockClassifier : ILayoutBlockClassifier
{
    private static readonly Regex LoneNumberRegex = new(@"^\s*(?:\d+|[ivxlcdm]+)\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex CitationRegex = new(@"^\s*\[\s*\d+(?:\s*[\,\–\-]\s*\d+)*\s*\]\s*$", RegexOptions.Compiled);
    private static readonly Regex TocLeaderRegex = new(@"\.{3,}\s*\d+\s*$", RegexOptions.Compiled);

    public TextBlockKind ClassifyBlock(string text, NormalizedRect boundingBox, double averageFontSize, double currentFontSize)
    {
        string clean = text.Trim();

        // 1. Solitary page numbers
        if (LoneNumberRegex.IsMatch(clean) && (boundingBox.Top < 0.08 || boundingBox.Bottom > 0.92))
        {
            return TextBlockKind.PageNumber;
        }

        // 2. Running headers (top 8%)
        if (boundingBox.Top < 0.08 && boundingBox.Height < 0.05)
        {
            return TextBlockKind.Header;
        }

        // 3. Running footers (bottom 8%)
        if (boundingBox.Bottom > 0.92 && boundingBox.Height < 0.05)
        {
            return TextBlockKind.Footer;
        }

        // 4. TOC dot-leader entries
        if (TocLeaderRegex.IsMatch(clean))
        {
            return TextBlockKind.TocEntry;
        }

        // 5. Captions
        if (clean.StartsWith("Figure ", StringComparison.OrdinalIgnoreCase) ||
            clean.StartsWith("Fig. ", StringComparison.OrdinalIgnoreCase) ||
            clean.StartsWith("Table ", StringComparison.OrdinalIgnoreCase))
        {
            return TextBlockKind.Caption;
        }

        // 6. Headings (significantly larger than average font size)
        if (currentFontSize > averageFontSize * 1.25)
        {
            return TextBlockKind.Heading;
        }

        // 7. Footnotes (smaller font size near page bottom)
        if (boundingBox.Top > 0.80 && currentFontSize < averageFontSize * 0.9)
        {
            return TextBlockKind.Footnote;
        }

        // 8. Lists
        if (clean.StartsWith("•") || clean.StartsWith("- ") || Regex.IsMatch(clean, @"^\d+\.\s"))
        {
            return TextBlockKind.List;
        }

        return TextBlockKind.Paragraph;
    }

    public bool ShouldSkipNarration(TextBlockKind kind, string text)
    {
        // Skip headers, footers, page numbers, and TOC leader lines by default (FR-TTS-05)
        if (kind is TextBlockKind.Header or TextBlockKind.Footer or TextBlockKind.PageNumber or TextBlockKind.TocEntry)
        {
            return true;
        }

        // Standalone bracket citations [1], [2, 3] should not be read aloud as spoken sentences
        if (CitationRegex.IsMatch(text.Trim()))
        {
            return true;
        }

        return false;
    }
}
