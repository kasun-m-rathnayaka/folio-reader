using Folio.Application.Audio;
using Folio.Domain.Audio;
using Folio.Domain.Geometry;
using Xunit;

namespace Folio.Domain.Tests;

public class AudioPipelineRuleTests
{
    private readonly TextNormalizer _normalizer = new();
    private readonly LayoutBlockClassifier _classifier = new();
    private readonly SentenceSegmenter _segmenter = new();

    [Fact]
    public void TextNormalizer_DehyphenatesAndExpandsAbbreviations()
    {
        string raw = "The inter-\r\nnational committee, e.g., Dr. Smith and Prof. Turing, raised $500 for the project.";
        string normalized = _normalizer.Normalize(raw);

        Assert.Contains("international", normalized);
        Assert.Contains("for example", normalized);
        Assert.Contains("Doctor Smith", normalized);
        Assert.Contains("Professor Turing", normalized);
        Assert.Contains("500 dollars", normalized);
    }

    [Fact]
    public void TextNormalizer_ReplacesLigatures()
    {
        string raw = "The ﬁnal ﬂight had ﬃcient control.";
        string normalized = _normalizer.Normalize(raw);

        Assert.Equal("The final flight had fficient control.", normalized);
    }

    [Fact]
    public void LayoutBlockClassifier_IdentifiesHeadersFootersAndCitations()
    {
        // Header
        var headerRect = new NormalizedRect(0.1, 0.02, 0.8, 0.03);
        var headerKind = _classifier.ClassifyBlock("CHAPTER 4. DISTRIBUTED CONSENSUS", headerRect, 12, 10);
        Assert.Equal(TextBlockKind.Header, headerKind);
        Assert.True(_classifier.ShouldSkipNarration(headerKind, "CHAPTER 4. DISTRIBUTED CONSENSUS"));

        // Footer / Page Number
        var footerRect = new NormalizedRect(0.48, 0.95, 0.04, 0.02);
        var footerKind = _classifier.ClassifyBlock("42", footerRect, 12, 10);
        Assert.Equal(TextBlockKind.PageNumber, footerKind);
        Assert.True(_classifier.ShouldSkipNarration(footerKind, "42"));

        // Citation
        var bodyRect = new NormalizedRect(0.1, 0.3, 0.8, 0.04);
        var bodyKind = _classifier.ClassifyBlock("[12, 14]", bodyRect, 12, 12);
        Assert.True(_classifier.ShouldSkipNarration(bodyKind, "[12, 14]"));
    }

    [Fact]
    public void SentenceSegmenter_SegmentsParagraphWithoutSplittingOnAbbreviations()
    {
        string paragraph = "Dr. Turing established foundational theories in 1936. E.g., the universal machine was described in detail! Is this not remarkable?";
        var sentences = _segmenter.Segment(paragraph, 0, Array.Empty<NormalizedRect>(), _classifier, _normalizer);

        Assert.Equal(3, sentences.Count);
        Assert.Contains("Doctor Turing", sentences[0].SpokenText);
        Assert.Contains("for example", sentences[1].SpokenText);
        Assert.Contains("remarkable", sentences[2].SpokenText);
    }
}
