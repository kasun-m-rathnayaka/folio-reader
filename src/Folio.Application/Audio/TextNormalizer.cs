using System.Text.RegularExpressions;
using Folio.Domain.Audio;

namespace Folio.Application.Audio;

public interface ITextNormalizer
{
    string Normalize(string text, IEnumerable<PronunciationRule>? customRules = null);
}

public class TextNormalizer : ITextNormalizer
{
    private static readonly (string Pattern, string Replacement)[] DefaultReplacements = new[]
    {
        (@"\bDr\.", "Doctor"),
        (@"\bMr\.", "Mister"),
        (@"\bMrs\.", "Missus"),
        (@"\bMs\.", "Mizz"),
        (@"\bProf\.", "Professor"),
        (@"\be\.g\.,?", "for example"),
        (@"\bi\.e\.,?", "that is"),
        (@"\bet al\.", "and others"),
        (@"\bvs\.", "versus"),
        (@"\bFig\.\s*(\d+)", "Figure $1"),
        (@"\bCh\.\s*(\d+)", "Chapter $1"),
        (@"\bp\.\s*(\d+)", "page $1"),
        (@"\bpp\.\s*(\d+)", "pages $1"),
        (@"\$(\d+(?:\.\d{2})?)", "$1 dollars"),
        (@"(\d+)\%", "$1 percent"),
        (@"(\d+)\s*km\b", "$1 kilometers"),
        (@"(\d+)\s*kg\b", "$1 kilograms"),
        (@"(\d+)\s*cm\b", "$1 centimeters"),
        (@"(\d+)\s*mm\b", "$1 millimeters")
    };

    public string Normalize(string text, IEnumerable<PronunciationRule>? customRules = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;

        // 1. De-hyphenate line breaks
        string result = Regex.Replace(text, @"(\b\w+)-\s*[\r\n]+\s*(\w+\b)", "$1$2");

        // 2. Collapse line breaks and multiple whitespace
        result = Regex.Replace(result, @"\s+", " ").Trim();

        // 3. Map common typographic ligatures
        result = result
            .Replace("ﬁ", "fi")
            .Replace("ﬂ", "fl")
            .Replace("ﬀ", "ff")
            .Replace("ﬃ", "ffi")
            .Replace("ﬄ", "ffl");

        // 4. Default abbreviation replacements
        foreach (var (pattern, rep) in DefaultReplacements)
        {
            result = Regex.Replace(result, pattern, rep, RegexOptions.IgnoreCase);
        }

        // 5. Custom user pronunciation rules
        if (customRules != null)
        {
            foreach (var rule in customRules)
            {
                if (rule.IsRegex)
                {
                    result = Regex.Replace(result, rule.Pattern, rule.Replacement, RegexOptions.IgnoreCase);
                }
                else
                {
                    result = Regex.Replace(result, $@"\b{Regex.Escape(rule.Pattern)}\b", rule.Replacement, RegexOptions.IgnoreCase);
                }
            }
        }

        return result;
    }
}
