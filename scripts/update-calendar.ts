async function processSingleSource(source: InstagramSource, openai: OpenAI, visionClient: any) {
    try {
        console.log(`\n🔍 [START] Processing @${source.username}...`);
        
        const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
        const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
        
        // 1. UPDATED LIMIT: Increased to 25 to catch older flyers
        const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(25){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type,thumbnail_url}}}&access_token=${token}`;
        
        const res = await fetch(url);
        
        // 2. DEBUG: API Network Failures
        if (!res.ok) {
            const txt = await res.text();
            if (txt.includes('(#4)')) console.warn(`   ⚠️ [Rate Limit] @${source.username} temporarily blocked.`);
            else console.warn(`   ❌ [API Error] @${source.username} returned ${res.status}: ${txt.substring(0, 150)}`);
            return null;
        }
        
        const data = await res.json();

        // 3. DEBUG: Detect Personal vs Business Accounts
        if (!data.business_discovery) {
            console.warn(`   ⚠️ [Data Missing] @${source.username} returned no business data. Likely a PERSONAL account or AGE-GATED.`);
            console.log(`   --> API Response dump: ${JSON.stringify(data).substring(0, 200)}...`);
            return null;
        }

        const posts = data.business_discovery?.media?.data || [];
        console.log(`   📡 Fetched ${posts.length} posts from API.`);

        if (posts.length === 0) {
            console.warn(`   ⚠️ Account exists but has 0 posts available to API.`);
            return null;
        }

        let sourceEvents: any[] = [];
        let postCounter = 0;

        for (const post of posts) {
            postCounter++;
            const postDateObj = new Date(post.timestamp);
            const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Gather Media
            let mediaUrls: string[] = [];
            if (post.media_type === 'CAROUSEL_ALBUM' && post.children?.data) {
                mediaUrls = post.children.data.map((child: any) => 
                    (child.media_type === 'VIDEO' && child.thumbnail_url) ? child.thumbnail_url : child.media_url
                ).filter(Boolean);
            } else {
                const singleUrl = (post.media_type === 'VIDEO' && post.thumbnail_url) ? post.thumbnail_url : post.media_url;
                if (singleUrl) mediaUrls.push(singleUrl);
            }

            // 4. DEBUG: Empty Posts
            if (mediaUrls.length === 0 && !post.caption) {
                console.log(`   ⏭️ [Skip] Post ${postCounter}: No media URL and no caption.`);
                continue;
            }

            // OCR
            let ocrTextData = "";
            if (visionClient && mediaUrls.length > 0) {
                // console.log(`      ...Running OCR on Post ${postCounter}`); // Optional: Comment out if too noisy
                const imagesToScan = mediaUrls.slice(0, 3);
                const ocrResults = await Promise.all(imagesToScan.map(url => doOCR(visionClient, url)));
                ocrTextData = ocrResults
                    .map((txt, idx) => `\n--- IMG ${idx + 1} ---\n${txt}\n`)
                    .join("\n");
            }

            // 5. DEBUG: Check what we are sending AI
            const captionLen = post.caption ? post.caption.length : 0;
            const ocrLen = ocrTextData.length;
            
            if (captionLen < 5 && ocrLen < 10) {
                 console.log(`   ⏭️ [Skip] Post ${postCounter}: Not enough text data (Caption: ${captionLen} chars, OCR: ${ocrLen} chars).`);
                 continue;
            }

            // AI Analysis
            const aiResponse = await analyzeWithAI(openai, post.caption || "", ocrTextData, source.context_clues?.join(', ') || "", postDateString);

            if (aiResponse && aiResponse.events.length > 0) {
                console.log(`   ✅ [AI Match] Post ${postCounter} (${postDateString}): Found ${aiResponse.events.length} event(s).`);
                
                const now = new Date();
                
                for (const ev of aiResponse.events) {
                    if (!ev.startDay) {
                        console.log(`      ⚠️ Skipped event "${ev.title}" (Missing start day)`);
                        continue;
                    }

                    const year = ev.startYear || now.getFullYear();
                    const monthIndex = (ev.startMonth || (now.getMonth() + 1)) - 1; 
                    
                    let start = new Date(year, monthIndex, ev.startDay, ev.startHourMilitaryTime || 12, ev.startMinute || 0);
                    
                    if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) start.setFullYear(year + 1);

                    let end = new Date(start);
                    if (ev.endHourMilitaryTime) end.setHours(ev.endHourMilitaryTime, ev.endMinute || 0);
                    else end.setHours(start.getHours() + 1);

                    let title = ev.title || "Instagram Event";
                    let description = post.caption || "";
                    if (!description && ocrTextData) description = "See flyer image for details.";
                    if (source.suffixDescription) description += source.suffixDescription;

                    const combinedText = `${title} ${description} ${source.name} ${ocrTextData}`;
                    const tags = generateTagsForPost(combinedText, source);

                    sourceEvents.push({
                        id: `ig-${post.id}-${sourceEvents.length + 1}`,
                        title,
                        org: source.name,
                        start: start.toISOString(),
                        end: end.toISOString(),
                        url: post.permalink,
                        location: ev.location || source.defaultLocation,
                        description,
                        images: mediaUrls,
                        tags: tags
                    });
                }
            } else {
                 // 6. DEBUG: AI found nothing
                 // console.log(`   zzz Post ${postCounter}: AI found 0 events.`);
            }
        }

        const uniqueEvents = removeDuplicates(sourceEvents);
        console.log(`   🎉 [Done] @${source.username}: ${uniqueEvents.length} unique events saved.`);
        return { events: uniqueEvents, city: source.city, name: source.name };

    } catch (e: any) {
        console.error(`   ❌ [CRITICAL FAIL] @${source.username}: ${e.message}`);
        return null;
    }
}
