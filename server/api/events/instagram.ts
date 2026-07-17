// Direct import — bundles the JSON into the server chunk at build time.
// This is more reliable than useStorage() on Vercel serverless, where the
// Nitro storage driver for 'assets:server:' may return null at runtime.
import instagramData from '../../assets/instagram_data.json';

export default defineEventHandler(async (event) => {
    try {
        if (!instagramData || !Array.isArray(instagramData)) {
            console.warn("[Instagram] Data not found or invalid");
            return { body: [] };
        }

        console.log(`[Instagram] Loaded ${instagramData.length} sources from bundled import.`);
        return { body: instagramData };
    } catch (error) {
        console.error("[Instagram] Error:", error);
        return { body: [] };
    }
});