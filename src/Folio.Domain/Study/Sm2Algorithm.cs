namespace Folio.Domain.Study;

/// <summary>
/// Mathematical implementation of the SuperMemo SM-2 Spaced Repetition Algorithm (§8.2.6, FR-AIS-06).
/// Calculates optimal review intervals based on user recall quality scores (0 to 5).
/// </summary>
public static class Sm2Algorithm
{
    public const double MinimumEasinessFactor = 1.3;
    public const double DefaultEasinessFactor = 2.5;

    public record Sm2Result(int Repetitions, double EasinessFactor, int IntervalDays, DateTimeOffset NextReviewDate);

    /// <summary>
    /// Computes the next interval, repetition count, and easiness factor.
    /// </summary>
    /// <param name="quality">Quality rating between 0 (complete blackout) and 5 (perfect recall).</param>
    /// <param name="currentRepetitions">Current consecutive successful review count.</param>
    /// <param name="currentEasinessFactor">Current easiness factor (EF >= 1.3).</param>
    /// <param name="currentIntervalDays">Current interval in days.</param>
    /// <param name="reviewTime">Timestamp of review (defaults to UtcNow).</param>
    public static Sm2Result Calculate(
        int quality,
        int currentRepetitions,
        double currentEasinessFactor,
        int currentIntervalDays,
        DateTimeOffset? reviewTime = null)
    {
        int q = Math.Clamp(quality, 0, 5);
        DateTimeOffset now = reviewTime ?? DateTimeOffset.UtcNow;

        double ef = currentEasinessFactor <= 0 ? DefaultEasinessFactor : currentEasinessFactor;

        // Calculate new EF: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        double efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
        double newEf = Math.Max(MinimumEasinessFactor, ef + efDelta);

        int newRepetitions;
        int newIntervalDays;

        if (q < 3)
        {
            // Failed recall: reset repetitions back to 0, schedule review for tomorrow
            newRepetitions = 0;
            newIntervalDays = 1;
        }
        else
        {
            // Successful recall
            if (currentRepetitions == 0)
            {
                newIntervalDays = 1;
            }
            else if (currentRepetitions == 1)
            {
                newIntervalDays = 6;
            }
            else
            {
                newIntervalDays = (int)Math.Round(currentIntervalDays * newEf);
                if (newIntervalDays <= currentIntervalDays)
                {
                    newIntervalDays = currentIntervalDays + 1;
                }
            }

            newRepetitions = currentRepetitions + 1;
        }

        DateTimeOffset nextReviewDate = now.AddDays(newIntervalDays);
        return new Sm2Result(newRepetitions, Math.Round(newEf, 2), newIntervalDays, nextReviewDate);
    }
}
