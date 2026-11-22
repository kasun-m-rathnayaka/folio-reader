using System.Globalization;

using Folio.Domain.Enums;

namespace Folio.UI.Services;

/// <summary>
/// Every scene and view has an address (SPEC: routes), so Back/Forward, deep links and reload work. Addresses are
/// relative to the app's base href, so the web app also works under a sub-path (GitHub Pages project site).
/// </summary>
public static class FolioRoutes
{
    public const string Home = "./";
    public const string Trash = "trash";
    public const string Settings = "settings";

    /// <param name="book">A book to bring into focus (old <c>/book/{id}</c> links redirect here).</param>
    public static string Shelf(Guid? shelfId = null, ReadingStatus? status = null, string? query = null, Guid? book = null) =>
        WithQuery(shelfId is { } id ? $"shelf/{id}" : "shelf", ("status", status?.ToString()), ("q", query), ("book", book?.ToString()));
    public static string Read(Guid bookId, int? pageIndex = null) =>
        WithQuery($"book/{bookId}/read", ("page", pageIndex is { } p ? (p + 1).ToString(CultureInfo.InvariantCulture) : null));
    public static string Search(string query) => WithQuery("search", ("q", query));

    /// <summary>True for <c>/book/{id}/read</c>, where the library chrome is hidden.</summary>
    public static bool IsReader(string relativePath) =>
        relativePath.Split('?', '#')[0].TrimEnd('/') is var path && path.StartsWith("book/", StringComparison.Ordinal) && path.EndsWith("/read", StringComparison.Ordinal);

    private static string WithQuery(string path, params (string Key, string? Value)[] values)
    {
        var parts = values.Where(v => !string.IsNullOrWhiteSpace(v.Value)).Select(v => $"{v.Key}={Uri.EscapeDataString(v.Value!)}").ToArray();
        return parts.Length == 0 ? path : $"{path}?{string.Join('&', parts)}";
    }
}
