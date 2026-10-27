using Folio.Domain.Anchors;
using Folio.Domain.Geometry;
using Xunit;

namespace Folio.Domain.Tests;

public class AnchorAndMarginaliaTests
{
    [Fact]
    public void TextAnchor_ExactMatch_ResolvesSuccessfully()
    {
        string fullText = "The quick brown fox jumps over the lazy dog.";
        string exact = "brown fox";
        var rects = new[] { new NormalizedRect(0.1, 0.2, 0.3, 0.05) };

        var anchor = TextAnchor.Create(0, exact, fullText, rects);

        Assert.Equal("The quick ", anchor.Prefix);
        Assert.Equal(" jumps over the lazy dog.", anchor.Suffix);
        Assert.Equal(10, anchor.CharacterOffset);

        var result = anchor.Reanchor(fullText);
        Assert.True(result.IsSuccess);
        Assert.Equal(10, result.CharacterOffset);
        Assert.Equal(ReanchorStatus.ExactMatch, result.Status);
    }

    [Fact]
    public void TextAnchor_ShiftedText_FuzzyMatchesViaPrefixAndSuffix()
    {
        string original = "Prefix text header. The target phrase to locate. Suffix text footer.";
        string target = "The target phrase to locate.";
        var anchor = TextAnchor.Create(0, target, original, Array.Empty<NormalizedRect>());

        // Text re-extracted with slight prefix change or leading characters
        string updated = "Extra intro notes here! Prefix text header. The target phrase to locate. Suffix text footer.";

        var result = anchor.Reanchor(updated);

        Assert.True(result.IsSuccess);
        Assert.Equal(ReanchorStatus.FuzzyMatched, result.Status);
        Assert.Equal(44, result.CharacterOffset);
    }

    [Fact]
    public void TextAnchor_MissingText_MarksDetached()
    {
        string original = "Here is some initial document text.";
        var anchor = TextAnchor.Create(0, "initial document", original, Array.Empty<NormalizedRect>());

        string modified = "Completely altered content without those words.";
        var result = anchor.Reanchor(modified);

        Assert.False(result.IsSuccess);
        Assert.Equal(ReanchorStatus.Detached, result.Status);
    }

}
