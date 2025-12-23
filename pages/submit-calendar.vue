<script setup lang="ts">
import { ref } from 'vue'

const form = ref({
  name: '',
  googleCalendarId: '',
  prefixTitle: '',
  suffixTitle: '',
  suffixDescription: '',
  defaultLocation: '',
  filters: []
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
    throw new Error('Google Calendar ID is required')
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
    
    // Prepare the data in the same format as event_sources.json
    const submissionData = {
      name: form.value.name.trim(),
      googleCalendarId: form.value.googleCalendarId.trim(),
      filters: [selectedFilters.value]
    }
    
    // Add optional fields if they exist
    if (form.value.prefixTitle.trim()) {
      submissionData.prefixTitle = form.value.prefixTitle.trim()
    }
    if (form.value.suffixTitle.trim()) {
      submissionData.suffixTitle = form.value.suffixTitle.trim()
    }
    if (form.value.suffixDescription.trim()) {
      submissionData.suffixDescription = form.value.suffixDescription.trim()
    }
    if (form.value.defaultLocation.trim()) {
      submissionData.defaultLocation = form.value.defaultLocation.trim()
    }
    
    const response = await $fetch('/api/submit-calendar', {
      method: 'POST',
      body: submissionData
    })
    
    submitMessage.value = 'Thank you! Your calendar submission has been received and will be reviewed by the maintainers.'
    
    // Reset form
    form.value = {
      name: '',
      googleCalendarId: '',
      prefixTitle: '',
      suffixTitle: '',
      suffixDescription: '',
      defaultLocation: '',
      filters: []
    }
    selectedFilters.value = []
    
  } catch (error) {
    submitError.value = error.message || 'An error occurred while submitting your calendar. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="desc">
    <h1>Submit Your Google Calendar</h1>
    <p>Use this form to submit your Google Calendar for inclusion on triad.build. Make sure you've already made your calendar public following the <a href="/contributing">contributing guide</a>.</p>
    
    <form @submit.prevent="submitForm" class="calendar-form">
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
        <label for="calendarId">Google Calendar ID *</label>
        <input 
          id="calendarId"
          v-model="form.googleCalendarId" 
          type="text" 
          required
          placeholder="e.g., abc123@group.calendar.google.com"
        />
        <small>Found in your calendar's "Integrate calendar" section in settings</small>
      </div>

      <div class="form-group">
        <label>Event Categories/Filters *</label>
        <p><small>Select all categories that apply to your events. You must select at least one.</small></p>
        
        <div class="filter-section">
          <h4>Organization Type (select one):</h4>
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

      <div v-if="submitError" class="error-message">
        {{ submitError }}
      </div>

      <div v-if="submitMessage" class="success-message">
        {{ submitMessage }}
      </div>

      <button type="submit" :disabled="isSubmitting" class="submit-button">
        {{ isSubmitting ? 'Submitting...' : 'Submit Calendar' }}
      </button>
    </form>

    <div class="form-footer">
      <p><strong>What happens next?</strong></p>
      <p>After you submit this form, the triad.build maintainers will review your submission and add your calendar to the site. This usually happens within a few days. You'll be contacted at the email associated with your Google Calendar if there are any issues.</p>
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
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent-color, #007bff);
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
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

@media (max-width: 600px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
