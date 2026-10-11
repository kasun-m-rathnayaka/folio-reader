using System.Diagnostics;

namespace Folio.Application.AI;

public interface ILlamaServerProcessManager : IAsyncDisposable
{
    bool IsRunning { get; }
    int Port { get; }
    string ApiKey { get; }
    string? CurrentModelPath { get; }

    Task<bool> EnsureServerRunningAsync(string modelPath, CancellationToken ct = default);
    Task StopServerAsync();
    void SetPriority(ProcessPriorityClass priority);
    void TouchActivity();
}
