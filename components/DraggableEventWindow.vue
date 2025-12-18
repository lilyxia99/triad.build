<script setup lang="ts">
import sanitizeHtml from 'sanitize-html';
import { replaceBadgePlaceholders } from '~~/utils/util';
import { downloadICS } from '~~/utils/icsGenerator';

const props = defineProps<{
  event: any
  windowId: string
  initialX: number
  initialY: number
}>()

const emit = defineEmits<{
  'close': [windowId: string]
  'minimize': [windowId: string]
}>()

// Development environment flag
const isDevelopment = process.env.NODE_ENV === 'development';

// Window state
const windowRef = ref(null);
const isMinimized = ref(false);
const isDragging = ref(false);
const windowX = ref(props.initialX);
const windowY = ref(props.initialY);
const dragOffset = ref({ x: 0, y: 0 });

// Process event data
const eventTitle = computed(() => {
  const rawEventTitle = props.event?.title || '';
  return replaceBadgePlaceholders(rawEventTitle);
});

const eventTime = computed(() => {
  return props.event && props.event.start 
    ? props.event.start.toLocaleDateString() + ' @ ' + props.event.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    : '';
});

const eventHost = computed(() => props.event?.extendedProps?.org || '');
const eventLocation = computed(() => props.event?.extendedProps?.location || '');
const eventURL = props.event?.url;
const eventID = props.event?.id;
const eventTags = props.event?.extendedProps?.tags;

const eventDescription = computed(() => {
  const rawDescription = props.event?.extendedProps?.description;
  return rawDescription && rawDescription.trim() 
    ? replaceBadgePlaceholders(sanitizeHtml(rawDescription))
    : "needs to be added";
});

const eventImages = computed(() => props.event?.extendedProps?.images || []);

// Image handling
const getImageUrls = () => {
  return eventImages.value.slice(0,3).map(url => `/api/fetchImage?url=${encodeURIComponent(url)}`);
};

let errorMessages = ref([]);

const handleImageError = (index) => {
  errorMessages.value[index] = `Failed to load image ${index + 1}.`;
};

const getImageClass = (index) => {
  const classes = ['single', 'double', 'triple'];
  return classes[index] || '';
};

// Location helper
function createGoogleMapsURL(location) {
  const encodedLocation = encodeURIComponent(location);
  return `https://www.google.com/maps/search/?q=${encodedLocation}`;
}

// Dragging functionality
const startDrag = (event) => {
  isDragging.value = true;
  const rect = windowRef.value.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (event) => {
  if (!isDragging.value) return;
  
  windowX.value = event.clientX - dragOffset.value.x;
  windowY.value = event.clientY - dragOffset.value.y;
  
  // Keep window within viewport bounds
  const maxX = window.innerWidth - 400;
  const maxY = window.innerHeight - 300;
  
  windowX.value = Math.max(0, Math.min(windowX.value, maxX));
  windowY.value = Math.max(0, Math.min(windowY.value, maxY));
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value;
};

const closeWindow = () => {
  emit('close', props.windowId);
};

// Function to handle ICS download
const handleDownloadICS = () => {
  downloadICS(props.event);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
});
</script>

<template>
  <div 
    ref="windowRef"
    class="draggable-window"
    :class="{ minimized: isMinimized, dragging: isDragging }"
    :style="{ 
      left: windowX + 'px', 
      top: windowY + 'px',
      zIndex: 1001
    }"
  >
    <!-- Window Title Bar -->
    <div class="window-titlebar" @mousedown="startDrag">
      <div class="window-title" v-html="eventTitle"></div>
      <div class="window-controls">
        <button class="window-btn minimize-btn" @click="toggleMinimize">
          {{ isMinimized ? '□' : '_' }}
        </button>
        <button class="window-btn close-btn" @click="closeWindow">×</button>
      </div>
    </div>
    
    <!-- Window Content -->
    <div v-if="!isMinimized" class="window-content">
      <div class="event-details">
        <span class="event-headers">Event Title:</span> 
        <span v-html="eventTitle" style="font-size: 1.2em; font-weight: bold;"></span><br>
        <span class="event-headers">Event Time:</span> <span style="text-decoration: underline;">{{ eventTime }}</span><br>
        <span class="event-headers">Event Host:</span> {{ eventHost }}<br>
        <span v-if="isDevelopment"> <span class="event-headers">Event Tags: </span> {{ eventTags }}<br> </span>
        <span v-if="isDevelopment && eventURL"> <span class="event-headers">Event URL:</span> <a :href="eventURL" target="_blank">Here</a><br> </span>
        <span class="event-headers">Event Location:</span> <a :href="createGoogleMapsURL(eventLocation)" target="_blank">{{ eventLocation }}</a><br>
        
        <!-- Display Images only if there are images -->
        <div v-if="eventImages && eventImages.length > 0" class="image-container">
          <div 
            class="image-wrapper"
            v-for="(url, index) in getImageUrls()" 
            :key="index"
          >
            <div v-if="errorMessages[index]">
              {{ errorMessages[index] }}
            </div>   
            <img
              class="event-image"
              v-else
              :src="url"
              :class="getImageClass(index)"
              @error="handleImageError(index)"
              alt="Image found within the description of this calendar event"
            />
          </div>
        </div>
        
        <span class="event-headers">Event Description:</span> 
        <div class="desc" v-html="eventDescription"></div><br>
      </div>
      
      <!-- Add buttons -->
      <div class="window-buttons">
        <button @click="handleDownloadICS" class="calendar-btn">
          📅 Add to Calendar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.draggable-window {
  position: fixed;
  width: 400px;
  max-height: 500px;
  background: var(--background-alt);
  border: 1px solid var(--border-outer);
  border-radius: 4px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
  font-family: var(--body-font);
  font-size: 12px;
  color: var(--text-normal);
  overflow: hidden;
}

.draggable-window.minimized {
  height: 32px;
  max-height: 32px;
}

.draggable-window.dragging {
  user-select: none;
}

.window-titlebar {
  background: var(--button-hover);
  color: var(--text-opp);
  padding: 6px 8px;
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-outer);
}

.window-title {
  font-weight: bold;
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-controls {
  display: flex;
  gap: 4px;
}

.window-btn {
  background: var(--background-inner);
  border: 1px solid var(--border-outer);
  color: var(--text-normal);
  width: 20px;
  height: 20px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
}

.window-btn:hover {
  background: var(--button-select);
}

.close-btn:hover {
  background: var(--rip-red);
  color: var(--text-white);
}

.window-content {
  padding: 12px;
  max-height: 456px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--button-hover) var(--background-inner);
}

.window-content::-webkit-scrollbar {
  width: 8px;
}

.window-content::-webkit-scrollbar-track {
  background: var(--background-inner);
  border-radius: 4px;
}

.window-content::-webkit-scrollbar-thumb {
  background: var(--button-hover);
  border-radius: 4px;
  border: 1px solid var(--border-outer);
}

.window-content::-webkit-scrollbar-thumb:hover {
  background: var(--button-select);
}

/* Reuse existing styles from EventModal */
.event-details {
  color: var(--text-normal);
  font-family: var(--body-font);
  font-size: 14px;
}

.event-headers {
  color: var(--text-normal);
  font-size: 16px;
}

.image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}

.event-image {
  height: auto;
  width: 100%;
  object-fit: cover;
  border-radius: 2%;
  border: 2px solid var(--button-hover);
  margin: auto;
}

.image-container .image-wrapper:first-of-type:nth-last-of-type(1) {
  width: 95%;
}

.image-container .image-wrapper:first-of-type:nth-last-of-type(2),
.image-container .image-wrapper:last-of-type:nth-of-type(2) {
  width: calc(48% - 5px);
  margin-right: 5px;
  margin-left: 5px;
  box-sizing: border-box;
}

.image-container .image-wrapper:nth-of-type(n+2):nth-of-type(-n+3) {
  width: calc(48% - 10px);
  margin-right: 5px;
  margin-left: 5px;
  box-sizing: border-box;
}

.image-container .image-wrapper:first-of-type:nth-last-of-type(3) {
  width: 95%;
}

.window-buttons {
  padding: 8px 0;
  border-top: 1px solid var(--border-outer);
  margin-top: 8px;
}

.calendar-btn {
  background: var(--background-inner);
  border: 1px solid var(--border-outer);
  color: var(--text-normal);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 2px;
  font-family: var(--body-font);
}

.calendar-btn:hover {
  background: var(--button-hover);
  color: var(--text-opp);
}
</style>
