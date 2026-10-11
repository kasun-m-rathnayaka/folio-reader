using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Security.Cryptography;
using Folio.Application.AI;

namespace Folio.AI;

/// <summary>
/// Manages the on-demand llama-server.exe sidecar process (FR-AIR-01..02, §8.2.2).
/// Bound exclusively to loopback 127.0.0.1, secured via per-session API token,
/// contained in a Win32 Job Object, and governed by an auto-idle shutdown timer.
/// </summary>
public class LlamaServerProcessManager : ILlamaServerProcessManager
{
    private readonly IResourceGovernor _governor;
    private readonly HttpClient _httpClient;
    private Process? _process;
    private JobObject? _jobObject;
    private string? _currentModelPath;
    private int _port;
    private string _apiKey = string.Empty;
    private DateTimeOffset _lastActivity = DateTimeOffset.UtcNow;
    private System.Timers.Timer? _idleTimer;

    public bool IsRunning => _process != null && !_process.HasExited;
    public int Port => _port;
    public string ApiKey => _apiKey;
    public string? CurrentModelPath => _currentModelPath;

    public LlamaServerProcessManager(IResourceGovernor governor, HttpClient? httpClient = null)
    {
        _governor = governor;
        _httpClient = httpClient ?? new HttpClient();

        _governor.NarrationStateChanged += OnNarrationStateChanged;

        // Auto-idle check timer (runs every minute; stops server if idle > 10 mins)
        _idleTimer = new System.Timers.Timer(60000);
        _idleTimer.Elapsed += async (_, _) =>
        {
            if (IsRunning && DateTimeOffset.UtcNow - _lastActivity > TimeSpan.FromMinutes(10))
            {
                await StopServerAsync();
            }
        };
        _idleTimer.AutoReset = true;
        _idleTimer.Start();
    }

    public void TouchActivity()
    {
        _lastActivity = DateTimeOffset.UtcNow;
    }

    private void OnNarrationStateChanged(bool isNarrating)
    {
        if (IsRunning)
        {
            SetPriority(isNarrating ? ProcessPriorityClass.BelowNormal : ProcessPriorityClass.Normal);
        }
    }

    public async Task<bool> EnsureServerRunningAsync(string modelPath, CancellationToken ct = default)
    {
        TouchActivity();

        if (IsRunning && string.Equals(_currentModelPath, modelPath, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        await StopServerAsync();

        if (!File.Exists(modelPath))
        {
            return false;
        }

        string? binaryPath = FindLlamaServerBinary();
        if (binaryPath == null || !File.Exists(binaryPath))
        {
            // Binary not present; callers will use heuristic fallback
            return false;
        }

        _port = GetFreePort();
        _apiKey = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        _currentModelPath = modelPath;

        int threads = _governor.GetOptimalThreadCount();

        _jobObject = new JobObject();

        var psi = new ProcessStartInfo
        {
            FileName = binaryPath,
            Arguments = $"--model \"{modelPath}\" --port {_port} --host 127.0.0.1 --api-key \"{_apiKey}\" --threads {threads} --ctx-size 2048 --log-disable",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        };

        _process = Process.Start(psi);
        if (_process == null) return false;

        _jobObject.AssignProcess(_process);

        // Health poll until ready
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        linkedCts.CancelAfter(TimeSpan.FromSeconds(30));

        var healthUri = $"http://127.0.0.1:{_port}/health";
        while (!linkedCts.IsCancellationRequested && !_process.HasExited)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, healthUri);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
                using var res = await _httpClient.SendAsync(req, linkedCts.Token);
                if (res.IsSuccessStatusCode)
                {
                    return true;
                }
            }
            catch
            {
                // Wait and retry
            }

            await Task.Delay(250, linkedCts.Token);
        }

        return IsRunning;
    }

    public Task StopServerAsync()
    {
        try
        {
            if (_process != null && !_process.HasExited)
            {
                _process.Kill(entireProcessTree: true);
                _process.WaitForExit(1000);
            }
        }
        catch { }
        finally
        {
            _process?.Dispose();
            _process = null;
            _jobObject?.Dispose();
            _jobObject = null;
            _currentModelPath = null;
        }

        return Task.CompletedTask;
    }

    public void SetPriority(ProcessPriorityClass priority)
    {
        try
        {
            if (IsRunning && _process != null)
            {
                _process.PriorityClass = priority;
            }
        }
        catch { }
    }

    private static string? FindLlamaServerBinary()
    {
        string currentDir = AppDomain.CurrentDomain.BaseDirectory;
        string repoRoot = Path.GetFullPath(Path.Combine(currentDir, @"..\..\..\..\"));

        var candidates = new[]
        {
            Path.Combine(repoRoot, "spikes", "llama-bin", "llama-server.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Folio", "bin", "llama-server.exe")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static int GetFreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    public async ValueTask DisposeAsync()
    {
        _governor.NarrationStateChanged -= OnNarrationStateChanged;
        _idleTimer?.Stop();
        _idleTimer?.Dispose();
        await StopServerAsync();
    }
}
