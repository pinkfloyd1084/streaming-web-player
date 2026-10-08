/**
 * Radio Anarchy - Landing Page & Sign-Up Engine
 */

(function () {
  'use strict';

  const API_BASE = window.location.origin.startsWith('http')
    ? window.location.origin
    : 'http://192.168.0.229:8205';

  const DEMO_TOKEN = 'RA-MASTER-DEV-2026';

  // Elements
  const demoAudio = document.getElementById('demoAudio');
  const demoPlayBtn = document.getElementById('demoPlayBtn');
  const demoPlayIcon = document.getElementById('demoPlayIcon');
  const demoPlayLabel = document.getElementById('demoPlayLabel');
  const demoTrackTitle = document.getElementById('demoTrackTitle');
  const demoVolume = document.getElementById('demoVolume');
  const tokenLookupForm = document.getElementById('tokenLookupForm');
  const lookupEmail = document.getElementById('lookupEmail');
  const lookupResult = document.getElementById('lookupResult');

  // Checkout Buttons
  const buyShuffleBtn = document.getElementById('buyShuffleBtn');
  const buyProBtn = document.getElementById('buyProBtn');

  // Payment Link configuration (Stripe / Lemon Squeezy URLs to be plugged in)
  const STRIPE_LINKS = {
    shuffle: 'https://buy.stripe.com/test_shuffle',
    pro: 'https://buy.stripe.com/test_pro'
  };

  buyShuffleBtn.onclick = (e) => {
    if (STRIPE_LINKS.shuffle.includes('test_')) {
      e.preventDefault();
      alert('⚡ Radio Anarchy Pro: Connecting to live Stripe checkout shortly!\n\nPink is finalizing the payment link. Check back in a few minutes or join our Discord!');
    }
  };

  buyProBtn.onclick = (e) => {
    if (STRIPE_LINKS.pro.includes('test_')) {
      e.preventDefault();
      alert('⚡ Radio Anarchy Pro: Connecting to live Stripe checkout shortly!\n\nPink is finalizing the payment link. Check back in a few minutes or join our Discord!');
    }
  };

  // Demo audio preview
  let isDemoPlaying = false;
  let demoTracks = [];
  let currentDemoIndex = 0;

  async function loadDemoFeed() {
    try {
      const res = await fetch(`${API_BASE}/channel/Arcade?token=${DEMO_TOKEN}`);
      if (res.ok) {
        const data = await res.json();
        demoTracks = data.playlist || [];
        if (demoTracks.length > 0) {
          demoTrackTitle.textContent = `PREVIEW: ${demoTracks[0].title.toUpperCase()} // READY TO PLAY`;
        }
      }
    } catch (e) {
      console.warn('Demo feed load failed:', e);
    }
  }

  function toggleDemoPlay() {
    if (!demoTracks || demoTracks.length === 0) return;

    if (isDemoPlaying) {
      demoAudio.pause();
      isDemoPlaying = false;
      demoPlayIcon.textContent = '▶';
      demoPlayLabel.textContent = 'PREVIEW AUDIO';
    } else {
      if (!demoAudio.src) {
        const track = demoTracks[currentDemoIndex];
        const streamUrl = track.stream_url.startsWith('http')
          ? track.stream_url
          : `${API_BASE}${track.stream_url}`;
        demoAudio.src = streamUrl;
        demoTrackTitle.textContent = `NOW STREAMING PREVIEW: ${track.title.toUpperCase()}`;
      }
      demoAudio.volume = parseFloat(demoVolume.value) / 100;
      demoAudio.play().then(() => {
        isDemoPlaying = true;
        demoPlayIcon.textContent = '⏸';
        demoPlayLabel.textContent = 'PAUSE PREVIEW';
      }).catch(err => {
        console.warn('Demo play error:', err);
      });
    }
  }

  demoPlayBtn.addEventListener('click', toggleDemoPlay);

  demoVolume.addEventListener('input', (e) => {
    demoAudio.volume = parseFloat(e.target.value) / 100;
  });

  demoAudio.addEventListener('ended', () => {
    if (demoTracks.length > 1) {
      currentDemoIndex = (currentDemoIndex + 1) % demoTracks.length;
      const track = demoTracks[currentDemoIndex];
      const streamUrl = track.stream_url.startsWith('http')
        ? track.stream_url
        : `${API_BASE}${track.stream_url}`;
      demoAudio.src = streamUrl;
      demoTrackTitle.textContent = `NOW STREAMING PREVIEW: ${track.title.toUpperCase()}`;
      demoAudio.play().catch(() => {});
    }
  });

  // Token Lookup Form
  tokenLookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = lookupEmail.value.trim();
    lookupResult.innerHTML = '<span style="color: var(--neon-cyan);">LOOKING UP CREDENTIALS...</span>';

    try {
      const res = await fetch(`${API_BASE}/api/token/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });

      const data = await res.json();
      if (res.ok && data.found) {
        lookupResult.innerHTML = `
          <div style="background: rgba(0, 240, 255, 0.1); border: 1px solid var(--neon-cyan); padding: 12px; border-radius: 4px; margin-top: 10px;">
            <div style="color: #00ff66; font-weight: bold; margin-bottom: 6px;">✔ ACTIVE SUBSCRIPTION FOUND (${data.tier.toUpperCase()})</div>
            <div style="color: #fff; margin-bottom: 6px;">Your Access Token: <strong style="color: var(--neon-yellow);">${data.token}</strong></div>
            <div style="color: var(--text-muted); font-size: 0.8rem; word-break: break-all;">OBS URL: <a href="${data.obs_url}" target="_blank" style="color: var(--neon-cyan);">${data.obs_url}</a></div>
          </div>
        `;
      } else {
        lookupResult.innerHTML = `<span style="color: #ff3366;">✖ ${data.message || 'No active subscription found for that email.'}</span>`;
      }
    } catch (err) {
      lookupResult.innerHTML = `<span style="color: #ff3366;">✖ Error contacting authentication server.</span>`;
    }
  });

  loadDemoFeed();
})();
