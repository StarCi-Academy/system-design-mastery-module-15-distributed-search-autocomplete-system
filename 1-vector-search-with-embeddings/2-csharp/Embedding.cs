namespace VectorSearchService;

/// <summary>
/// Turns text into a 384-dim L2-normalized vector. In production this wraps the
/// all-MiniLM-L6-v2 model via ONNX Runtime; here it is a deterministic
/// feature-hashing stand-in so the service is self-contained for smoke tests.
/// </summary>
public sealed class EmbeddingService
{
    public const int Dimensions = 384;

    public float[] Encode(string text)
    {
        var vec = new float[Dimensions];
        for (var i = 0; i < text.Length; i++)
        {
            var idx = (text[i] + i) % Dimensions;
            vec[idx] += 1.0f;
        }
        return L2Normalize(vec);
    }

    private static float[] L2Normalize(float[] v)
    {
        double sum = 0;
        foreach (var x in v)
        {
            sum += (double)x * x;
        }
        if (sum == 0)
        {
            return v;
        }
        var norm = (float)(1.0 / Math.Sqrt(sum));
        for (var i = 0; i < v.Length; i++)
        {
            v[i] *= norm;
        }
        return v;
    }
}
