using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Folio.Infrastructure.Logging;

public sealed class LocalFileLoggerProvider(string directory) : ILoggerProvider
{
    private readonly object _lock = new();
    public ILogger CreateLogger(string categoryName) => new LocalLogger(this, categoryName);
    public void Dispose() { }
    private void Write(string category, LogLevel level, string message, Exception? exception)
    {
        lock (_lock)
        {
            try
            {
                Directory.CreateDirectory(directory);
                var path = Path.Combine(directory, "folio.jsonl");
                if (File.Exists(path) && new FileInfo(path).Length > 2_000_000)
                {
                    for (var index = 2; index >= 1; index--)
                    {
                        var previous = path + "." + index;
                        if (File.Exists(previous)) File.Move(previous, path + "." + (index + 1), true);
                    }
                    File.Move(path, path + ".1", true);
                }
                var record = new { AtUtc = DateTimeOffset.UtcNow, Level = level.ToString(), Category = category,
                    Message = message, ExceptionType = exception?.GetType().Name,
                    ExceptionDetail = exception?.GetBaseException().Message };
                File.AppendAllText(path, JsonSerializer.Serialize(record) + Environment.NewLine);
            }
            catch (IOException) { /* Diagnostics must not crash the reader. */ }
            catch (UnauthorizedAccessException) { }
        }
    }
    private sealed class LocalLogger(LocalFileLoggerProvider provider, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Information;
        public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        { if (IsEnabled(level)) provider.Write(category, level, formatter(state, exception), exception); }
    }
}
