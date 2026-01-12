import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] ===== READING LOCAL FILE =====");
    
    try {
        // Construct the path to server/assets/instagram_data.json
        // process.cwd() is the root of your project
        const filePath = path.resolve(process.cwd(), 'server', 'assets', 'instagram_data.json');
        
        console.log(`[Instagram] Looking for file at: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error("[Instagram] File NOT found at path!");
            // List folder contents to help you debug path issues
            const dir = path.dirname(filePath);
            if (fs.existsSync(dir)) {
                console.log(`[Instagram] Contents of ${dir}:`, fs.readdirSync(dir));
            } else {
                console.log(`[Instagram] Directory ${dir} does not exist`);
            }
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        if (!fileContent) {
            console.warn("[Instagram] File is empty");
            return { body: [] };
        }

        const calendarData = JSON.parse(fileContent);

        if (Array.isArray(calendarData)) {
            console.log(`[Instagram] Successfully loaded ${calendarData.length} items from local file.`);
            return { body: calendarData };
        } else {
            console.error("[Instagram] Data is not an array");
            return { body: [] };
        }

    } catch (error) {
        console.error("[Instagram] System Error:", error);
        return { body: [] };
    }
});