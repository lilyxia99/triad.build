export default defineEventHandler(async (event) => {
    console.log("[Instagram] ===== READING ASSET VIA STORAGE =====");

    try {
        // Nuxt automatically mounts 'server/assets' to 'assets:server'
        // useStorage().getItem() automatically parses JSON files!
        const data = await useStorage().getItem('assets:server:instagram_data.json');

        if (!data) {
            console.warn("[Instagram] File is empty or not found via storage");
            return { body: [] };
        }

        console.log(`[Instagram] Successfully loaded item from storage.`);
        
        // Since getItem parses JSON automatically, 'data' is already an object/array
        return { body: data };

    } catch (error) {
        console.error("[Instagram] Storage Error:", error);
        return { body: [] };
    }
});