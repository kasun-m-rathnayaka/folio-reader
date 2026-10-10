namespace Folio.Infrastructure.Persistence.Migrations;

/// <summary>
/// Forward-only versioned migration runner with automatic pre-migration backup (FR-DAT-04).
/// </summary>
public interface IDatabaseMigrator
{
    Task<int> GetCurrentVersionAsync(CancellationToken cancellationToken = default);
    Task<int> MigrateAsync(CancellationToken cancellationToken = default);
    Task<string?> CreatePreMigrationBackupAsync(CancellationToken cancellationToken = default);
}

