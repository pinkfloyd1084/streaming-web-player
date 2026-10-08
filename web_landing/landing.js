/**
 * Radio Anarchy - Landing Page & Sign-Up Engine
 */

(function () {
  'use strict';

  const API_BASE = window.location.origin.startsWith('http')
    ? window.location.origin
    : 'https://radio.radioanarchy.gg:8205';

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

  // Nav & Auth Elements
  const loggedOutActions = document.getElementById('loggedOutActions');
  const loggedInActions = document.getElementById('loggedInActions');
  const userGreeting = document.getElementById('userGreeting');
  const launchObsBtn = document.getElementById('launchObsBtn');
  const copyObsLinkBtn = document.getElementById('copyObsLinkBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  // Modals
  const signInModal = document.getElementById('signInModal');
  const openSignInModalBtn = document.getElementById('openSignInModalBtn');
  const closeSignInModal = document.getElementById('closeSignInModal');
  const authIdentifier = document.getElementById('authIdentifier');
  const submitSignInBtn = document.getElementById('submitSignInBtn');
  const signInMsg = document.getElementById('signInMsg');

  const sponsorModal = document.getElementById('sponsorModal');
  const openSponsorModalBtn = document.getElementById('openSponsorModalBtn');
  const closeSponsorModal = document.getElementById('closeSponsorModal');
  const sponsorCode = document.getElementById('sponsorCode');
  const sponsorName = document.getElementById('sponsorName');
  const sponsorEmail = document.getElementById('sponsorEmail');
  const submitSponsorBtn = document.getElementById('submitSponsorBtn');
  const sponsorMsg = document.getElementById('sponsorMsg');

  // Session Persistence
  function getSavedSession() {
    try {
      const data = localStorage.getItem('ra_session');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    try {
      localStorage.setItem('ra_session', JSON.stringify(session));
    } catch (e) {
      console.warn('Storage save error:', e);
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem('ra_session');
    } catch (e) {}
  }

  function updateAuthUI() {
    const session = getSavedSession();
    const streamerHudCard = document.getElementById('streamerHudCard');
    const hudOwnerGreeting = document.getElementById('hudOwnerGreeting');
    const hudTierBadge = document.getElementById('hudTierBadge');
    const hudObsUrlInput = document.getElementById('hudObsUrlInput');
    const navUserGreeting = document.getElementById('navUserGreeting');

    if (session && session.token) {
      if (loggedOutActions) loggedOutActions.style.display = 'none';
      if (loggedInActions) loggedInActions.style.display = 'flex';
      if (navUserGreeting) {
        navUserGreeting.textContent = `${(session.owner || 'STREAMER').toUpperCase()} (${(session.tier || 'PRO').toUpperCase()})`;
      }
      if (streamerHudCard) {
        streamerHudCard.style.display = 'flex';
      }
      if (hudOwnerGreeting) {
        hudOwnerGreeting.textContent = `Welcome back, ${session.owner || 'Streamer'}!`;
      }
      if (hudTierBadge) {
        hudTierBadge.textContent = `${(session.tier || 'PRO').toUpperCase()} BROADCASTER // ACTIVE`;
      }
      if (hudObsUrlInput) {
        const obsUrl = session.obs_url || `${API_BASE}/player/?token=${session.token}`;
        hudObsUrlInput.value = obsUrl;
      }
    } else {
      if (loggedOutActions) loggedOutActions.style.display = 'flex';
      if (loggedInActions) loggedInActions.style.display = 'none';
      if (streamerHudCard) streamerHudCard.style.display = 'none';
    }
  }

  // Streamer HUD button bindings
  const hudCopyBtn = document.getElementById('hudCopyBtn');
  const hudLaunchBtn = document.getElementById('hudLaunchBtn');
  const hudSignOutBtn = document.getElementById('hudSignOutBtn');
  const signOutBtnNav = document.getElementById('signOutBtnNav');

  if (hudCopyBtn) {
    hudCopyBtn.onclick = () => {
      const hudObsUrlInput = document.getElementById('hudObsUrlInput');
      const session = getSavedSession();
      const urlToCopy = (session && session.obs_url) ? session.obs_url : (hudObsUrlInput ? hudObsUrlInput.value : `${API_BASE}/player/`);
      navigator.clipboard.writeText(urlToCopy).then(() => {
        const textSpan = document.getElementById('hudCopyText');
        if (textSpan) {
          textSpan.textContent = 'COPIED TO CLIPBOARD!';
          setTimeout(() => { textSpan.textContent = 'COPY OBS URL'; }, 2500);
        }
      });
    };
  }

  if (hudLaunchBtn) {
    hudLaunchBtn.onclick = () => {
      const hudObsUrlInput = document.getElementById('hudObsUrlInput');
      const session = getSavedSession();
      const obsUrl = (session && session.obs_url) ? session.obs_url : (hudObsUrlInput ? hudObsUrlInput.value : `${API_BASE}/player/`);
      window.open(obsUrl, '_blank');
    };
  }

  if (hudSignOutBtn) {
    hudSignOutBtn.onclick = () => {
      clearSession();
      updateAuthUI();
    };
  }

  if (signOutBtnNav) {
    signOutBtnNav.onclick = () => {
      clearSession();
      updateAuthUI();
    };
  }

  // Modal Open/Close handlers
  if (openSignInModalBtn) {
    openSignInModalBtn.onclick = () => {
      signInModal.classList.add('active');
      signInMsg.style.display = 'none';
      if (authIdentifier) authIdentifier.focus();
    };
  }

  if (closeSignInModal) {
    closeSignInModal.onclick = () => signInModal.classList.remove('active');
  }

  if (openSponsorModalBtn) {
    openSponsorModalBtn.onclick = () => {
      sponsorModal.classList.add('active');
      sponsorMsg.style.display = 'none';
      if (sponsorCode) sponsorCode.focus();
    };
  }

  if (closeSponsorModal) {
    closeSponsorModal.onclick = () => sponsorModal.classList.remove('active');
  }

  window.onclick = (e) => {
    if (e.target === signInModal) signInModal.classList.remove('active');
    if (e.target === sponsorModal) sponsorModal.classList.remove('active');
  };

  // Sign In Handler
  if (submitSignInBtn) {
    submitSignInBtn.onclick = async () => {
      const idVal = authIdentifier.value.trim();
      if (!idVal) {
        signInMsg.className = 'modal-msg error';
        signInMsg.textContent = 'Please enter your token or email address.';
        return;
      }

      submitSignInBtn.textContent = 'AUTHENTICATING...';
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: idVal })
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          saveSession(data);
          signInMsg.className = 'modal-msg success';
          signInMsg.textContent = `✔ Welcome back, ${data.owner}! Session remembered.`;
          updateAuthUI();
          setTimeout(() => {
            signInModal.classList.remove('active');
            submitSignInBtn.textContent = 'AUTHENTICATE & GET OBS LINK';
          }, 1200);
        } else {
          signInMsg.className = 'modal-msg error';
          signInMsg.textContent = `✖ ${data.message || 'No active subscription found.'}`;
          submitSignInBtn.textContent = 'AUTHENTICATE & GET OBS LINK';
        }
      } catch (err) {
        signInMsg.className = 'modal-msg error';
        signInMsg.textContent = '✖ Could not reach authentication server.';
        submitSignInBtn.textContent = 'AUTHENTICATE & GET OBS LINK';
      }
    };
  }

  // Sponsor Code Redemption Handler
  if (submitSponsorBtn) {
    submitSponsorBtn.onclick = async () => {
      const codeVal = sponsorCode.value.trim();
      const nameVal = sponsorName.value.trim();
      const emailVal = sponsorEmail.value.trim();

      if (!codeVal) {
        sponsorMsg.className = 'modal-msg error';
        sponsorMsg.textContent = 'Please enter your Sponsor VIP code.';
        return;
      }

      submitSponsorBtn.textContent = 'VERIFYING VIP CODE...';
      try {
        const res = await fetch(`${API_BASE}/api/sponsor/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeVal, name: nameVal, email: emailVal })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          saveSession(data);
          sponsorMsg.className = 'modal-msg success';
          sponsorMsg.innerHTML = `
            ✔ VIP UNLOCKED! Welcome ${data.owner}!<br>
            <strong>Your OBS Token:</strong> ${data.token}<br>
            <span style="font-size:0.75rem; word-break:break-all;">OBS URL: ${data.obs_url}</span>
          `;
          updateAuthUI();
          setTimeout(() => {
            sponsorModal.classList.remove('active');
            submitSponsorBtn.textContent = 'CLAIM LIFETIME VIP PASS';
          }, 3000);
        } else {
          sponsorMsg.className = 'modal-msg error';
          sponsorMsg.textContent = `✖ ${data.detail || 'Invalid sponsor code.'}`;
          submitSponsorBtn.textContent = 'CLAIM LIFETIME VIP PASS';
        }
      } catch (err) {
        sponsorMsg.className = 'modal-msg error';
        sponsorMsg.textContent = '✖ Error contacting authentication server.';
        submitSponsorBtn.textContent = 'CLAIM LIFETIME VIP PASS';
      }
    };
  }

  // Launch & Copy OBS Buttons
  if (launchObsBtn) {
    launchObsBtn.onclick = () => {
      const session = getSavedSession();
      if (session && session.obs_url) {
        window.open(session.obs_url, '_blank');
      } else {
        window.open(`${API_BASE}/player/`, '_blank');
      }
    };
  }

  if (copyObsLinkBtn) {
    copyObsLinkBtn.onclick = () => {
      const session = getSavedSession();
      const urlToCopy = session && session.obs_url ? session.obs_url : `${API_BASE}/player/`;
      navigator.clipboard.writeText(urlToCopy).then(() => {
        const originalText = copyObsLinkBtn.textContent;
        copyObsLinkBtn.textContent = '✔ COPIED TO CLIPBOARD!';
        setTimeout(() => {
          copyObsLinkBtn.textContent = originalText;
        }, 2000);
      });
    };
  }

  if (signOutBtn) {
    signOutBtn.onclick = () => {
      clearSession();
      updateAuthUI();
    };
  }

  // Initialize Auth State on Page Load
  updateAuthUI();

  // Payment Link configuration (Stripe live payment links)
  const STRIPE_LINKS = {
    shuffle: 'https://buy.stripe.com/dRmfZh3T0b305Pm6a4bwk02',
    pro: 'https://buy.stripe.com/dRm14n89g1sq7Xu1TObwk01'
  };

  buyShuffleBtn.onclick = () => {
    window.open(STRIPE_LINKS.shuffle, '_blank');
  };

  buyProBtn.onclick = () => {
    window.open(STRIPE_LINKS.pro, '_blank');
  };

  // Demo audio preview
  let isDemoPlaying = false;
  let demoTracks = [];
  let currentDemoIndex = 0;
  const DEMO_PREVIEW_LIMIT = 90; // 1:30 max preview limit

  async function loadDemoFeed() {
    try {
      const res = await fetch(`${API_BASE}/channel/Arcade?token=${DEMO_TOKEN}`);
      if (res.ok) {
        const data = await res.json();
        demoTracks = data.playlist || [];
        if (demoTracks.length > 0) {
          demoTrackTitle.textContent = `PREVIEW: ${demoTracks[0].title.toUpperCase()} // READY TO PLAY [1:30 DEMO]`;
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
      if (demoAudio.currentTime >= DEMO_PREVIEW_LIMIT) {
        demoAudio.currentTime = 0;
      }
      if (!demoAudio.src) {
        const track = demoTracks[currentDemoIndex];
        const streamUrl = track.stream_url.startsWith('http')
          ? track.stream_url
          : `${API_BASE}${track.stream_url}`;
        demoAudio.src = streamUrl;
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

  demoAudio.addEventListener('timeupdate', () => {
    if (!isDemoPlaying) return;
    const elapsed = Math.floor(demoAudio.currentTime);
    const remaining = Math.max(0, DEMO_PREVIEW_LIMIT - elapsed);
    const remMins = Math.floor(remaining / 60);
    const remSecs = (remaining % 60).toString().padStart(2, '0');

    if (demoAudio.currentTime >= DEMO_PREVIEW_LIMIT) {
      demoAudio.pause();
      demoAudio.currentTime = 0;
      isDemoPlaying = false;
      demoPlayIcon.textContent = '▶';
      demoPlayLabel.textContent = 'REPLAY PREVIEW';
      demoTrackTitle.innerHTML = '<span style="color: var(--neon-pink); font-weight: bold;">⚡ 1:30 PREVIEW TIME LIMIT REACHED // UNLOCK FULL UNLIMITED ACCESS BELOW</span>';
    } else {
      const track = demoTracks[currentDemoIndex];
      const title = track ? track.title.toUpperCase() : 'BROADCAST AUDIO';
      demoTrackTitle.innerHTML = `<span>PREVIEWING: ${title}</span> <span style="color: var(--neon-yellow); margin-left: 8px;">[${remMins}:${remSecs} LEFT]</span>`;
    }
  });

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
