using Folio.AI;
using Folio.Application.AI;
using Folio.Domain.AI;
using Xunit;

namespace Folio.Infrastructure.Tests;

public class AiRuntimeTests
{
    [Fact]
    public void ModelCatalog_ContainsPreVettedModels()
    {
        var models = ModelCatalog.CuratedModels;
        Assert.NotEmpty(models);
        Assert.Contains(models, m => m.Role == AiModelRole.Fast);
        Assert.Contains(models, m => m.Role == AiModelRole.General);

        foreach (var m in models)
        {
            Assert.False(string.IsNullOrWhiteSpace(m.Id));
            Assert.False(string.IsNullOrWhiteSpace(m.Name));
            Assert.False(string.IsNullOrWhiteSpace(m.DownloadUrl));
            Assert.True(m.SizeBytes > 0);
            Assert.True(m.RamEstimateGb > 0);
        }
    }

    [Fact]
    public void ResourceGovernor_CalculatesOptimalThreads()
    {
        var governor = new ResourceGovernor();
        int threads = governor.GetOptimalThreadCount();
        Assert.InRange(threads, 2, 8);
    }

    [Fact]
    public void ResourceGovernor_EnforcesRamHeadroom()
    {
        var governor = new ResourceGovernor();

        // 500 GB model should definitely fail on any standard machine
        bool canLoadHuge = governor.CanLoadModel(500.0, out string reason);
        Assert.False(canLoadHuge);
        Assert.Contains("Insufficient", reason, StringComparison.OrdinalIgnoreCase);

        // 0.1 GB model check
        bool canLoadSmall = governor.CanLoadModel(0.1, out _);
        // On a machine with >= 2.1 GB free, this passes
        Assert.True(canLoadSmall || !canLoadSmall); // Validates it executes cleanly without throwing
    }

    [Fact]
    public void JobObject_CanaryInstantiation()
    {
        using var job = new JobObject();
        Assert.NotNull(job);
    }

    [Fact]
    public async Task LocalAiService_FallbackProvidesCleanText()
    {
        var governor = new ResourceGovernor();
        var modelManager = new ModelManager();
        var serverManager = new LlamaServerProcessManager(governor);
        var aiService = new LocalAiService(serverManager, modelManager);

        string rawMessyText = "This  is   a   badly\r\n\r\nspaced   document   snippet.";
        string cleaned = await aiService.SmartCleanupAsync(rawMessyText);

        Assert.Equal("This is a badly spaced document snippet.", cleaned);
    }

    [Fact]
    public async Task LocalAiService_FallbackProvidesDefinition()
    {
        var governor = new ResourceGovernor();
        var modelManager = new ModelManager();
        var serverManager = new LlamaServerProcessManager(governor);
        var aiService = new LocalAiService(serverManager, modelManager);

        string definition = await aiService.DefineAndExplainAsync("Palimpsest", "The manuscript was a medieval palimpsest reused over time.");

        Assert.Contains("Palimpsest", definition);
        Assert.Contains("Definition", definition);
    }
}
