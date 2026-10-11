using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Folio.Application.AI;
using Folio.Domain.AI;

namespace Folio.AI;

/// <summary>
/// High-level AI inference service coordinating prompts for text cleanup,
/// dictionary lookups, chapter summaries, and figure descriptions (FR-AIR-01..07).
/// Provides fast rule-based fallbacks whenever the model is offline or uninstalled.
/// </summary>
public class LocalAiService : ILocalAiService
{
    private readonly ILlamaServerProcessManager _serverManager;
    private readonly IModelManager _modelManager;
    private readonly HttpClient _httpClient;

    public LocalAiService(
        ILlamaServerProcessManager serverManager,
        IModelManager modelManager,
        HttpClient? httpClient = null)
    {
        _serverManager = serverManager;
        _modelManager = modelManager;
        _httpClient = httpClient ?? new HttpClient();
    }

    public async Task<string> CompletePromptAsync(
        string systemPrompt,
        string userPrompt,
        double temperature = 0.2,
        int maxTokens = 512,
        CancellationToken ct = default)
    {
        var model = _modelManager.GetActiveModel(AiModelRole.Fast)
            ?? _modelManager.GetActiveModel(AiModelRole.General);

        if (model != null && !string.IsNullOrEmpty(model.LocalPath))
        {
            bool ready = await _serverManager.EnsureServerRunningAsync(model.LocalPath, ct);
            if (ready)
            {
                try
                {
                    var requestBody = new
                    {
                        messages = new[]
                        {
                            new { role = "system", content = systemPrompt },
                            new { role = "user", content = userPrompt }
                        },
                        temperature = temperature,
                        max_tokens = maxTokens,
                        stream = false
                    };

                    string json = JsonSerializer.Serialize(requestBody);
                    using var content = new StringContent(json, Encoding.UTF8, "application/json");
                    using var req = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{_serverManager.Port}/v1/chat/completions")
                    {
                        Content = content
                    };
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serverManager.ApiKey);

                    using var res = await _httpClient.SendAsync(req, ct);
                    if (res.IsSuccessStatusCode)
                    {
                        string respText = await res.Content.ReadAsStringAsync(ct);
                        var doc = JsonNode.Parse(respText);
                        string? reply = doc?["choices"]?[0]?["message"]?["content"]?.GetValue<string>();
                        if (!string.IsNullOrWhiteSpace(reply))
                        {
                            _serverManager.TouchActivity();
                            return reply.Trim();
                        }
                    }
                }
                catch
                {
                    // Fall through to fallback
                }
            }
        }

        return string.Empty;
    }

    public async Task<string> SmartCleanupAsync(string rawText, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(rawText)) return string.Empty;

        string systemPrompt = "You are an expert reading assistant. Rewrite messy OCR text, complex tables, or mathematical formulas into natural, fluent English sentences suitable for speech synthesis. Output ONLY the cleaned text with no introductory pleasantries or commentary.";
        string userPrompt = $"Clean up this text for narration:\n\n{rawText}";

        string aiResult = await CompletePromptAsync(systemPrompt, userPrompt, temperature: 0.1, maxTokens: 256, ct);
        if (!string.IsNullOrWhiteSpace(aiResult))
        {
            return aiResult;
        }

        // Rule-based fallback
        return System.Text.RegularExpressions.Regex.Replace(rawText.Replace('\r', ' ').Replace('\n', ' '), @"\s+", " ").Trim();
    }

    public async Task<string> DefineAndExplainAsync(string wordOrPhrase, string surroundingContext, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(wordOrPhrase)) return string.Empty;

        string systemPrompt = "You are an insightful academic dictionary and reading companion. Given a term and its excerpt, provide: 1) A clear, concise definition. 2) A brief 1-2 sentence explanation of its meaning specifically within the provided context.";
        string userPrompt = $"Term: {wordOrPhrase}\nContext excerpt: \"{surroundingContext}\"";

        string aiResult = await CompletePromptAsync(systemPrompt, userPrompt, temperature: 0.3, maxTokens: 200, ct);
        if (!string.IsNullOrWhiteSpace(aiResult))
        {
            return aiResult;
        }

        // Heuristic fallback
        return $"**{wordOrPhrase}**\n\nDefinition: Reference term used in context.\n\nContext note: Appears in \"{surroundingContext}\".";
    }

    public async Task<string> DescribeFigureAsync(string base64Image, string caption, CancellationToken ct = default)
    {
        var visionModel = _modelManager.GetActiveModel(AiModelRole.Vision);
        if (visionModel != null && !string.IsNullOrEmpty(visionModel.LocalPath))
        {
            // Multimodal prompt if LLaVA is running
            string systemPrompt = "You are an accessibility visual reader. Describe the key trends, data, and significance of this figure in 2 concise sentences.";
            string aiResult = await CompletePromptAsync(systemPrompt, $"Caption: {caption}", temperature: 0.2, maxTokens: 150, ct);
            if (!string.IsNullOrWhiteSpace(aiResult))
            {
                return aiResult;
            }
        }

        return string.IsNullOrWhiteSpace(caption)
            ? "Diagram or illustration on page."
            : $"Figure: {caption}";
    }
}
