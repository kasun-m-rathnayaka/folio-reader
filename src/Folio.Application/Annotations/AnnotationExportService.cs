using System.Text;
using System.Text.Json;
using Folio.Application.Annotations.DTOs;

namespace Folio.Application.Annotations;

public class AnnotationExportService : IAnnotationExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public string ExportToMarkdown(Guid bookId, string bookTitle, string? author, IReadOnlyList<AnnotationDto> annotations)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# Annotations & Notes — {bookTitle}");
        if (!string.IsNullOrWhiteSpace(author))
        {
            sb.AppendLine($"*Author:* {author}");
        }
        sb.AppendLine($"*Exported:* {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
        sb.AppendLine($"*Total Annotations:* {annotations.Count}");
        sb.AppendLine();
        sb.AppendLine("---");
        sb.AppendLine();

        var grouped = annotations.OrderBy(a => a.PageIndex).GroupBy(a => a.PageIndex);

        foreach (var group in grouped)
        {
            sb.AppendLine($"## Page {group.Key + 1}");
            sb.AppendLine();

            foreach (var ann in group)
            {
                string deepLink = $"folio://book/{bookId}?page={ann.PageIndex}&ann={ann.Id}";
                sb.AppendLine($"### [{ann.Type}] ({ann.Color}) — [Jump to location]({deepLink})");

                if (!string.IsNullOrWhiteSpace(ann.SelectedText))
                {
                    sb.AppendLine($"> \"{ann.SelectedText.Trim()}\"");
                    sb.AppendLine();
                }

                if (!string.IsNullOrWhiteSpace(ann.Note))
                {
                    sb.AppendLine($"**Note:** {ann.Note.Trim()}");
                    sb.AppendLine();
                }

                if (!string.IsNullOrWhiteSpace(ann.Tags))
                {
                    sb.AppendLine($"*Tags:* `{ann.Tags}`");
                    sb.AppendLine();
                }

                sb.AppendLine($"*Added:* {ann.CreatedAt:yyyy-MM-dd HH:mm}");
                sb.AppendLine();
            }

            sb.AppendLine("---");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    public string ExportToJson(Guid bookId, string bookTitle, string? author, IReadOnlyList<AnnotationDto> annotations)
    {
        var payload = new
        {
            BookId = bookId,
            BookTitle = bookTitle,
            Author = author,
            ExportedAt = DateTimeOffset.UtcNow,
            Annotations = annotations
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    public string ExportToCsv(Guid bookId, string bookTitle, IReadOnlyList<AnnotationDto> annotations)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Id,BookTitle,Page,Type,Color,SelectedText,Note,Tags,DeepLink,CreatedAt");

        foreach (var ann in annotations.OrderBy(a => a.PageIndex))
        {
            string deepLink = $"folio://book/{bookId}?page={ann.PageIndex}&ann={ann.Id}";
            sb.AppendLine(string.Join(",",
                EscapeCsv(ann.Id.ToString()),
                EscapeCsv(bookTitle),
                ann.PageIndex + 1,
                EscapeCsv(ann.Type.ToString()),
                EscapeCsv(ann.Color.ToString()),
                EscapeCsv(ann.SelectedText ?? string.Empty),
                EscapeCsv(ann.Note ?? string.Empty),
                EscapeCsv(ann.Tags ?? string.Empty),
                EscapeCsv(deepLink),
                EscapeCsv(ann.CreatedAt.ToString("o"))
            ));
        }

        return sb.ToString();
    }

    public string FormatQuoteCitation(string quote, string bookTitle, string? author, int pageIndex)
    {
        string cleanQuote = quote.Trim();
        string authorStr = !string.IsNullOrWhiteSpace(author) ? $"{author}, " : string.Empty;
        return $"\"{cleanQuote}\" — {authorStr}{bookTitle} (p. {pageIndex + 1})";
    }

    private static string EscapeCsv(string field)
    {
        if (field.Contains(',') || field.Contains('"') || field.Contains('\n') || field.Contains('\r'))
        {
            return $"\"{field.Replace("\"", "\"\"")}\"";
        }
        return field;
    }
}
