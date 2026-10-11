namespace Folio.Application.AI;

public interface ILocalAiService
{
    Task<string> CompletePromptAsync(string systemPrompt, string userPrompt, double temperature = 0.2, int maxTokens = 512, CancellationToken ct = default);
    Task<string> SmartCleanupAsync(string rawText, CancellationToken ct = default);
    Task<string> DefineAndExplainAsync(string wordOrPhrase, string surroundingContext, CancellationToken ct = default);
    Task<string> DescribeFigureAsync(string base64Image, string caption, CancellationToken ct = default);
}
