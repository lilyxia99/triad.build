<script setup lang="ts">

useHead({
  title: 'triad.build - Triad Event Board',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    {
      hid: 'description',
      name: 'triad.build',
      content: '',
    },
  ],
  link: [{ rel: 'icon', type: 'image/png', href: '/favicon.ico' }],
  script: [
    {
      src: 'https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?features=default%2Ces2015%2Ces6%2Ces5',
      crossorigin: 'anonymous',
    },
  ],
})
</script>

<template>
  <App />
</template>
