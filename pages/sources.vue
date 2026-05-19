<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { VueFinalModal } from 'vue-final-modal'
import eventSourcesJSON from '@/assets/event_sources.json'
import { CITIES, CITY_COLOR_MAP } from '@/composables/filters'

const sources = ref([])
const isLoading = ref(true)
const error = ref('')
const searchQuery = ref('')
const headerFilter = ref('all')
const selectedEventTags = ref<string[]>([])
const showFilterModal = ref(false)

// City filter — default all selected (sources page is a reference view)
const selectedCities = ref<string[]>(CITIES.map(c => c.id))

const toggleCity = (cityId: string) => {
  const i = selectedCities.value.indexOf(cityId)
  if (i > -1) {
    selectedCities.value.splice(i, 1)
  } else {
    selectedCities.value.push(cityId)
  }
}
const isCitySelected = (cityId: string) => selectedCities.value.includes(cityId)

// Get available tags from config
const tagsHeader = ref(eventSourcesJSON.appConfig.tagsHeader)
const tagsToShow = ref(eventSourcesJSON.appConfig.tagsToShow)

// Flatten tags for display
const allEventTags = computed(() => {
  const tags: any[] = []
  tagsToShow.value.forEach((group: any) => {
    group.forEach((tag: any) => {
      if (tag.name) tags.push(tag)
    })
  })
  return tags
})

const loadSources = async () => {
  try {
    isLoading.value = true
    const data = await $fetch('/api/sources')
    sources.value = data.sources || []
  } catch (err) {
    error.value = 'Failed to load sources'
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const filteredSources = computed(() => {
  let filtered = sources.value

  // City filter — sources with no city field always show
  if (selectedCities.value.length < CITIES.length) {
    filtered = filtered.filter((source: any) =>
      !source.city || selectedCities.value.includes(source.city)
    )
  }

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter((source: any) =>
      source.name.toLowerCase().includes(query) ||
      source.description?.toLowerCase().includes(query) ||
      source.instagramHandle?.toLowerCase().includes(query)
    )
  }

  // Header filter (community/nonprofit/commercial)
  if (headerFilter.value !== 'all') {
    filtered = filtered.filter((source: any) => {
      const filters = source.filters || []
      return filters.some((filterGroup: any) =>
        filterGroup.includes(headerFilter.value)
      )
    })
  }

  // Event type tags filter
  if (selectedEventTags.value.length > 0) {
    filtered = filtered.filter((source: any) => {
      const filters = source.filters || []
      return selectedEventTags.value.some(selectedTag =>
        filters.some((filterGroup: any) =>
          filterGroup.includes(selectedTag)
        )
      )
    })
  }

  return filtered
})

const toggleEventTag = (tagName: string) => {
  const index = selectedEventTags.value.indexOf(tagName)
  if (index > -1) {
    selectedEventTags.value.splice(index, 1)
  } else {
    selectedEventTags.value.push(tagName)
  }
}

const isEventTagSelected = (tagName: string) => {
  return selectedEventTags.value.includes(tagName)
}

const clearAllFilters = () => {
  headerFilter.value = 'all'
  selectedEventTags.value = []
  selectedCities.value = CITIES.map(c => c.id)
  showFilterModal.value = false
}

const clickTag = (tagName: string) => {
  // Toggle the tag in the filter
  toggleEventTag(tagName)
}

const getCalendarUrl = (calendarId: string) => {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}`
}

const getInstagramUrl = (handle: string) => {
  return `https://instagram.com/${handle.replace('@', '')}`
}

const getEventbriteUrl = (organizerId: string) => {
  return `https://www.eventbrite.com/o/${organizerId}`
}

onMounted(() => {
  loadSources()
})
</script>

<template>
  <div class="desc sources-page">
    <h1>Event Sources</h1>
    <p>These organizations and groups share their events on triad.build. Check out their calendars and follow them!</p>
    <strong>Note:</strong> If you are the owner of an instagram page that is listed here, I would <strong>STRONGLY </strong>recommend you submit your calendar through google calendar. The instagram scraping mechanism is NOT super correct all the time, so a maintained google calendar will always be preferred. 
    <p>This list is curated by mmyself and may not include all sources. If you know of an organization or group that should be added, please submit a calendar.</p>

    <div class="sources-filters">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search sources..."
        class="sources-search"
      />

      <!-- City toggles -->
      <div class="sources-city-chips">
        <button
          v-for="city in CITIES"
          :key="city.id"
          @click="toggleCity(city.id)"
          class="sources-city-chip"
          :class="{ inactive: !isCitySelected(city.id) }"
        >
          <span class="city-btn-dot" :style="{ background: city.color, opacity: isCitySelected(city.id) ? 1 : 0.3 }"></span>
          <span :style="{ textDecoration: isCitySelected(city.id) ? 'none' : 'line-through', opacity: isCitySelected(city.id) ? 1 : 0.45 }">{{ city.label }}</span>
        </button>
      </div>

      <div class="sources-filter-buttons">
        <button
          @click="clearAllFilters"
          :class="{ active: headerFilter === 'all' && selectedEventTags.length === 0 }"
          class="sources-filter-btn"
        >
          All
        </button>
        <button
          @click="headerFilter = 'community'"
          :class="{ active: headerFilter === 'community' }"
          class="sources-filter-btn"
        >
          🫂 Community
        </button>
        <button
          @click="headerFilter = 'nonprofit'"
          :class="{ active: headerFilter === 'nonprofit' }"
          class="sources-filter-btn"
        >
          🏛️ Nonprofit
        </button>
        <button
          @click="headerFilter = 'commercial'"
          :class="{ active: headerFilter === 'commercial' }"
          class="sources-filter-btn"
        >
          🎩 Commercial
        </button>
        <button
          @click="showFilterModal = true"
          class="sources-filter-btn sources-filter-more"
        >
          More Filters {{ selectedEventTags.length > 0 ? `(${selectedEventTags.length})` : '' }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="sources-loading">
      Loading sources...
    </div>

    <div v-else-if="error" class="sources-error">
      {{ error }}
    </div>

    <div v-else-if="filteredSources.length === 0" class="sources-empty">
      <p v-if="searchQuery || filterType !== 'all'">
        No sources found matching your filters.
      </p>
      <p v-else>
        No sources available yet.
      </p>
    </div>

    <div v-else class="sources-grid">
      <div v-for="source in filteredSources" :key="source.name + source.type" class="source-card">
        <div class="source-header">
          <h2>{{ source.name }}</h2>
          <div class="source-header-meta">
            <span
              v-if="source.city && CITY_COLOR_MAP[source.city]"
              class="source-city-dot"
              :style="{ background: CITY_COLOR_MAP[source.city] }"
              :title="source.city"
            ></span>
            <div class="source-type">{{ source.type }}</div>
          </div>
        </div>

        <div class="source-tags">
          <span
            v-for="filterGroup in source.filters"
            :key="filterGroup.join(',')"
          >
            <button
              v-for="tag in filterGroup"
              :key="tag"
              @click="clickTag(tag)"
              :class="{ 'tag-selected': isEventTagSelected(tag) }"
              class="source-tag"
            >
              {{ tag }}
            </button>
          </span>
        </div>

        <p v-if="source.description" class="source-description">
          {{ source.description }}
        </p>

        <div class="source-links">
          <a
            v-if="source.type === 'googleCalendar' && source.googleCalendarId"
            :href="getCalendarUrl(source.googleCalendarId)"
            target="_blank"
          >
            View Google Calendar
          </a>

          <a
            v-if="source.type === 'instagram' && source.instagramHandle"
            :href="getInstagramUrl(source.instagramHandle)"
            target="_blank"
          >
            View Instagram ({{ source.instagramHandle }})
          </a>

          <a
            v-if="source.type === 'eventbrite' && source.organizerId"
            :href="getEventbriteUrl(source.organizerId)"
            target="_blank"
          >
            View Eventbrite
          </a>

          <a
            v-if="source.instagramHandle && source.type !== 'instagram'"
            :href="getInstagramUrl(source.instagramHandle)"
            target="_blank"
          >
            Instagram: {{ source.instagramHandle }}
          </a>

          <a
            v-if="source.websiteUrl"
            :href="source.websiteUrl"
            target="_blank"
          >
            Website
          </a>

          <a
            v-if="source.contactEmail"
            :href="`mailto:${source.contactEmail}`"
          >
            Email
          </a>
        </div>

        <div v-if="source.defaultLocation" class="source-location">
          📍 {{ source.defaultLocation }}
        </div>
      </div>
    </div>

    <div class="sources-submit">
      <h2>Want to add your calendar?</h2>
      <p>Share your events with the Triad community!</p>
      <p><strong><a href="/upload-calendar">Submit Your Calendar</a></strong></p>
    </div>

    <!-- Filter Modal -->
    <VueFinalModal
      v-model="showFilterModal"
      class="popper-box-wrapper"
      content-class="popper-box-inner"
      overlay-transition="vfm-fade"
      content-transition="vfm-fade"
    >
      <span class="event-headers">Event Type Filters</span>
      <p style="font-size: 0.9rem; margin-bottom: 1rem;">Click tags to filter sources by event type:</p>

      <div v-for="group in tagsToShow" :key="group[0]?.name || 'group'" class="sources-tag-group">
        <div v-if="group[0]?.fullName" class="sources-group-label">
          {{ group[0].fullName }}
        </div>
        <div class="sources-modal-tags">
          <button
            v-for="tag in group.slice(group[0]?.fullName ? 1 : 0)"
            :key="tag.name"
            @click="toggleEventTag(tag.name)"
            :class="{ 'tag-selected': isEventTagSelected(tag.name) }"
            class="sources-modal-tag"
          >
            {{ tag.fullName }}
          </button>
        </div>
      </div>

      <div class="popper-box-inner bottom">
        <button @click="showFilterModal = false">Close</button>
        <button @click="clearAllFilters">Clear All</button>
      </div>
    </VueFinalModal>
  </div>
  <Footer />
</template>

<style scoped>
.sources-city-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 8px;
}

.sources-city-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 1px 4px;
  font-size: 0.78em;
  font-family: var(--body-font);
  color: var(--text-normal);
  cursor: pointer;
  transition: opacity 0.15s;
}

.sources-city-chip:hover {
  opacity: 0.75;
}

.source-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.source-header-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.source-city-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
