import { Injectable } from "@nestjs/common"
import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers"

/**
 * Wraps the all-MiniLM-L6-v2 sentence-transformer and turns any text into a
 * deterministic 384-dim, L2-normalized embedding.
 */
@Injectable()
export class EmbeddingService {
    // Lazy-loaded singleton pipeline: load the model once, reuse for every call.
    private extractor: FeatureExtractionPipeline | null = null

    private async getExtractor(): Promise<FeatureExtractionPipeline> {
        if (!this.extractor) {
            // all-MiniLM-L6-v2 maps any sentence to a fixed 384-dim vector.
            this.extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
        }
        return this.extractor
    }

    async embed(text: string): Promise<number[]> {
        const extractor = await this.getExtractor()
        // mean-pooling + L2 normalize => deterministic unit vector, so cosine
        // distance reduces to a clean angle comparison and is reproducible.
        const output = await extractor(text, { pooling: "mean", normalize: true })
        return Array.from(output.data as Float32Array)
    }
}
