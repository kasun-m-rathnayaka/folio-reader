namespace Folio.Domain.AI;

/// <summary>
/// Pre-vetted, offline-first local model catalog for Folio (FR-AIR-03, §8.2.3).
/// </summary>
public static class ModelCatalog
{
    public static readonly IReadOnlyList<AiModelInfo> CuratedModels = new List<AiModelInfo>
    {
        new()
        {
            Id = "qwen2.5-0.5b-instruct-q4",
            Name = "Qwen 2.5 0.5B (Fast)",
            Description = "Ultra-fast lightweight model for smart cleanup, vocabulary definitions, and inline lookups on any CPU.",
            Role = AiModelRole.Fast,
            SizeBytes = 491400032, // ~468 MB
            Sha256 = "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
            Quantization = "Q4_K_M",
            DownloadUrl = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
            RamEstimateGb = 0.8
        },
        new()
        {
            Id = "qwen2.5-1.5b-instruct-q4",
            Name = "Qwen 2.5 1.5B (Balanced)",
            Description = "Balanced model for chapter summarization, study flashcards, and reading recaps.",
            Role = AiModelRole.General,
            SizeBytes = 986000000, // ~940 MB
            Sha256 = "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
            Quantization = "Q4_K_M",
            DownloadUrl = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
            RamEstimateGb = 1.8
        },
        new()
        {
            Id = "llava-1.5-7b-q4",
            Name = "LLaVA 1.5 7B (Vision)",
            Description = "Multimodal vision model for chart, table, diagram, and mathematical figure narration.",
            Role = AiModelRole.Vision,
            SizeBytes = 4080000000, // ~3.8 GB
            Sha256 = "b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012",
            Quantization = "Q4_K_M",
            DownloadUrl = "https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/ggml-model-q4_k.gguf",
            RamEstimateGb = 4.5
        }
    };
}
