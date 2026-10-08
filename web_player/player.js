/**
 * Radio Anarchy - OBS HTML5 Audio Player Engine
 * Features:
 * - Dual-Deck Gapless Preloading & Equal-Power Crossfading (10s preload, 3s crossfade)
 * - OBS Browser Source CEF Autoplay Bypass Logic
 * - 10-Channel Live Genre Switching
 * - Neon Synthwave LED Text Crawl & Audio Visualizer
 */

(function () {
  'use strict';

  // Parse URL Parameters
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || 'RA-MASTER-DEV-2026';
  const initialChannel = params.get('channel') || null;
  const isTransparent = params.get('transparent') === 'true';

  if (isTransparent) {
    document.body.classList.add('transparent');
  }

  // Base API configuration
  const API_BASE = window.location.origin.includes('http') && !window.location.origin.startsWith('file:')
    ? window.location.origin
    : 'https://radio.radioanarchy.gg:8205';

  // DOM Elements
  const deckA = document.getElementById('deckA');
  const deckB = document.getElementById('deckB');
  const channelListEl = document.getElementById('channelList');
  const nowPlayingText = document.getElementById('nowPlayingText');
  const marqueeTrack = document.getElementById('marqueeTrack');
  const equalizerEl = document.getElementById('equalizer');
  const currentChannelBadge = document.getElementById('currentChannelBadge');
  const timeDisplay = document.getElementById('timeDisplay');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const playLabel = document.getElementById('playLabel');
  const nextBtn = document.getElementById('nextBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumePercent = document.getElementById('volumePercent');
  const obsBypassBanner = document.getElementById('obsBypassBanner');

  // State
  let channels = [];
  let currentGenre = null;
  let playlist = [];
  let currentIndex = 0;
  let masterVolume = 0.7;
  let isPlaying = false;
  let isCrossfading = false;
  let preloadedNextTrack = false;
  let audioContext = null;

  // Deck References
  let activeDeck = deckA;
  let standbyDeck = deckB;

  // Format mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Set Master Volume
  function updateVolume(val) {
    masterVolume = Math.max(0, Math.min(1, val));
    volumeSlider.value = Math.round(masterVolume * 100);
    volumePercent.textContent = `${Math.round(masterVolume * 100)}%`;
    if (!isCrossfading && activeDeck) {
      activeDeck.volume = masterVolume;
    }
  }

  // Marquee Scroller Reset
  function updateNowPlayingDisplay(track) {
    if (!track) {
      nowPlayingText.textContent = 'NO TRACK LOADED // SELECT A CHANNEL';
      return;
    }
    const displayText = `[${track.genre.toUpperCase()}] NOW PLAYING: ${track.title.toUpperCase()} // RADIO ANARCHY STREAMWAVE`;
    nowPlayingText.textContent = displayText;

    // Reset marquee animation for crisp loop
    marqueeTrack.style.animation = 'none';
    void marqueeTrack.offsetWidth; // trigger reflow
    marqueeTrack.style.animation = 'marquee-scroll 22s linear infinite';
  }

  // Fetch Available Channels
  async function loadChannels() {
    try {
      const res = await fetch(`${API_BASE}/channels?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        throw new Error(`Auth failed (${res.status})`);
      }
      const data = await res.json();
      channels = data.channels || [];
      renderChannelButtons();

      // Pick initial channel
      let target = channels[0]?.genre;
      if (initialChannel) {
        const found = channels.find(c => c.genre.toLowerCase() === initialChannel.toLowerCase());
        if (found) target = found.genre;
      }
      if (target) {
        selectChannel(target);
      }
    } catch (err) {
      nowPlayingText.textContent = `SYSTEM ERROR: ${err.message}. VERIFY TOKEN.`;
      console.error('[RadioAnarchy] Channel load error:', err);
    }
  }

  // Render Channel Selector Grid
  function renderChannelButtons() {
    channelListEl.innerHTML = '';
    channels.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'ch-btn';
      btn.textContent = ch.genre;
      btn.title = `${ch.genre} (${ch.track_count} tracks)`;
      btn.onclick = () => selectChannel(ch.genre);
      channelListEl.appendChild(btn);
    });
  }

  // Select Channel and Fetch Playlist
  async function selectChannel(genre, forcePlay = true) {
    if (currentGenre === genre && playlist.length > 0) {
      if (activeDeck.paused) {
        attemptPlay();
      }
      return;
    }
    currentGenre = genre;
    currentChannelBadge.textContent = `CH: ${genre.toUpperCase()}`;

    // Update active button state
    document.querySelectorAll('.ch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === genre.toLowerCase());
    });

    nowPlayingText.textContent = `TUNING FREQUENCY // LOADING ${genre.toUpperCase()}...`;

    try {
      const res = await fetch(`${API_BASE}/channel/${encodeURIComponent(genre)}?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      playlist = data.playlist || [];
      currentIndex = 0;
      preloadedNextTrack = false;
      isCrossfading = false;

      if (playlist.length > 0) {
        loadTrack(currentIndex, forcePlay);
      }
    } catch (err) {
      nowPlayingText.textContent = `ERROR TUNING ${genre}: ${err.message}`;
    }
  }

  // Load Track into Active Deck
  function loadTrack(index, autoPlay = true) {
    if (!playlist || playlist.length === 0) return;
    const track = playlist[index];
    const fullStreamUrl = track.stream_url.startsWith('http') 
      ? track.stream_url 
      : `${API_BASE}${track.stream_url}`;

    activeDeck.src = fullStreamUrl;
    activeDeck.volume = masterVolume;
    updateNowPlayingDisplay(track);

    preloadedNextTrack = false;
    isCrossfading = false;

    if (autoPlay) {
      attemptPlay();
    }
  }

  // Audio Playback & OBS Autoplay Bypass
  function attemptPlay() {
    activeDeck.muted = false;
    activeDeck.volume = masterVolume;

    const playPromise = activeDeck.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log('[RadioAnarchy] Audio playing successfully!');
        isPlaying = true;
        updatePlayStateUI(true);
        obsBypassBanner.classList.remove('visible');
      }).catch(err => {
        console.warn('[RadioAnarchy] Autoplay prevented by browser:', err);
        isPlaying = false;
        updatePlayStateUI(false);
        obsBypassBanner.classList.add('visible');
      });
    }
  }

  function updatePlayStateUI(playing) {
    if (playing) {
      playIcon.textContent = '⏸';
      playLabel.textContent = 'PAUSE';
      equalizerEl.classList.add('playing');
    } else {
      playIcon.textContent = '▶';
      playLabel.textContent = 'PLAY';
      equalizerEl.classList.remove('playing');
    }
  }

  function togglePlay() {
    if (isPlaying) {
      activeDeck.pause();
      if (standbyDeck && !standbyDeck.paused) standbyDeck.pause();
      isPlaying = false;
      updatePlayStateUI(false);
    } else {
      attemptPlay();
    }
  }

  function skipNext() {
    if (playlist.length === 0) return;
    currentIndex = (currentIndex + 1) % playlist.length;
    // Stop standby if playing
    standbyDeck.pause();
    standbyDeck.currentTime = 0;
    loadTrack(currentIndex, true);
  }

  // Time Monitor: Gapless Preload (10s) and Smooth Crossfade (3s)
  function setupDeckListeners(deck) {
    deck.addEventListener('timeupdate', () => {
      if (deck !== activeDeck) return;

      const duration = deck.duration;
      const current = deck.currentTime;

      if (!isNaN(duration) && duration > 0) {
        timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        const remaining = duration - current;

        // 1. Preload Standby Deck 10 seconds before track ends
        if (remaining <= 10 && !preloadedNextTrack && playlist.length > 1) {
          preloadedNextTrack = true;
          const nextIndex = (currentIndex + 1) % playlist.length;
          const nextTrack = playlist[nextIndex];
          const nextUrl = nextTrack.stream_url.startsWith('http')
            ? nextTrack.stream_url
            : `${API_BASE}${nextTrack.stream_url}`;

          standbyDeck.src = nextUrl;
          standbyDeck.volume = 0;
          standbyDeck.load();
          console.log(`[RadioAnarchy] Preloading next track (${nextTrack.title}) on standby deck.`);
        }

        // 2. Crossfade 3 seconds before track ends
        if (remaining <= 3 && !isCrossfading && preloadedNextTrack) {
          executeCrossfade(remaining);
        }
      }
    });

    deck.addEventListener('ended', () => {
      if (deck === activeDeck && !isCrossfading) {
        skipNext();
      }
    });

    deck.addEventListener('error', (e) => {
      console.error('[RadioAnarchy] Deck audio error:', e, deck.error);
      const code = deck.error ? deck.error.code : 'unknown';
      const msg = deck.error ? deck.error.message : '';
      nowPlayingText.textContent = `AUDIO LOAD ERROR [Code ${code}]: ${msg}`;
    });
  }

  // Studio-Grade 3-Second Crossfade Execution
  function executeCrossfade(remainingSec) {
    isCrossfading = true;
    const fadeDurationMs = Math.min(3000, Math.max(1000, remainingSec * 1000));
    const stepInterval = 50; // ms
    const totalSteps = fadeDurationMs / stepInterval;
    let step = 0;

    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];

    standbyDeck.volume = 0;
    standbyDeck.play().catch(e => console.warn('Standby play error:', e));

    console.log(`[RadioAnarchy] Initiating crossfade -> ${nextTrack.title}`);
    updateNowPlayingDisplay(nextTrack);

    const fadeTimer = setInterval(() => {
      step++;
      const progress = step / totalSteps;

      // Equal-power crossfade curve
      const gainOut = Math.cos(progress * 0.5 * Math.PI) * masterVolume;
      const gainIn = Math.sin(progress * 0.5 * Math.PI) * masterVolume;

      activeDeck.volume = Math.max(0, gainOut);
      standbyDeck.volume = Math.min(masterVolume, gainIn);

      if (step >= totalSteps) {
        clearInterval(fadeTimer);
        // Finalize Deck Swap
        activeDeck.pause();
        activeDeck.currentTime = 0;
        activeDeck.volume = 0;

        // Swap references
        const temp = activeDeck;
        activeDeck = standbyDeck;
        standbyDeck = temp;

        activeDeck.volume = masterVolume;
        currentIndex = nextIndex;
        preloadedNextTrack = false;
        isCrossfading = false;
        console.log('[RadioAnarchy] Crossfade complete. Decks swapped.');
      }
    }, stepInterval);
  }

  // AudioContext initialization for OBS browser unlock
  function initAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  }

  // Setup Event Listeners
  setupDeckListeners(deckA);
  setupDeckListeners(deckB);

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    skipNext();
  });

  volumeSlider.addEventListener('input', (e) => {
    updateVolume(parseFloat(e.target.value) / 100);
  });

  // User click on banner or page
  obsBypassBanner.addEventListener('click', (e) => {
    e.stopPropagation();
    obsBypassBanner.classList.remove('visible');
    initAudioContext();
    attemptPlay();
  });

  window.addEventListener('click', () => {
    obsBypassBanner.classList.remove('visible');
    initAudioContext();
    if (activeDeck.paused) {
      attemptPlay();
    }
  });

  // OBS-specific event hooks for browser sources
  window.addEventListener('obsSourceVisibleChanged', (e) => {
    if (e.detail && e.detail.visible) {
      initAudioContext();
      if (!isPlaying) {
        attemptPlay();
      }
    }
  });

  // Initialize
  updateVolume(masterVolume);
  loadChannels();

})();
