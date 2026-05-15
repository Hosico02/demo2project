document.querySelector('#run').addEventListener('click', () => {
  chrome.storage.local.set({ clicked: Date.now() });
});
