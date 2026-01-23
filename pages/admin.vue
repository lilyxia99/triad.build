<script setup lang="ts">
import { ref, onMounted } from 'vue'

const adminPassword = ref('')
const isAuthenticated = ref(false)
const authError = ref('')
const pendingSubmissions = ref([])
const approvedSources = ref([])
const selectedSubmissions = ref([])
const isLoading = ref(false)
const actionMessage = ref('')
const actionError = ref('')

const authenticate = async () => {
  try {
    authError.value = ''
    const response = await $fetch('/api/admin/auth', {
      method: 'POST',
      body: { password: adminPassword.value }
    })

    if (response.success) {
      isAuthenticated.value = true
      await loadData()
    }
  } catch (error) {
    authError.value = error.data?.message || 'Invalid password'
  }
}

const loadData = async () => {
  try {
    isLoading.value = true
    const [pending, approved] = await Promise.all([
      $fetch('/api/admin/pending'),
      $fetch('/api/admin/approved')
    ])
    pendingSubmissions.value = pending.submissions || []
    approvedSources.value = approved.sources || []
  } catch (error) {
    actionError.value = 'Failed to load data'
  } finally {
    isLoading.value = false
  }
}

const toggleSelection = (id) => {
  const index = selectedSubmissions.value.indexOf(id)
  if (index > -1) {
    selectedSubmissions.value.splice(index, 1)
  } else {
    selectedSubmissions.value.push(id)
  }
}

const isSelected = (id) => {
  return selectedSubmissions.value.includes(id)
}

const approveSelected = async () => {
  if (selectedSubmissions.value.length === 0) {
    actionError.value = 'Please select at least one submission'
    return
  }

  if (!confirm(`Approve ${selectedSubmissions.value.length} submission(s)?`)) {
    return
  }

  try {
    isLoading.value = true
    actionError.value = ''
    actionMessage.value = ''

    const response = await $fetch('/api/admin/approve', {
      method: 'POST',
      body: {
        password: adminPassword.value,
        ids: selectedSubmissions.value
      }
    })

    actionMessage.value = `Successfully approved ${selectedSubmissions.value.length} submission(s)`
    selectedSubmissions.value = []
    await loadData()
  } catch (error) {
    actionError.value = error.data?.message || 'Failed to approve submissions'
  } finally {
    isLoading.value = false
  }
}

const rejectSelected = async () => {
  if (selectedSubmissions.value.length === 0) {
    actionError.value = 'Please select at least one submission'
    return
  }

  if (!confirm(`Reject ${selectedSubmissions.value.length} submission(s)? This will delete them permanently.`)) {
    return
  }

  try {
    isLoading.value = true
    actionError.value = ''
    actionMessage.value = ''

    const response = await $fetch('/api/admin/reject', {
      method: 'POST',
      body: {
        password: adminPassword.value,
        ids: selectedSubmissions.value
      }
    })

    actionMessage.value = `Successfully rejected ${selectedSubmissions.value.length} submission(s)`
    selectedSubmissions.value = []
    await loadData()
  } catch (error) {
    actionError.value = error.data?.message || 'Failed to reject submissions'
  } finally {
    isLoading.value = false
  }
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString()
}

const getCalendarUrl = (calendarId) => {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}`
}
</script>

<template>
  <div class="desc admin-page">
    <h1>Admin Dashboard</h1>

    <div v-if="!isAuthenticated" class="auth-section">
      <h2>Authentication Required</h2>
      <form @submit.prevent="authenticate">
        <div class="form-group">
          <label for="password">Admin Password</label>
          <input
            id="password"
            v-model="adminPassword"
            type="password"
            required
            placeholder="Enter admin password"
          />
        </div>
        <div v-if="authError" class="error-message">
          {{ authError }}
        </div>
        <button type="submit" class="btn btn-primary">Login</button>
      </form>
    </div>

    <div v-else class="admin-content">
      <div v-if="actionMessage" class="success-message">
        {{ actionMessage }}
      </div>
      <div v-if="actionError" class="error-message">
        {{ actionError }}
      </div>

      <section class="pending-section">
        <h2>Pending Submissions ({{ pendingSubmissions.length }})</h2>

        <div v-if="pendingSubmissions.length === 0" class="empty-state">
          No pending submissions
        </div>

        <div v-else>
          <div class="batch-actions">
            <button
              @click="approveSelected"
              :disabled="selectedSubmissions.length === 0 || isLoading"
              class="btn btn-success"
            >
              Approve Selected ({{ selectedSubmissions.length }})
            </button>
            <button
              @click="rejectSelected"
              :disabled="selectedSubmissions.length === 0 || isLoading"
              class="btn btn-danger"
            >
              Reject Selected ({{ selectedSubmissions.length }})
            </button>
          </div>

          <div class="submissions-list">
            <div
              v-for="submission in pendingSubmissions"
              :key="submission.id"
              class="submission-card"
              :class="{ selected: isSelected(submission.id) }"
            >
              <div class="submission-header">
                <input
                  type="checkbox"
                  :checked="isSelected(submission.id)"
                  @change="toggleSelection(submission.id)"
                  class="submission-checkbox"
                />
                <h3>{{ submission.name }}</h3>
                <span class="submission-date">{{ formatDate(submission.submittedAt) }}</span>
              </div>

              <div class="submission-details">
                <div class="detail-row">
                  <strong>Calendar ID:</strong>
                  <code>{{ submission.googleCalendarId }}</code>
                  <a :href="getCalendarUrl(submission.googleCalendarId)" target="_blank" class="view-link">
                    View Calendar
                  </a>
                </div>

                <div class="detail-row" v-if="submission.filters">
                  <strong>Filters:</strong>
                  <div class="filter-tags">
                    <span v-for="filterGroup in submission.filters" :key="filterGroup" class="filter-tag">
                      {{ filterGroup.join(', ') }}
                    </span>
                  </div>
                </div>

                <div class="detail-row" v-if="submission.prefixTitle">
                  <strong>Prefix:</strong> {{ submission.prefixTitle }}
                </div>

                <div class="detail-row" v-if="submission.suffixTitle">
                  <strong>Suffix:</strong> {{ submission.suffixTitle }}
                </div>

                <div class="detail-row" v-if="submission.defaultLocation">
                  <strong>Location:</strong> {{ submission.defaultLocation }}
                </div>

                <div class="detail-row" v-if="submission.instagramHandle">
                  <strong>Instagram:</strong>
                  <a :href="`https://instagram.com/${submission.instagramHandle.replace('@', '')}`" target="_blank">
                    {{ submission.instagramHandle }}
                  </a>
                </div>

                <div class="detail-row" v-if="submission.websiteUrl">
                  <strong>Website:</strong>
                  <a :href="submission.websiteUrl" target="_blank">{{ submission.websiteUrl }}</a>
                </div>

                <div class="detail-row" v-if="submission.contactEmail">
                  <strong>Contact:</strong> {{ submission.contactEmail }}
                </div>

                <div class="detail-row" v-if="submission.description">
                  <strong>Description:</strong>
                  <p>{{ submission.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="approved-section">
        <h2>Approved Sources ({{ approvedSources.length }})</h2>

        <div v-if="approvedSources.length === 0" class="empty-state">
          No approved sources yet
        </div>

        <div v-else class="sources-grid">
          <div v-for="source in approvedSources" :key="source.googleCalendarId" class="source-card">
            <h3>{{ source.name }}</h3>
            <div class="source-details">
              <div class="detail-row">
                <strong>Calendar ID:</strong> <code>{{ source.googleCalendarId }}</code>
              </div>
              <div class="detail-row" v-if="source.instagramHandle">
                <strong>Instagram:</strong> {{ source.instagramHandle }}
              </div>
              <div class="detail-row" v-if="source.websiteUrl">
                <strong>Website:</strong>
                <a :href="source.websiteUrl" target="_blank">{{ source.websiteUrl }}</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
  <Footer />
</template>

<style scoped>
.admin-page {
  max-width: 1200px;
  margin: 0 auto;
}

.auth-section {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  background-color: var(--background-secondary);
  border-radius: 8px;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--border-color, #ccc);
  border-radius: 4px;
  font-size: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-success {
  background-color: #28a745;
  color: white;
  margin-right: 0.5rem;
}

.btn-danger {
  background-color: #dc3545;
  color: white;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-content {
  margin-top: 2rem;
}

.pending-section, .approved-section {
  margin-bottom: 3rem;
}

.batch-actions {
  margin: 1rem 0;
  padding: 1rem;
  background-color: var(--background-secondary);
  border-radius: 4px;
}

.submissions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.submission-card {
  border: 2px solid var(--border-color, #ccc);
  border-radius: 8px;
  padding: 1.5rem;
  background-color: var(--background-secondary);
  transition: all 0.2s;
}

.submission-card.selected {
  border-color: #007bff;
  background-color: rgba(0, 123, 255, 0.05);
}

.submission-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #ccc);
}

.submission-checkbox {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.submission-header h3 {
  margin: 0;
  flex: 1;
}

.submission-date {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.submission-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.detail-row strong {
  min-width: 120px;
}

.detail-row code {
  background-color: rgba(0, 0, 0, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9rem;
}

.view-link {
  color: #007bff;
  text-decoration: none;
  margin-left: 0.5rem;
}

.view-link:hover {
  text-decoration: underline;
}

.filter-tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-tag {
  background-color: #007bff;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
}

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.source-card {
  border: 1px solid var(--border-color, #ccc);
  border-radius: 8px;
  padding: 1.5rem;
  background-color: var(--background-secondary);
}

.source-card h3 {
  margin-top: 0;
  color: var(--text-primary);
}

.source-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
  font-style: italic;
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

@media (max-width: 768px) {
  .submission-header {
    flex-wrap: wrap;
  }

  .sources-grid {
    grid-template-columns: 1fr;
  }

  .batch-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .batch-actions .btn {
    width: 100%;
  }
}
</style>
