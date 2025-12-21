import fs from 'node:fs';
import path from 'node:path';
import eventSourcesJSON from '@/assets/event_sources.json';
import { applyEventTags } from '@/utils/util';

// --- Helper Functions ---
function findImageUrls(description: string): string[] {
    if (!description) return [];
    const imageUrlRegex = /(https?:\/\/[^\s"<>]+?\.(jpg|jpeg|png|gif|bmp|svg|webp))/g;
    const matches = description.match(imageUrlRegex);
    const uniqueMatches = matches ? [...new Set(matches)] : [];
    return uniqueMatches || [];
}

function formatTitleAndDateToID(inputDate: any, title: string) {
    const date = new Date(inputDate);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
  
    function getFirstThreeUrlCompatibleChars(inputTitle: string): string {
        const urlCompatibleChars = /^[A-Za-z]+$/;
        inputTitle = inputTitle || 'und';
        return Array.from(inputTitle)
            .filter(char => urlCompatibleChars.test(char))
            .slice(0, 3)
            .join('')
            .toLowerCase();
    }
    const titlePrefix = getFirstThreeUrlCompatibleChars(title);
    return `${year}${month}${day}${hours}${minutes}${titlePrefix}`;
}

// --- Main Handler ---
export default defineEventHandler(async (event) => {
    
    // We will collect results from ALL configured sources
    const allResults = [];

    // Loop through every entry in your 'apifyMeetup' config
    for (const sourceConfig of eventSourcesJSON.apifyMeetup) {
        
        // Skip if no JSON file is specified for this source
        if (!sourceConfig.jsonFile) {
            continue;
        }

        try {
            console.log(`Processing source: ${sourceConfig.name} -> File: ${sourceConfig.jsonFile}`);

            // 1. DYNAMICALLY READ THE FILE
            // This assumes your files are in the 'assets' folder at the project root
            const filePath = path.resolve(process.cwd(), 'assets', sourceConfig.jsonFile);
            
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                continue;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const rawData = JSON.parse(fileContent);

            // 2. TRANSFORM DATA (Standard Meetup Logic)
            const events = rawData.map((item: any) => {
                let title = item.title || 'Untitled Event';
                let description = item.description || '';
                
                // Prefix/Suffix from Config
                if (sourceConfig.prefixTitle) { title = sourceConfig.prefixTitle + title; }
                if (sourceConfig.suffixTitle) { title += sourceConfig.suffixTitle; }
                
                // Add the tags specific to THIS source (e.g. #sports vs #hiking)
                if (sourceConfig.suffixDescription) { description += sourceConfig.suffixDescription; }

                if (item.tags && Array.isArray(item.tags)) {
                    description += ' ' + item.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
                }

                const tags = applyEventTags(sourceConfig, title, description);
                const extractedImages = findImageUrls(description);
                if (item.image) extractedImages.unshift(item.image);
                if (item.group?.image) extractedImages.push(item.group.image);

                const startDateObj = new Date(item.dateTime);
                const endDateObj = new Date(startDateObj.getTime() + (2 * 60 * 60 * 1000));

                let locationString = sourceConfig.defaultLocation || 'Location not specified';
                if (item.location) {
                    const venue = item.location.venue || '';
                    const address = item.location.address || '';
                    locationString = [venue, address].filter(Boolean).join(', ');
                }

                return {
                    id: formatTitleAndDateToID(startDateObj, title),
                    title: title,
                    org: item.group?.name || sourceConfig.name,
                    start: startDateObj.toISOString(),
                    end: endDateObj.toISOString(),
                    url: item.url,
                    location: locationString,
                    description: description,
                    images: [...new Set(extractedImages)],
                    tags,
                };
            });

            // Add this batch to our results
            allResults.push({
                events,
                city: sourceConfig.city,
                name: sourceConfig.name
            });

        } catch (error) {
            console.error(`Error processing ${sourceConfig.jsonFile}:`, error);
        }
    }

    // Return all batches combined
    return {
        body: allResults
    };
});