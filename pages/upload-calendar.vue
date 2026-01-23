<script setup lang="ts">
import { ref } from 'vue'

const form = ref({
  name: '',
  calendarUrl: '',
  googleCalendarId: '',
  prefixTitle: '',
  suffixTitle: '',
  suffixDescription: '',
  defaultLocation: '',
  filters: [],
  // Optional fields for public display
  instagramHandle: '',
  websiteUrl: '',
  contactEmail: '',
  description: ''
})

const availableFilters = ref([
  // Header filters
  { name: 'community', fullName: '🫂 Community', isHeader: true },
  { name: 'commercial', fullName: '🎩 Commercial', isHeader: true },
  { name: 'nonprofit', fullName: '🏛️ Nonprofit', isHeader: true },

  // Regular filters
  { name: 'activism', fullName: 'Critical Work' },
  { name: 'palestine', fullName: '🇵🇸 Palestine' },
  { name: 'socialism', fullName: '🚩 Socialism' },
  { name: 'ecology', fullName: '🌿 Ecology' },
  { name: 'organizing', fullName: '🤝 Organizing' },
  { name: 'activities', fullName: 'Activities' },
  { name: 'soccer', fullName: '⚽ Soccer' },
  { name: 'biking', fullName: '🚲 Biking' },
  { name: 'skating', fullName: '🛼🛹 Skating' },
  { name: 'exercise', fullName: '💪 Exercise' },
  { name: 'yoga', fullName: '🧘 Yoga' },
  { name: 'dance', fullName: '🪩 Dancing' },
  { name: 'singing', fullName: '🎤 Singing/Karaoke' },
  { name: 'games', fullName: '🀄🖥️ Games' },
  { name: 'motorcycles', fullName: '🏍️ Motorcycles VROOM VROOM' },
  { name: 'performance', fullName: 'Performances' },
  { name: 'theater', fullName: '🎭 Theater' },
  { name: 'music', fullName: '🎸 Music' },
  { name: 'drag', fullName: '👠 Drag' },
  { name: 'movies', fullName: '📽️ Film & Movies' },
  { name: 'interests', fullName: 'Interest & Hobbies' },
  { name: 'diy', fullName: '🔧 DIY' },
  { name: 'books', fullName: '📚 Books' },
  { name: 'food', fullName: '🍲 Food' },
  { name: 'art', fullName: '🎨 Art' },
  { name: 'discussion', fullName: '🗨️ Yapping & Talking' },
  { name: 'sobriety', fullName: '🚭 Sobriety' },
  { name: 'other', fullName: 'Misc' },
  { name: 'free stuff', fullName: '🈶 Free Stuff' },
  { name: 'volunteering', fullName: '♻️ Volunteering' },
  { name: 'market', fullName: '🛍️ Market' },
  { name: 'transgender', fullName: '🏳️‍⚧️ Transgeder :3' },
  { name: 'lgbtq', fullName: '🏳️‍🌈 LGBTQ' },
  { name: 'festival', fullName: '🎪 Festival' },
  { name: 'announcement', fullName: '🗣️ Announcements!!!!' },
  { name: 'unknownType', fullName: '🤷 idk' }
])

const selectedFilters = ref([])
const isSubmitting = ref(false)
const submitMessage = ref('')
const submitError = ref('')
const parseError = ref('')
const calendarIdExtracted = ref(false)

// Extract Google Calendar ID from various URL formats
const extractCalendarId = () => {
  parseError.value = ''
  calendarIdExtracted.value = false

  const url = form.value.calendarUrl.trim()

  if (!url) {
    return
  }

  try {
    // Pattern 1: Direct calendar ID (already in correct format)
    if (url.includes('@group.calendar.google.com') || url.includes('@gmail.com')) {
      form.value.googleCalendarId = url
      calendarIdExtracted.value = true
      return
    }

    // Pattern 2: Public calendar link with src parameter
    // https://calendar.google.com/calendar/embed?src=abc123@group.calendar.google.com
    // https://calendar.google.com/calendar/u/0?cid=abc123@group.calendar.google.com
    const srcMatch = url.match(/[?&]src=([^&]+)/)
    if (srcMatch) {
      const calendarId = decodeURIComponent(srcMatch[1])
      form.value.googleCalendarId = calendarId
      calendarIdExtracted.value = true
      return
    }

    // Pattern 3: Calendar ID with cid parameter
    const cidMatch = url.match(/[?&]cid=([^&]+)/)
    if (cidMatch) {
      const calendarId = decodeURIComponent(cidMatch[1])
      form.value.googleCalendarId = calendarId
      calendarIdExtracted.value = true
      return
    }

    // Pattern 4: Calendar ID in path
    // https://calendar.google.com/calendar/u/0/r/settings/calendar/abc123@group.calendar.google.com
    const pathMatch = url.match(/calendar\/([^/&?]+@(?:group\.calendar\.google\.com|gmail\.com))/)
    if (pathMatch) {
      form.value.googleCalendarId = pathMatch[1]
      calendarIdExtracted.value = true
      return
    }

    parseError.value = 'Could not extract calendar ID from the URL. Please paste the public calendar link or the calendar ID directly.'
  } catch (error) {
    parseError.value = 'Error parsing calendar URL. Please check the format and try again.'
  }
}

const toggleFilter = (filterName) => {
  const index = selectedFilters.value.indexOf(filterName)
  if (index > -1) {
    selectedFilters.value.splice(index, 1)
  } else {
    selectedFilters.value.push(filterName)
  }
}

const isFilterSelected = (filterName) => {
  return selectedFilters.value.includes(filterName)
}

const validateForm = () => {
  if (!form.value.name.trim()) {
    throw new Error('Organization/Event name is required')
  }
  if (!form.value.googleCalendarId.trim()) {
    throw new Error('Google Calendar ID is required. Please paste a calendar URL above.')
  }
  if (!form.value.googleCalendarId.includes('@group.calendar.google.com') && !form.value.googleCalendarId.includes('@gmail.com')) {
    throw new Error('Please enter a valid Google Calendar ID (should end with @group.calendar.google.com or @gmail.com)')
  }
  if (selectedFilters.value.length === 0) {
    throw new Error('Please select at least one filter category')
  }
}

const submitForm = async () => {
  try {
    isSubmitting.value = true
    submitError.value = ''
    submitMessage.value = ''

    validateForm()

    // Submit to the merged API endpoint (now goes to pending review)
    const response = await $fetch('/api/submit-calendar', {
      method: 'POST',
      body: {
        name: form.value.name.trim(),
        googleCalendarId: form.value.googleCalendarId.trim(),
        prefixTitle: form.value.prefixTitle.trim() || undefined,
        suffixTitle: form.value.suffixTitle.trim() || undefined,
        suffixDescription: form.value.suffixDescription.trim() || undefined,
        defaultLocation: form.value.defaultLocation.trim() || undefined,
        filters: [selectedFilters.value],
        // Optional display fields
        instagramHandle: form.value.instagramHandle.trim() || undefined,
        websiteUrl: form.value.websiteUrl.trim() || undefined,
        contactEmail: form.value.contactEmail.trim() || undefined,
        description: form.value.description.trim() || undefined
      }
    })

    submitMessage.value = 'Thank you! Your calendar submission has been received and is pending review. You will be notified once it has been approved.'

    // Reset form
    form.value = {
      name: '',
      calendarUrl: '',
      googleCalendarId: '',
      prefixTitle: '',
      suffixTitle: '',
      suffixDescription: '',
      defaultLocation: '',
      filters: [],
      instagramHandle: '',
      websiteUrl: '',
      contactEmail: '',
      description: ''
    }
    selectedFilters.value = []
    calendarIdExtracted.value = false

  } catch (error) {
    submitError.value = error.message || error.data?.message || 'An error occurred while submitting your calendar. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="desc">
    <h1>Submit Your Google Calendar</h1>
    <p>Submit your public Google Calendar to be featured on triad.build. Your submission will be reviewed by our team and added to the site once approved.</p>

    <div class="info-box">
      <h3>📋 Before you start:</h3>
      <ol>
        <li>Make sure your Google Calendar is set to <strong>public</strong> and all the details are available <br>(don't just let us know the busy hours)</li>
        <li>Get your calendar's public link or calendar ID</li>
        <li>Have your organization details ready</li>
      </ol>
      <p><small>Need help making your calendar public? Check the <a href="/contributing">contributing guide</a>.</small></p>
    </div>

    <form @submit.prevent="submitForm" class="calendar-form">
      <div class="form-group">
        <label for="calendarUrl">Google Calendar Public Link or ID *</label>
        <textarea
          id="calendarUrl"
          v-model="form.calendarUrl"
          @input="extractCalendarId"
          rows="3"
          placeholder="Paste your calendar's public link here, for example:
https://calendar.google.com/calendar/embed?src=abc123@group.calendar.google.com
Or just the calendar ID: abc123@group.calendar.google.com"
        ></textarea>
        <small>We'll automatically extract the calendar ID from any Google Calendar URL format</small>

        <div v-if="calendarIdExtracted" class="success-box">
          ✓ Calendar ID extracted: <code>{{ form.googleCalendarId }}</code>
        </div>

        <div v-if="parseError" class="error-box">
          {{ parseError }}
        </div>
      </div>

      <div class="form-group">
        <label for="name">Organization/Event Name *</label>
        <input
          id="name"
          v-model="form.name"
          type="text"
          required
          placeholder="e.g., Greensboro Pride, Food Not Bombs GSO"
        />
        <small>This will be used to identify your calendar in our system</small>
      </div>

      <div class="form-group">
        <label>Event Categories/Filters *</label>
        <p><small>Select all categories that apply to your events. You must select at least one.</small></p>

        <div class="filter-section">
          <h4>Organization Type (select one) *:</h4>
          <div class="filter-grid">
            <div v-for="filter in availableFilters.filter(f => f.isHeader)" :key="filter.name" class="filter-item">
              <label>
                <input
                  type="checkbox"
                  :checked="isFilterSelected(filter.name)"
                  @change="toggleFilter(filter.name)"
                />
                {{ filter.fullName }}
              </label>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <h4>Event Types (select all that apply):</h4>
          <div class="filter-grid">
            <div v-for="filter in availableFilters.filter(f => !f.isHeader)" :key="filter.name" class="filter-item">
              <label>
                <input
                  type="checkbox"
                  :checked="isFilterSelected(filter.name)"
                  @change="toggleFilter(filter.name)"
                />
                {{ filter.fullName }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="prefixTitle">Title Prefix (optional)</label>
        <input
          id="prefixTitle"
          v-model="form.prefixTitle"
          type="text"
          placeholder="e.g., 🌈, :triad:, 🎵"
        />
        <small>Emoji or badge that will appear before your event titles</small>
      </div>

      <div class="form-group">
        <label for="suffixTitle">Title Suffix (optional)</label>
        <input
          id="suffixTitle"
          v-model="form.suffixTitle"
          type="text"
          placeholder="e.g., @ Your Venue Name"
        />
        <small>Text that will appear after your event titles</small>
      </div>

      <div class="form-group">
        <label for="suffixDescription">Description Suffix (optional)</label>
        <textarea
          id="suffixDescription"
          v-model="form.suffixDescription"
          rows="3"
          placeholder="Additional information to append to all event descriptions"
        ></textarea>
        <small>HTML is allowed. This will be added to the end of all your event descriptions.</small>
      </div>

      <div class="form-group">
        <label for="defaultLocation">Default Location (optional)</label>
        <input
          id="defaultLocation"
          v-model="form.defaultLocation"
          type="text"
          placeholder="e.g., 123 Main St, Greensboro, NC 27401"
        />
        <small>Used when events don't have a location specified</small>
      </div>

      <h3>Optional: Public Display Information</h3>
      <p><small>This information will be shown on the public sources page to help people find your organization</small></p>

      <div class="form-group">
        <label for="instagramHandle">Instagram Handle (optional)</label>
        <input
          id="instagramHandle"
          v-model="form.instagramHandle"
          type="text"
          placeholder="e.g., @yourorganization"
        />
        <small>Your Instagram handle (include the @)</small>
      </div>

      <div class="form-group">
        <label for="websiteUrl">Website URL (optional)</label>
        <input
          id="websiteUrl"
          v-model="form.websiteUrl"
          type="url"
          placeholder="e.g., https://yourwebsite.com"
        />
        <small>Your organization's website</small>
      </div>

      <div class="form-group">
        <label for="contactEmail">Contact Email (optional)</label>
        <input
          id="contactEmail"
          v-model="form.contactEmail"
          type="email"
          placeholder="e.g., contact@yourorg.com"
        />
        <small>Email for people to reach out about your events</small>
      </div>

      <div class="form-group">
        <label for="description">Organization Description (optional)</label>
        <textarea
          id="description"
          v-model="form.description"
          rows="4"
          placeholder="Tell people about your organization and the types of events you host..."
        ></textarea>
        <small>Brief description of your organization (will be shown on the sources page)</small>
      </div>

      <div v-if="submitError" class="error-message">
        {{ submitError }}
      </div>

      <div v-if="submitMessage" class="success-message">
        {{ submitMessage }}
      </div>

      <button type="submit" :disabled="isSubmitting || !calendarIdExtracted" class="submit-button">
        {{ isSubmitting ? 'Submitting...' : 'Submit Calendar for Review' }}
      </button>
    </form>

    <div class="form-footer">
      <p><strong>What happens next?</strong></p>
      <ol>
        <li>Your submission will be reviewed by the triad.build team</li>
        <li>Once approved, your calendar will be added to <code>event_sources.json</code></li>
        <li>Your events will appear on the site after the next sync</li>
        <li>Your organization will be listed on our <a href="/sources">public sources page</a></li>
      </ol>
      <p>Questions? Email <a href="mailto:leileixiawork@gmail.com">leileixiawork@gmail.com</a></p>
    </div>
  </div>
  <Footer />
</template>

<style scoped>
.calendar-form {
  max-width: 800px;
  margin: 0 auto;
}

.info-box {
  background-color: var(--background-secondary);
  border-left: 4px solid var(--accent-color, #d2431f);
  padding: 1.5rem;
  margin-bottom: 2rem;
  border-radius: 4px;
}

.info-box h3 {
  margin-top: 0;
  color: var(--text-primary);
}

.info-box ol {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.info-box li {
  margin: 0.5rem 0;
}

.form-group {
  margin-bottom: 2rem;
}

.form-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--border-color, #ccc);
  border-radius: 4px;
  font-size: 1rem;
  background-color: var(--background-secondary);
  color: var(--text-primary);
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent-color, #cf3434);
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.success-box {
  background-color: #efe;
  color: #363;
  padding: 0.75rem;
  border-radius: 4px;
  margin-top: 0.5rem;
  border: 1px solid #cfc;
}

.success-box code {
  background-color: rgba(0, 0, 0, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: monospace;
}

.error-box {
  background-color: #fee;
  color: #c33;
  padding: 0.75rem;
  border-radius: 4px;
  margin-top: 0.5rem;
  border: 1px solid #fcc;
}

.filter-section {
  margin-bottom: 1.5rem;
}

.filter-section h4 {
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-item label {
  display: flex;
  align-items: center;
  font-weight: normal;
  cursor: pointer;
  padding: 0.25rem;
}

.filter-item input[type="checkbox"] {
  width: auto;
  margin-right: 0.5rem;
}

.submit-button {
  background-color: var(--accent-color, #007bff);
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.submit-button:hover:not(:disabled) {
  background-color: var(--accent-color-hover, #0056b3);
}

.submit-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.error-message {
  background-color: #fee;
  color: #c33;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  border: 1px solid #fcc;
}

.success-message {
  background-color: #efe;
  color: #363;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  border: 1px solid #cfc;
}

.form-footer {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border-color, #ccc);
}

.form-footer code {
  background-color: rgba(0, 0, 0, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: monospace;
}

@media (max-width: 600px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
