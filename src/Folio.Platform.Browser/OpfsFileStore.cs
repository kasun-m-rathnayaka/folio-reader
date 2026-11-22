using Folio.Infrastructure.Storage;

namespace Folio.Platform.Browser;

/// <summary>
/// Browser file store. The shared code works with ordinary paths, so the WebAssembly in-memory file system under
/// <c>/folio</c> is the working area; the Origin Private File System is the durable copy. PDFs are written to OPFS on
/// import; the last few imported copies stay in memory and older ones are dropped. The reader, covers and text extraction
/// read OPFS directly in JavaScript, so memory use stays bounded however large the library is.
/// </summary>
public sealed class OpfsFileStore(BrowserJs js) : FileStore(new FileStoreOptions { RootDirectory = Root })
{
    public const string Root = "/folio";
    private const int MaxLocalBooks = 3;
    private readonly HashSet<string> _books = new(StringComparer.OrdinalIgnoreCase);
    private readonly LinkedList<string> _localBooks = new();
    private bool _initialized;

    public string InboxDirectory => Path.Combine(RootDirectory, "inbox");

    /// <summary>Loads the list of stored PDFs. Called once before the library is shown.</summary>
    public async Task InitializeAsync()
    {
        if (_initialized) return;
        EnsureDirectories();
        foreach (var name in await js.InvokeAsync<string[]>("listFiles", Relative(BooksDirectory)))
            if (name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) _books.Add(Path.GetFileNameWithoutExtension(name));
        _initialized = true;
    }

    public override void EnsureDirectories()
    {
        base.EnsureDirectories();
        Directory.CreateDirectory(InboxDirectory);
    }

    /// <summary>The OPFS path for a file under the data root, e.g. <c>library/books/abc.pdf</c>.</summary>
    public string Relative(string path) => Path.GetRelativePath(RootDirectory, path).Replace('\\', '/');

    public override async Task<string> StoreBookAsync(string sourceFilePath, string sha256, CancellationToken cancellationToken = default)
    {
        var destination = await base.StoreBookAsync(sourceFilePath, sha256, cancellationToken);
        if (!_books.Contains(sha256))
        {
            await using var stream = File.OpenRead(destination);
            using var reference = new Microsoft.JSInterop.DotNetStreamReference(stream, leaveOpen: true);
            await js.InvokeVoidAsync("writeFromStream", Relative(destination), reference);
            _books.Add(sha256.ToLowerInvariant());
        }
        if (Path.GetFullPath(sourceFilePath).StartsWith(InboxDirectory + "/", StringComparison.Ordinal)) File.Delete(sourceFilePath);
        TrackLocal(destination);
        return destination;
    }

    public override bool BookExists(string sha256) => _books.Contains(sha256);

    public override async Task DeleteManagedFilesAsync(string sha256, CancellationToken cancellationToken = default)
    {
        await base.DeleteManagedFilesAsync(sha256, cancellationToken);
        await js.InvokeVoidAsync("deleteFile", Relative(GetBookPath(sha256)));
        await js.InvokeVoidAsync("deleteFile", Relative(GetCoverPath(sha256)));
        _books.Remove(sha256);
        _localBooks.Remove(GetBookPath(sha256));
    }

    /// <summary>Writes a file to the in-memory working area only (OPFS is written by the JS side).</summary>
    public async Task WriteAsync(string path, byte[] bytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes);
    }

    private void TrackLocal(string path)
    {
        if (!path.StartsWith(BooksDirectory, StringComparison.Ordinal)) return;
        _localBooks.Remove(path); _localBooks.AddFirst(path);
        while (_localBooks.Count > MaxLocalBooks)
        {
            var oldest = _localBooks.Last!.Value; _localBooks.RemoveLast();
            try { File.Delete(oldest); } catch (IOException) { }
        }
    }

    /// <summary>Removes picked files left behind by imports that found a duplicate or failed.</summary>
    public void ClearInbox()
    {
        if (Directory.Exists(InboxDirectory)) Directory.Delete(InboxDirectory, true);
        Directory.CreateDirectory(InboxDirectory);
    }
}
