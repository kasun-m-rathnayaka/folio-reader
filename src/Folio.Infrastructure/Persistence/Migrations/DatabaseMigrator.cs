using System.Data.Common;
using Folio.Application.Common.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Migrations;

public record MigrationStep(int Version, string Name, Func<DbConnection, DbTransaction, Task> Up);

/// <summary>
/// Forward-only versioned migration runner with automatic pre-migration backup (FR-DAT-04).
/// </summary>
public class DatabaseMigrator : IDatabaseMigrator
{
    public const int LatestVersion = 5;
    private readonly FolioDbContext _context;
    private readonly IFileStore _fileStore;
    private readonly IReadOnlyList<MigrationStep> _migrations;

    public DatabaseMigrator(FolioDbContext context, IFileStore fileStore)
    {
        _context = context;
        _fileStore = fileStore;
        _migrations = BuildMigrations();
    }

    public async Task<int> GetCurrentVersionAsync(CancellationToken cancellationToken = default)
    {
        var connection = _context.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await EnsureSchemaVersionTableAsync(connection, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COALESCE(MAX(Version), 0) FROM _SchemaVersions;";
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(result);
    }

    public async Task<string?> CreatePreMigrationBackupAsync(CancellationToken cancellationToken = default)
    {
        var connection = _context.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        _fileStore.EnsureDirectories();

        int currentVersion = await GetCurrentVersionAsync(cancellationToken);
        string timestamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd_HHmmss_fffffff");
        string backupFileName = $"pre_migration_v{currentVersion}_{timestamp}.db";
        string backupFilePath = Path.Combine(_fileStore.BackupsDirectory, backupFileName);

        // If in-memory database or file doesn't exist yet, no physical pre-migration backup required
        if (string.Equals(connection.DataSource, ":memory:", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(connection.DataSource) ||
            !File.Exists(connection.DataSource))
        {
            return null;
        }

        await using var command = connection.CreateCommand();
        // VACUUM INTO includes committed WAL data. A live file copy does not.
        command.CommandText = $"VACUUM INTO '{backupFilePath.Replace("'", "''")}';";
        await command.ExecuteNonQueryAsync(cancellationToken);
        await using var snapshot = new SqliteConnection($"Data Source={backupFilePath};Mode=ReadOnly;Pooling=False");
        await snapshot.OpenAsync(cancellationToken);
        await using var check = snapshot.CreateCommand();
        check.CommandText = "PRAGMA quick_check;";
        if (!string.Equals(Convert.ToString(await check.ExecuteScalarAsync(cancellationToken)), "ok", StringComparison.Ordinal))
            throw new InvalidOperationException("The pre-upgrade backup failed its integrity check. The library was not upgraded.");
        return backupFilePath;
    }

    public async Task<int> MigrateAsync(CancellationToken cancellationToken = default)
    {
        var connection = _context.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await EnsureSchemaVersionTableAsync(connection, cancellationToken);
        int currentVersion = await GetCurrentVersionAsync(cancellationToken);
        if (currentVersion > LatestVersion)
            throw new InvalidOperationException("This library was created by a newer version of Folio. Open it with that version.");

        await using (var check = connection.CreateCommand())
        {
            check.CommandText = "PRAGMA quick_check;";
            if (!string.Equals(Convert.ToString(await check.ExecuteScalarAsync(cancellationToken)), "ok", StringComparison.Ordinal))
                throw new InvalidOperationException("Library integrity check failed. Restore a verified backup before continuing.");
        }

        var pendingMigrations = _migrations
            .Where(m => m.Version > currentVersion)
            .OrderBy(m => m.Version)
            .ToList();

        if (pendingMigrations.Count == 0)
        {
            return currentVersion;
        }

        // Automatic pre-migration backup before applying any new version
        string? backupPath = await CreatePreMigrationBackupAsync(cancellationToken);

        foreach (var migration in pendingMigrations)
        {
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            try
            {
                await migration.Up(connection, (DbTransaction)transaction);

                await using var recordCommand = connection.CreateCommand();
                recordCommand.Transaction = (DbTransaction)transaction;
                recordCommand.CommandText = @"
                    INSERT INTO _SchemaVersions (Version, Name, AppliedAt)
                    VALUES (@version, @name, @appliedAt);";

                var pVersion = recordCommand.CreateParameter();
                pVersion.ParameterName = "@version";
                pVersion.Value = migration.Version;
                recordCommand.Parameters.Add(pVersion);

                var pName = recordCommand.CreateParameter();
                pName.ParameterName = "@name";
                pName.Value = migration.Name;
                recordCommand.Parameters.Add(pName);

                var pApplied = recordCommand.CreateParameter();
                pApplied.ParameterName = "@appliedAt";
                pApplied.Value = DateTimeOffset.UtcNow.ToString("O");
                recordCommand.Parameters.Add(pApplied);

                await recordCommand.ExecuteNonQueryAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(cancellationToken);

                throw new InvalidOperationException(
                    $"Migration {migration.Version} ({migration.Name}) failed and was rolled back. Backup: {backupPath ?? "in-memory library"}.", ex);
            }
        }

        return await GetCurrentVersionAsync(cancellationToken);
    }

    private static async Task EnsureSchemaVersionTableAsync(DbConnection connection, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = @"
            CREATE TABLE IF NOT EXISTS _SchemaVersions (
                Version INTEGER PRIMARY KEY NOT NULL,
                Name TEXT NOT NULL,
                AppliedAt TEXT NOT NULL
            );";
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static IReadOnlyList<MigrationStep> BuildMigrations()
    {
        return new List<MigrationStep>
        {
            new MigrationStep(1, "001_InitialSchema", async (connection, transaction) =>
            {
                await using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS Books (
                        Id TEXT PRIMARY KEY NOT NULL,
                        Sha256 TEXT NOT NULL,
                        Title TEXT NOT NULL,
                        Author TEXT,
                        PageCount INTEGER NOT NULL,
                        FileSizeBytes INTEGER NOT NULL,
                        FilePath TEXT NOT NULL,
                        CoverPath TEXT,
                        Status INTEGER NOT NULL DEFAULT 0,
                        LastReadAt TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_Books_Sha256 ON Books (Sha256);
                    CREATE INDEX IF NOT EXISTS IX_Books_Title ON Books (Title);
                    CREATE INDEX IF NOT EXISTS IX_Books_Status ON Books (Status);
                    CREATE INDEX IF NOT EXISTS IX_Books_LastReadAt ON Books (LastReadAt);

                    CREATE TABLE IF NOT EXISTS ReadingPositions (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT NOT NULL UNIQUE,
                        PageIndex INTEGER NOT NULL,
                        OffsetPercent REAL NOT NULL,
                        Zoom REAL NOT NULL DEFAULT 1.0,
                        ViewMode INTEGER NOT NULL DEFAULT 0,
                        ActiveReadingSeconds INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_ReadingPositions_BookId ON ReadingPositions (BookId);

                    CREATE TABLE IF NOT EXISTS Annotations (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT NOT NULL,
                        PageIndex INTEGER NOT NULL,
                        Type INTEGER NOT NULL,
                        Color INTEGER NOT NULL,
                        RectsJson TEXT NOT NULL,
                        SelectedText TEXT,
                        Note TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS IX_Annotations_BookId_PageIndex ON Annotations (BookId, PageIndex);

                    CREATE TABLE IF NOT EXISTS Bookmarks (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT NOT NULL,
                        PageIndex INTEGER NOT NULL,
                        Label TEXT,
                        Color INTEGER,
                        IsDogEar INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS IX_Bookmarks_BookId_PageIndex ON Bookmarks (BookId, PageIndex);

                    CREATE TABLE IF NOT EXISTS Shelves (
                        Id TEXT PRIMARY KEY NOT NULL,
                        Name TEXT NOT NULL UNIQUE,
                        SortOrder INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_Shelves_Name ON Shelves (Name);

                    CREATE TABLE IF NOT EXISTS Tags (
                        Id TEXT PRIMARY KEY NOT NULL,
                        Name TEXT NOT NULL UNIQUE,
                        ColorHex TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_Tags_Name ON Tags (Name);

                    CREATE TABLE IF NOT EXISTS BookShelves (
                        BookId TEXT NOT NULL,
                        ShelfId TEXT NOT NULL,
                        AddedAt TEXT NOT NULL,
                        PRIMARY KEY (BookId, ShelfId),
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE,
                        FOREIGN KEY (ShelfId) REFERENCES Shelves (Id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS BookTags (
                        BookId TEXT NOT NULL,
                        TagId TEXT NOT NULL,
                        AddedAt TEXT NOT NULL,
                        PRIMARY KEY (BookId, TagId),
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE,
                        FOREIGN KEY (TagId) REFERENCES Tags (Id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS Jobs (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT,
                        Type INTEGER NOT NULL,
                        Status INTEGER NOT NULL DEFAULT 0,
                        Progress REAL NOT NULL DEFAULT 0.0,
                        Priority INTEGER NOT NULL DEFAULT 5,
                        ErrorMessage TEXT,
                        StartedAt TEXT,
                        CompletedAt TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE SET NULL
                    );

                    CREATE INDEX IF NOT EXISTS IX_Jobs_Status_Priority ON Jobs (Status, Priority);
                ";
                await cmd.ExecuteNonQueryAsync();
            }),
            new MigrationStep(2, "002_AnnotationAnchorsAndStudy", async (connection, transaction) =>
            {
                await using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;
                cmd.CommandText = """
                    ALTER TABLE Bookmarks ADD COLUMN CharacterOffset INTEGER;
                    ALTER TABLE Annotations ADD COLUMN AnchorPrefix TEXT;
                    ALTER TABLE Annotations ADD COLUMN AnchorSuffix TEXT;
                    ALTER TABLE Annotations ADD COLUMN CharacterOffset INTEGER;
                    ALTER TABLE Annotations ADD COLUMN ExtractorVersion INTEGER NOT NULL DEFAULT 1;
                    ALTER TABLE Annotations ADD COLUMN IsDetached INTEGER NOT NULL DEFAULT 0;
                    ALTER TABLE Annotations ADD COLUMN Tags TEXT;
                    CREATE INDEX IX_Annotations_Type ON Annotations (Type);
                    CREATE TABLE ChapterSummaries (
                        Id TEXT PRIMARY KEY NOT NULL, BookId TEXT NOT NULL, ChapterTitle TEXT NOT NULL,
                        StartPageIndex INTEGER NOT NULL, EndPageIndex INTEGER NOT NULL,
                        SummaryMarkdown TEXT NOT NULL, CreatedAt INTEGER NOT NULL
                    );
                    CREATE INDEX IX_ChapterSummaries_BookId_ChapterTitle ON ChapterSummaries (BookId, ChapterTitle);
                    CREATE TABLE Flashcards (
                        Id TEXT PRIMARY KEY NOT NULL, BookId TEXT NOT NULL, AnnotationId TEXT,
                        Front TEXT NOT NULL, Back TEXT NOT NULL, RepetitionNumber INTEGER NOT NULL,
                        EasinessFactor REAL NOT NULL, IntervalDays INTEGER NOT NULL,
                        NextReviewDate INTEGER NOT NULL, LastReviewedAt INTEGER, CreatedAt INTEGER NOT NULL
                    );
                    CREATE INDEX IX_Flashcards_BookId_NextReviewDate ON Flashcards (BookId, NextReviewDate);
                    CREATE TABLE VocabularyItems (
                        Id TEXT PRIMARY KEY NOT NULL, BookId TEXT NOT NULL, PageIndex INTEGER NOT NULL,
                        Word TEXT NOT NULL, Definition TEXT NOT NULL, ContextSnippet TEXT NOT NULL,
                        CreatedAt INTEGER NOT NULL
                    );
                    CREATE INDEX IX_VocabularyItems_BookId_Word ON VocabularyItems (BookId, Word);
                    """;
                await cmd.ExecuteNonQueryAsync();
                // Early versions wrote both ISO dates and EF's packed integer dates.
                // Normalize ISO values without changing already packed dates.
                var converter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.DateTimeOffsetToBinaryConverter();
                var encode = converter.ConvertToProviderExpression.Compile();
                foreach (var (table, columns) in new[] {
                    ("Books", new[] { "LastReadAt", "CreatedAt", "UpdatedAt" }),
                    ("ReadingPositions", new[] { "CreatedAt", "UpdatedAt" }),
                    ("Annotations", new[] { "CreatedAt", "UpdatedAt" }),
                    ("Bookmarks", new[] { "CreatedAt", "UpdatedAt" }),
                    ("Shelves", new[] { "CreatedAt", "UpdatedAt" }),
                    ("Tags", new[] { "CreatedAt", "UpdatedAt" }),
                    ("BookShelves", new[] { "AddedAt" }),
                    ("BookTags", new[] { "AddedAt" }),
                    ("Jobs", new[] { "StartedAt", "CompletedAt", "CreatedAt", "UpdatedAt" }) })
                {
                    foreach (var column in columns)
                    {
                        cmd.CommandText = $"SELECT rowid, {column} FROM {table} WHERE {column} LIKE '%-%';";
                        var dates = new List<(long Row, long Value)>();
                        await using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                                dates.Add((reader.GetInt64(0), encode(DateTimeOffset.Parse(reader.GetString(1), System.Globalization.CultureInfo.InvariantCulture))));
                        }
                        foreach (var (row, value) in dates)
                        {
                            cmd.CommandText = $"UPDATE {table} SET {column} = @value WHERE rowid = @row;";
                            cmd.Parameters.Clear();
                            var p1 = cmd.CreateParameter(); p1.ParameterName = "@value"; p1.Value = value; cmd.Parameters.Add(p1);
                            var p2 = cmd.CreateParameter(); p2.ParameterName = "@row"; p2.Value = row; cmd.Parameters.Add(p2);
                            await cmd.ExecuteNonQueryAsync();
                        }
                        cmd.Parameters.Clear();
                    }
                }
            }),
            new MigrationStep(3, "003_TrashAndReadingProgress", async (connection, transaction) =>
            {
                await using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;
                cmd.CommandText = """
                    ALTER TABLE Books ADD COLUMN TrashedAt INTEGER;
                    ALTER TABLE Books ADD COLUMN FurthestPageIndex INTEGER NOT NULL DEFAULT 0;
                    UPDATE Books SET FurthestPageIndex = COALESCE((SELECT PageIndex FROM ReadingPositions WHERE BookId = Books.Id), 0);
                    CREATE INDEX IX_Books_TrashedAt ON Books (TrashedAt);
                    """;
                await cmd.ExecuteNonQueryAsync();
            }),
            new MigrationStep(4, "004_ExplicitReadingStatus", async (connection, transaction) =>
            {
                await using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;
                cmd.CommandText = """
                    ALTER TABLE Books ADD COLUMN StatusIsManual INTEGER NOT NULL DEFAULT 0;
                    UPDATE Books SET StatusIsManual = 1;
                    """;
                await cmd.ExecuteNonQueryAsync();
            }),
            new MigrationStep(5, "005_DocumentText", async (connection, transaction) =>
            {
                await using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;
                cmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS DocumentPages (
                        BookId TEXT NOT NULL, PageIndex INTEGER NOT NULL,
                        Text TEXT NOT NULL, WordsJson TEXT NOT NULL, IsOcr INTEGER NOT NULL,
                        PRIMARY KEY (BookId, PageIndex),
                        FOREIGN KEY (BookId) REFERENCES Books(Id) ON DELETE CASCADE);
                    """;
                await cmd.ExecuteNonQueryAsync();
            })
        };
    }
}

