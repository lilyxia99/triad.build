<script setup lang="ts">
import sanitizeHtml from 'sanitize-html';
import { replaceBadgePlaceholders } from '~~/utils/util';
import { downloadICS } from '~~/utils/icsGenerator';

const props = defineProps<{
  event: any
  visible: boolean
  x: number
  y: number
}>()

const emit = defineEmits<{
  'tooltip-enter': []
  'tooltip-leave': []
}>()

// Process event data reactively using computed properties
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

const eventDescription = computed(() => {
  const rawDescription = props.event?.extendedProps?.description;
  return rawDescription && rawDescription.trim() 
    ? replaceBadgePlaceholders(sanitizeHtml(rawDescription))
    : "needs to be added";
});

const eventImages = computed(() => props.event?.extendedProps?.images || []);

// Function to extract image urls and construct proxy URLs
const getImageUrls = () => {
  return eventImages.value.slice(0,3).map(url => `/api/fetchImage?url=${encodeURIComponent(url)}`);
};

let errorMessages = ref([]); // To store error messages relating to image display

const handleImageError = (index) => {
  errorMessages.value[index] = `Failed to load image ${index + 1}.`;
};

// For displaying multiple images
const getImageClass = (index) => {
  const classes = ['single', 'double', 'triple'];
  return classes[index] || '';
};

// Function to handle ICS download
const handleDownloadICS = () => {
  downloadICS(props.event);
};
</script>

<template>
  <div 
    v-if="visible && event" 
    class="event-tooltip"
    :style="{ left: x + 'px', top: y + 'px' }"
    @mouseenter="$emit('tooltip-enter')"
    @mouseleave="$emit('tooltip-leave')"
  >
    <div class="tooltip-content">
      <div class="tooltip-section">
        <span class="tooltip-label">Event Title:</span> 
        <span class="tooltip-title" v-html="eventTitle"></span>
      </div>
      <div class="tooltip-section">
        <span class="tooltip-label">Event Time:</span> 
        <span class="tooltip-time">{{ eventTime }}</span>
      </div>
      <div class="tooltip-section" v-if="eventHost">
        <span class="tooltip-label">Event Host:</span> 
        <span class="tooltip-host">{{ eventHost }}</span>
      </div>
      <div class="tooltip-section" v-if="eventLocation">
        <span class="tooltip-label">Event Location:</span> 
        <span class="tooltip-location">{{ eventLocation }}</span>
      </div>
      
      <!-- Display Images only if there are images -->
      <div v-if="eventImages && eventImages.length > 0" class="tooltip-section">
        <span class="tooltip-label">Event Images:</span>
        <div class="image-container">
          <div 
            class="image-wrapper"
            v-for="(url, index) in getImageUrls()" 
            :key="index"
          >
            <!-- Check if there's an error message for this image, if so, display the message instead of image -->
            <div v-if="errorMessages[index]">
              {{ errorMessages[index] }}
            </div>   
            <!-- If there's no error message, render the image as usual --> 
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
      </div>
      

      <div class="tooltip-section">
        <span class="tooltip-label">Event Description:</span>
        <div class="tooltip-description" v-html="eventDescription"></div>
      </div>
      
      <!-- Add to Calendar button -->
      <div class="tooltip-section tooltip-button-section">
        <button @click="handleDownloadICS" class="tooltip-calendar-btn">
          📅 Add to Calendar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-tooltip {
  position: fixed;
  z-index: 1000;
  pointer-events: auto;
  max-width: 400px;
  max-height: 500px;
  transform: translate(5px, 5px); /* Position tooltip closer to cursor */
  background: var(--background-alt);
  border: 1px solid var(--border-outer);
  border-radius: 4px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
  overflow: hidden; /* Hide overflow to contain scrollbar within border */
}

.tooltip-content {
  padding: 12px;
  font-family: var(--body-font);
  font-size: 12px;
  color: var(--text-normal);
  max-height: 476px; /* 500px - 24px for padding */
  overflow-y: auto;
  /* Custom scrollbar styling */
  scrollbar-width: thin;
  scrollbar-color: var(--button-hover) var(--background-inner);
}

/* Webkit scrollbar styling for better appearance */
.tooltip-content::-webkit-scrollbar {
  width: 8px;
}

.tooltip-content::-webkit-scrollbar-track {
  background: var(--background-inner);
  border-radius: 4px;
}

.tooltip-content::-webkit-scrollbar-thumb {
  background: var(--button-hover);
  border-radius: 4px;
  border: 1px solid var(--border-outer);
}

.tooltip-content::-webkit-scrollbar-thumb:hover {
  background: var(--button-select);
}

.tooltip-section {
  margin-bottom: 8px;
}

.tooltip-label {
  font-weight: bold;
  color: var(--text-normal);
  font-size: 13px;
}

.tooltip-title {
  font-weight: bold;
  font-size: 14px;
  color: var(--text-normal);
}

.tooltip-time {
  color: var(--text-normal);
}

.tooltip-host {
  font-weight: 500;
  color: var(--text-normal);
}

.tooltip-location {
  color: var(--text-normal);
}

.tooltip-description {
  line-height: 1.4;
  color: var(--text-normal);
  margin-top: 4px;
}

/* Image styles - reuse from EventModal */
.image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
}

.event-image {
  height: auto;
  width: 100%;
  object-fit: cover;
  border-radius: 2%;
  border: 2px solid var(--button-hover);
  margin: auto;
}

/* Styles for image-wrapper when there is only one image */
.image-container .image-wrapper:first-of-type:nth-last-of-type(1) {
  width: 95%;
}

/* Styles for the image wrappers when there are two images */
.image-container .image-wrapper:first-of-type:nth-last-of-type(2),
.image-container .image-wrapper:last-of-type:nth-of-type(2) {
  width: calc(48% - 5px);
  margin-right: 5px;
  margin-left: 5px;
  box-sizing: border-box;
}

/* Styles for the image wrappers when there are three images */
.image-container .image-wrapper:nth-of-type(n+2):nth-of-type(-n+3) {
  width: calc(48% - 10px);
  margin-right: 5px;
  margin-left: 5px;
  box-sizing: border-box;
}

.image-container .image-wrapper:first-of-type:nth-last-of-type(3) {
  width: 95%;
}

.tooltip-button-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-outer);
  text-align: center;
}

.tooltip-calendar-btn {
  background: var(--background-inner);
  border: 1px solid var(--border-outer);
  color: var(--text-normal);
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 2px;
  font-family: var(--body-font);
}

.tooltip-calendar-btn:hover {
  background: var(--button-hover);
  color: var(--text-opp);
}
</style>
