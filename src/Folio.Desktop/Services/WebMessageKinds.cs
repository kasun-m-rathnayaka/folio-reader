using System.Text.Json;

namespace Folio.Desktop.Services;

public static class WebMessageKinds
{
    public static bool Is(JsonElement payload, string kind) => payload.ValueKind == JsonValueKind.Object &&
        payload.TryGetProperty("kind", out var value) && value.ValueKind == JsonValueKind.String && value.GetString() == kind;
}
