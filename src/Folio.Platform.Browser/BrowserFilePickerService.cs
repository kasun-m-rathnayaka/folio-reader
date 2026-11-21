using Folio.Application.Books;
using Folio.Application.Common.Interfaces;
using Microsoft.JSInterop;

namespace Folio.Platform.Browser;

public sealed record PickedFile(string Id, string Name, long Size, string RelativePath);

/// <summary>
/// File input, folder input (webkitdirectory) and drag-and-drop. Chosen files are copied into the in-memory inbox so the
/// shared, path-based importer can read them; the importer moves each one into OPFS.
/// </summary>
public sealed class BrowserFilePickerService(BrowserJs js, OpfsFileStore files, ImportInbox inbox) : IFilePickerService, IDisposable
{
    public const long MaxFileBytes = 2L * 1024 * 1024 * 1024;
    private DotNetObjectReference<BrowserFilePickerService>? _reference;

    public async Task<IReadOnlyList<string>> PickPdfFilesAsync() => await CopyAsync(await js.InvokeAsync<PickedFile[]>("pickPdfFiles"));

    public async Task<string?> PickFolderAsync()
    {
        var picked = await js.InvokeAsync<PickedFile[]>("pickFolder");
        if (picked.Length == 0) return null;
        var paths = await CopyAsync(picked);
        // The importer expands a folder path; everything copied in this call shares one inbox batch folder.
        return paths.Count == 0 ? null : _batch;
    }

    /// <summary>Lets the page accept dropped PDFs and folders.</summary>
    public async Task RegisterDropTargetAsync()
    {
        _reference ??= DotNetObjectReference.Create(this);
        await js.InvokeVoidAsync("registerDropTarget", _reference);
    }

    [JSInvokable]
    public async Task OnFilesDropped(PickedFile[] dropped)
    {
        var paths = await CopyAsync(dropped);
        if (paths.Count > 0) inbox.Add(paths);
    }

    private string _batch = "";

    private async Task<IReadOnlyList<string>> CopyAsync(IReadOnlyList<PickedFile> picked)
    {
        if (picked.Count == 0) return [];
        files.ClearInbox();
        _batch = Path.Combine(files.InboxDirectory, Guid.NewGuid().ToString("N"));
        var paths = new List<string>(picked.Count);
        foreach (var file in picked)
        {
            if (file.Size > MaxFileBytes) continue;
            var relative = string.Join('/', file.RelativePath.Split('/', '\\').Where(p => p is not ("" or "." or "..")).Select(Safe));
            var target = Path.Combine(_batch, string.IsNullOrEmpty(relative) ? Safe(file.Name) : relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            var bytes = await js.InvokeAsync<byte[]?>("readPicked", file.Id);
            if (bytes == null) continue;
            await File.WriteAllBytesAsync(target, bytes);
            paths.Add(target);
        }
        return paths;
    }

    private static string Safe(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).Trim();
        return string.IsNullOrEmpty(cleaned) ? "book.pdf" : cleaned;
    }

    public void Dispose() => _reference?.Dispose();
}
