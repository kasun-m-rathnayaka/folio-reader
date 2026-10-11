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

    [Fact]
    public void MarginaliaLayoutEngine_TwentyOverlappingCards_RelaxesWithoutOverlapAndPreservesOrder()
    {
        // 20 notes clustered closely around page center [0.4, 0.6]
        var items = new List<MarginaliaItem>();
        for (int i = 0; i < 20; i++)
        {
            items.Add(new MarginaliaItem
            {
                Id = Guid.NewGuid(),
                IdealY = 0.4 + (i * 0.005), // Clustered within 10% of page height
                Height = 0.035              // Each card takes 3.5% of page height
            });
        }

        var relaxed = MarginaliaLayoutEngine.Relax(items, minGap: 0.008, minBound: 0.0, maxBound: 1.0);

        Assert.Equal(20, relaxed.Count);

        // Verify vertical order is strictly preserved
        for (int i = 1; i < relaxed.Count; i++)
        {
            Assert.True(relaxed[i].PositionY > relaxed[i - 1].PositionY, $"Item {i} must be below item {i-1}");
            double gap = relaxed[i].PositionY - (relaxed[i - 1].PositionY + relaxed[i - 1].Height);
            Assert.True(gap >= 0.0079, $"Gap between {i-1} and {i} must be at least minGap (was {gap})");
        }

        // Verify bounds
        Assert.True(relaxed[0].PositionY >= 0.0);
        Assert.True(relaxed[^1].Bottom <= 1.0);
    }
}
