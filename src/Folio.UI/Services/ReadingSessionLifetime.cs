using Folio.Application.Common.Interfaces;

namespace Folio.UI.Services;

public class ReadingSessionLifetime : IReadingSessionLifetime
{
    public Func<Task>? SaveBeforeClose { get; set; }
}
