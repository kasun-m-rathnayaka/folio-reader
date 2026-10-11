using Folio.Domain.AI;

namespace Folio.Application.AI;

public interface IModelManager
{
    IReadOnlyList<AiModelInfo> GetAvailableModels();
    AiModelInfo? GetActiveModel(AiModelRole role);
    Task<AiModelInfo> DownloadModelAsync(string modelId, IProgress<double>? progress = null, CancellationToken ct = default);
    Task DeleteModelAsync(string modelId);
    void RefreshLocalModels();
}
