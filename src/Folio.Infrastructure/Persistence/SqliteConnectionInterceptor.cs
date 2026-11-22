using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Folio.Infrastructure.Persistence;

/// <summary>
/// Interceptor ensuring all opened SQLite connections enable WAL mode,
/// foreign key constraints, and standard busy timeout.
/// </summary>
public class SqliteConnectionInterceptor : DbConnectionInterceptor
{
    /// <summary>Pragmas run on every opened connection. Hosts whose storage cannot use WAL override this.</summary>
    protected virtual string PragmaCommands => "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        EnablePragmas(connection);
        base.ConnectionOpened(connection, eventData);
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await EnablePragmasAsync(connection, cancellationToken);
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }

    private void EnablePragmas(DbConnection connection)
    {
        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = PragmaCommands;
            command.ExecuteNonQuery();
        }
        catch (Exception)
        {
            // Silently ignore on read-only probing connections (e.g. EF Core Exists() probe)
        }
    }

    private async Task EnablePragmasAsync(DbConnection connection, CancellationToken cancellationToken)
    {
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = PragmaCommands;
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (Exception)
        {
            // Silently ignore on read-only probing connections
        }
    }
}

