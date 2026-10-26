using System.Collections.Concurrent;

namespace Folio.Application.Books;

public sealed class ImportInbox
{
    private readonly ConcurrentQueue<IReadOnlyList<string>> _pending = new();
    public event Action? Changed;
    public void Add(IEnumerable<string> paths) { _pending.Enqueue(paths.ToArray()); Changed?.Invoke(); }
    public bool TryTake(out IReadOnlyList<string>? paths) => _pending.TryDequeue(out paths);

    public static IReadOnlyList<string> Expand(IEnumerable<string> paths, CancellationToken ct = default)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in paths)
        {
            ct.ThrowIfCancellationRequested();
            if (File.Exists(path) && string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase)) result.Add(Path.GetFullPath(path));
            else if (Directory.Exists(path))
                foreach (var file in Directory.EnumerateFiles(path, "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }))
                {
                    ct.ThrowIfCancellationRequested();
                    if (string.Equals(Path.GetExtension(file), ".pdf", StringComparison.OrdinalIgnoreCase)) result.Add(Path.GetFullPath(file));
                }
        }
        return result.Order(StringComparer.OrdinalIgnoreCase).ToArray();
    }
}
