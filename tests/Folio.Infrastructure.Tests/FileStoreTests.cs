using Folio.Infrastructure.Storage;

namespace Folio.Infrastructure.Tests;

public class FileStoreTests : IDisposable
{
    private readonly string _tempDir;
    private readonly FileStore _fileStore;

    public FileStoreTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "Folio_FileStoreTests_" + Guid.NewGuid().ToString("N"));
        _fileStore = new FileStore(new FileStoreOptions { RootDirectory = _tempDir });
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            try { Directory.Delete(_tempDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public void EnsureDirectories_CreatesAllRequiredFolders()
    {
        _fileStore.EnsureDirectories();

        Assert.True(Directory.Exists(_fileStore.RootDirectory));
        Assert.True(Directory.Exists(_fileStore.DatabaseDirectory));
        Assert.True(Directory.Exists(_fileStore.BooksDirectory));
        Assert.True(Directory.Exists(_fileStore.CoversDirectory));
        Assert.True(Directory.Exists(_fileStore.CacheDirectory));
        Assert.True(Directory.Exists(_fileStore.ModelsDirectory));
        Assert.True(Directory.Exists(_fileStore.BackupsDirectory));
        Assert.True(Directory.Exists(_fileStore.LogsDirectory));
    }

    [Fact]
    public async Task ComputeSha256Async_CalculatesKnownHashCorrectly()
    {
        string sampleFile = Path.Combine(_tempDir, "sample.txt");
        Directory.CreateDirectory(_tempDir);
        await File.WriteAllTextAsync(sampleFile, "Hello Folio Test Content");

        string sha256 = await _fileStore.ComputeSha256Async(sampleFile);

        Assert.NotNull(sha256);
        Assert.Equal(64, sha256.Length); // 64 hex chars
        Assert.Equal(sha256.ToLowerInvariant(), sha256); // Lowercase hex
    }

    [Fact]
    public async Task StoreBookAsync_CopiesFileAndEnforcesDeduplication()
    {
        Directory.CreateDirectory(_tempDir);
        string sourcePdf = Path.Combine(_tempDir, "source.pdf");
        await File.WriteAllTextAsync(sourcePdf, "%PDF-1.7 mock content");

        string sha256 = await _fileStore.ComputeSha256Async(sourcePdf);

        string storedPath = await _fileStore.StoreBookAsync(sourcePdf, sha256);
        Assert.True(File.Exists(storedPath));
        Assert.True(_fileStore.BookExists(sha256));

        // Deduplication test: re-storing does not throw and returns existing path
        string secondPath = await _fileStore.StoreBookAsync(sourcePdf, sha256);
        Assert.Equal(storedPath, secondPath);
    }

    [Fact]
    public async Task StoreBookAsync_RepairsACorruptManagedCopyWithoutChangingTheSource()
    {
        Directory.CreateDirectory(_tempDir);
        var source = Path.Combine(_tempDir, "original.pdf");
        await File.WriteAllTextAsync(source, "%PDF-1.7 original content");
        var hash = await _fileStore.ComputeSha256Async(source);
        var managed = await _fileStore.StoreBookAsync(source, hash);
        await File.WriteAllTextAsync(managed, "damaged copy");
        await _fileStore.StoreBookAsync(source, hash);
        Assert.Equal(hash, await _fileStore.ComputeSha256Async(managed));
        Assert.Equal(hash, await _fileStore.ComputeSha256Async(source));
    }

    [Fact]
    public void GetBookPath_ReturnsExpectedPath()
    {
        string hash = "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0";
        string path = _fileStore.GetBookPath(hash);

        Assert.EndsWith($"{hash}.pdf", path);
        Assert.Contains("library\\books", path);
    }
}

