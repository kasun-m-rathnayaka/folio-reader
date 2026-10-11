namespace Folio.Domain.AI;

public enum AiModelRole
{
    Fast = 0,        // Text cleanup, dictionary lookups (e.g. Qwen2.5-0.5B)
    General = 1,     // Chapter summaries, return recaps, flashcards (e.g. Qwen2.5-1.5B/3B)
    Vision = 2,      // Figure and chart narration (e.g. LLaVA-1.5)
    Reasoning = 3    // Deep study questions (e.g. DeepSeek-R1-Distill)
}

public enum ModelStatus
{
    NotDownloaded = 0,
    Downloading = 1,
    Ready = 2,
    Failed = 3
}

public record AiModelInfo
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Description { get; init; }
    public required AiModelRole Role { get; init; }
    public required long SizeBytes { get; init; }
    public required string Sha256 { get; init; }
    public required string Quantization { get; init; }
    public required string DownloadUrl { get; init; }
    public string? LocalPath { get; set; }
    public ModelStatus Status { get; set; } = ModelStatus.NotDownloaded;
    public double RamEstimateGb { get; init; } = 1.0;
}
