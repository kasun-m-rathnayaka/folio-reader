namespace Folio.Application.Common.Interfaces;

/// <summary>The native window flushes the current reader before allowing an orderly close.</summary>
public interface IReadingSessionLifetime
{
    Func<Task>? SaveBeforeClose { get; set; }
}
