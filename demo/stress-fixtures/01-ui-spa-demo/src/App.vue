<template>
  <main>
    <nav><a href="#about">About</a><a href="#service">Service</a></nav>
    <section id="about" class="flip" @mouseenter="flip = true" @mouseleave="flip = false">
      <h1>Demo UI</h1>
      <p>This is just a BETA.</p>
    </section>
    <section id="service" class="flip" @mouseenter="service = true" @mouseleave="service = false">
      <h2>Service</h2>
      <p>This is a beta version, thanks for your supporting and understanding.</p>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue';
const flip = ref(false);
const service = ref(false);
</script>

<style>
body { cursor: none; margin: 0; font-family: sans-serif; }
main { min-height: 100vh; display: grid; place-items: center; }
.flip { width: 320px; height: 180px; border: 1px solid #111; }
h1 { font-size: 5rem; }
</style>
