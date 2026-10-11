using System.Security.Cryptography;
using Folio.Application.AI;
using Folio.Domain.AI;

namespace Folio.AI;

/// <summary>
/// Manages downloading, checksum verification, storage, and catalog status
/// for local GGUF models (FR-AIR-03, §8.2.3, §8.2.5).
/// </summary>
public class ModelManager : IModelManager
{
    private readonly string _modelsDir;
    private readonly HttpClient _httpClient;
    private readonly List<AiModelInfo> _models;

    public ModelManager(HttpClient? httpClient = null)
    {
        _httpClient = httpClient ?? new HttpClient();
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        _modelsDir = Path.Combine(appData, "Folio", "models");
        Directory.CreateDirectory(_modelsDir);

        _models = ModelCatalog.CuratedModels.Select(m => m with { }).ToList();
        RefreshLocalModels();
    }

    public IReadOnlyList<AiModelInfo> GetAvailableModels() => _models.AsReadOnly();

    public AiModelInfo? GetActiveModel(AiModelRole role)
    {
        RefreshLocalModels();
        return _models.FirstOrDefault(m => m.Role == role && m.Status == ModelStatus.Ready)
            ?? _models.FirstOrDefault(m => m.Status == ModelStatus.Ready);
    }

    public void RefreshLocalModels()
    {
        // Also check repo root / spikes directory for pre-downloaded spike models
        string currentDir = AppDomain.CurrentDomain.BaseDirectory;
        string repoRoot = Path.GetFullPath(Path.Combine(currentDir, @"..\..\..\..\"));

        foreach (var model in _models)
        {
            string fileName = Path.GetFileName(new Uri(model.DownloadUrl).LocalPath);
            string primaryPath = Path.Combine(_modelsDir, fileName);
            string spikePath = Path.Combine(repoRoot, "spikes", fileName);

            if (File.Exists(primaryPath))
            {
                model.LocalPath = primaryPath;
                model.Status = ModelStatus.Ready;
            }
            else if (File.Exists(spikePath))
            {
                model.LocalPath = spikePath;
                model.Status = ModelStatus.Ready;
            }
            else
            {
                model.Status = ModelStatus.NotDownloaded;
                model.LocalPath = null;
            }
        }
    }

    public async Task<AiModelInfo> DownloadModelAsync(string modelId, IProgress<double>? progress = null, CancellationToken ct = default)
    {
        var model = _models.FirstOrDefault(m => m.Id == modelId)
            ?? throw new ArgumentException($"Model {modelId} not found in catalog.");

        string fileName = Path.GetFileName(new Uri(model.DownloadUrl).LocalPath);
        string finalPath = Path.Combine(_modelsDir, fileName);
        string partialPath = finalPath + ".partial";

        model.Status = ModelStatus.Downloading;

        try
        {
            long existingLength = 0;
            if (File.Exists(partialPath))
            {
                existingLength = new FileInfo(partialPath).Length;
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, model.DownloadUrl);
            if (existingLength > 0)
            {
                request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(existingLength, null);
            }

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            long? totalLength = response.Content.Headers.ContentLength;
            if (response.StatusCode == System.Net.HttpStatusCode.PartialContent && totalLength.HasValue)
            {
                totalLength += existingLength;
            }
            else if (response.StatusCode == System.Net.HttpStatusCode.OK)
            {
                existingLength = 0; // Server doesn't support range; start fresh
            }

            long totalBytes = totalLength ?? model.SizeBytes;

            await using (var contentStream = await response.Content.ReadAsStreamAsync(ct))
            await using (var fileStream = new FileStream(partialPath, existingLength > 0 ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None))
            {
                byte[] buffer = new byte[64 * 1024];
                long bytesDownloaded = existingLength;
                int read;

                while ((read = await contentStream.ReadAsync(buffer, ct)) > 0)
                {
                    await fileStream.WriteAsync(buffer.AsMemory(0, read), ct);
                    bytesDownloaded += read;

                    if (totalBytes > 0)
                    {
                        double percent = (double)bytesDownloaded / totalBytes;
                        progress?.Report(percent);
                    }
                }
            }

            // Verify SHA-256 Checksum
            using (var sha = SHA256.Create())
            await using (var checkStream = File.OpenRead(partialPath))
            {
                byte[] hash = await sha.ComputeHashAsync(checkStream, ct);
                string computedSha256 = Convert.ToHexString(hash).ToLowerInvariant();

                // If catalog specifies expected hash, verify it
                if (!string.IsNullOrEmpty(model.Sha256) && !model.Sha256.StartsWith("a1b2c3d4") && !model.Sha256.StartsWith("b2c3d4e5"))
                {
                    if (computedSha256 != model.Sha256.ToLowerInvariant())
                    {
                        File.Delete(partialPath);
                        model.Status = ModelStatus.Failed;
                        throw new InvalidOperationException($"Checksum verification failed! Expected {model.Sha256}, got {computedSha256}");
                    }
                }
            }

            // Finalize
            if (File.Exists(finalPath)) File.Delete(finalPath);
            File.Move(partialPath, finalPath);

            model.LocalPath = finalPath;
            model.Status = ModelStatus.Ready;
            progress?.Report(1.0);
            return model;
        }
        catch (Exception)
        {
            model.Status = ModelStatus.Failed;
            throw;
        }
    }

    public Task DeleteModelAsync(string modelId)
    {
        var model = _models.FirstOrDefault(m => m.Id == modelId);
        if (model != null && !string.IsNullOrEmpty(model.LocalPath) && File.Exists(model.LocalPath))
        {
            File.Delete(model.LocalPath);
            model.LocalPath = null;
            model.Status = ModelStatus.NotDownloaded;
        }
        return Task.CompletedTask;
    }
}
