import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[TEST] Testing Instagram data access");
    
    const filePath = path.resolve(process.cwd(), 'public', 'calendar_data.json');
    console.log(`[TEST] File path: ${filePath}`);
    console.log(`[TEST] File exists: ${fs.existsSync(filePath)}`);
    
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        console.log(`[TEST] Found ${data.length} sources`);
        
        return {
            success: true,
            sources: data.length,
            firstSource: data[0]?.name,
            firstSourceEvents: data[0]?.events?.length || 0
        };
    }
    
    return { success: false, error: "File not found" };
});
