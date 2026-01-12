import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    const debug = {
        timestamp: new Date().toISOString(),
        cwd: process.cwd(),
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
        paths: {
            publicExists: false,
            publicFiles: [],
            calendarFileExists: false,
            calendarFileSize: 0,
            calendarFileContent: null
        }
    };

    try {
        // Check if public directory exists
        const publicDir = path.resolve(process.cwd(), 'public');
        debug.paths.publicExists = fs.existsSync(publicDir);
        
        if (debug.paths.publicExists) {
            debug.paths.publicFiles = fs.readdirSync(publicDir);
        }

        // Check calendar data file
        const calendarFile = path.resolve(process.cwd(), 'server', 'instagram_data.json');
        debug.paths.calendarFileExists = fs.existsSync(calendarFile);
        
        if (debug.paths.calendarFileExists) {
            const stats = fs.statSync(calendarFile);
            debug.paths.calendarFileSize = stats.size;
            
            // Read first 500 characters to see if file has content
            const content = fs.readFileSync(calendarFile, 'utf-8');
            debug.paths.calendarFileContent = {
                length: content.length,
                preview: content.substring(0, 500),
                isValidJson: false,
                parsedLength: 0
            };
            
            try {
                const parsed = JSON.parse(content);
                debug.paths.calendarFileContent.isValidJson = true;
                debug.paths.calendarFileContent.parsedLength = Array.isArray(parsed) ? parsed.length : 0;
            } catch (e) {
                debug.paths.calendarFileContent.parseError = e.message;
            }
        }

    } catch (error) {
        debug.error = error.message;
    }

    return debug;
});
