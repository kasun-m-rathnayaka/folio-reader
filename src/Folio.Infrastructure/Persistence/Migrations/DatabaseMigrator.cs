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
        string timestamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd_HHmmss");
        string backupFileName = $"pre_migration_v{currentVersion}_{timestamp}.db";
        string backupFilePath = Path.Combine(_fileStore.BackupsDirectory, backupFileName);

        // If in-memory database or file doesn't exist yet, no physical pre-migration backup required
        if (string.Equals(connection.DataSource, ":memory:", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(connection.DataSource) ||
            !File.Exists(connection.DataSource))
        {
            return null;
        }

        try
        {
            await using var command = connection.CreateCommand();
            // SQLite VACUUM INTO produces an atomic point-in-time copy under WAL mode
            command.CommandText = $"VACUUM INTO '{backupFilePath.Replace("'", "''")}';";
            await command.ExecuteNonQueryAsync(cancellationToken);
            return backupFilePath;
        }
        catch
        {
            // Fallback: standard file copy if VACUUM INTO is unsupported
            try
            {
                File.Copy(connection.DataSource, backupFilePath, overwrite: true);
                return backupFilePath;
            }
            catch
            {
                return null;
            }
        }
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

                // If backup was created, restore from it if disk file exists and transaction rollback was not enough
                if (!string.IsNullOrEmpty(backupPath) && File.Exists(backupPath) && File.Exists(connection.DataSource))
                {
                    try
                    {
                        connection.Close();
                        File.Copy(backupPath, connection.DataSource, overwrite: true);
                    }
                    catch
                    {
                        // Best effort restore
                    }
                }

                throw new InvalidOperationException(
                    $"Migration {migration.Version} ({migration.Name}) failed and was rolled back: {ex.Message}", ex);
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
            })
        };
    }
}

