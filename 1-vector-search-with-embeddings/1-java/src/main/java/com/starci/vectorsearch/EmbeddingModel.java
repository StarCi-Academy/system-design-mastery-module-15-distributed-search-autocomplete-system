package com.starci.vectorsearch;

import org.springframework.stereotype.Component;

/**
 * Turns text into a 384-dim L2-normalized vector. In production this wraps the
 * all-MiniLM-L6-v2 model via DJL/ONNX Runtime; here it is a deterministic
 * feature-hashing stand-in so the service is self-contained for smoke tests.
 */
@Component
public class EmbeddingModel {

    public static final int DIMENSIONS = 384;

    public float[] encode(String text) {
        float[] vec = new float[DIMENSIONS];
        for (int i = 0; i < text.length(); i++) {
            int idx = (text.charAt(i) + i) % DIMENSIONS;
            vec[idx] += 1.0f;
        }
        return l2Normalize(vec);
    }

    private float[] l2Normalize(float[] v) {
        double sum = 0;
        for (float x : v) {
            sum += (double) x * x;
        }
        if (sum == 0) {
            return v;
        }
        float norm = (float) (1.0 / Math.sqrt(sum));
        for (int i = 0; i < v.length; i++) {
            v[i] *= norm;
        }
        return v;
    }
}
