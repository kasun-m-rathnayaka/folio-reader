using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Infrastructure.Persistence;

/// <summary>
/// Runs the versioned migrations (FR-DAT-04) against whichever SQLite provider the host registered.
/// Hosted workers may query Jobs immediately, so hosts call this before starting them.
/// </summary>
public sealed class MigratingDatabaseSetup(IServiceScopeFactory scopes) : IDatabaseSetup
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IDatabaseMigrator>().MigrateAsync(cancellationToken);
    }
}
