/**
 * app.js - Mobile App Prototype Logic for Radio VN
 * Quản lý điều hướng Tabs, Mini Player, Fullscreen Player, Visualizer và Wizard 4 bước.
 */

// Xác định API Base URL linh hoạt
const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ? window.location.origin
  : 'http://localhost:8000';

// =============================================================================
// TRẠNG THÁI ỨNG DỤNG TOÀN CỤC (APPLICATION STATE)
// =============================================================================
const state = {
  // Người dùng hiện tại
  user: JSON.parse(localStorage.getItem('radiovn_user')) || {
    id: 1,
    username: 'demo_user',
    full_name: 'Thính Giả Demo',
    email: 'demo@radiovn.ai'
  },
  token: localStorage.getItem('radiovn_token') || 'demo_token',

  // Tab màn hình hiện tại ('screenHome' | 'screenMyChannels' | 'screenProfile')
  activeTab: 'screenHome',

  // Danh sách kênh & bộ lọc
  channels: [],
  filter: 'all',
  searchQuery: '',

  // Kênh & Bản tin đang phát sóng
  activeChannel: null,
  activeBroadcast: null,
  isPlaying: false,
  currentTime: 0,
  duration: 180,
  playbackSpeed: 1.0,
  volume: 0.8,
  isMuted: false,

  // Trạng thái Wizard 4 bước
  wizard: {
    currentStep: 1,
    channelName: '',
    prompt: '',
    topic: 'cong-nghe',
    tone: 'Vui vẻ',
    contentType: 'continuous',
    sources: [],
    broadcastMode: 'live',
    voiceCode: 'vi-VN-MinhQuan',
    voiceName: 'Minh Quân (Nam - Giọng Bắc)',
    previewData: null
  },

  voicesCatalog: []
};

// =============================================================================
// WEB AUDIO & SPEECH SYNTHESIS ENGINE
// =============================================================================
class RadioAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.speechSynth = window.speechSynthesis;
    this.utterance = null;
    this.timerInterval = null;
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playRadioJingle() {
    try {
      this.initAudioContext();
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Hợp âm Chime Radio 3 nốt: C5 -> E5 -> G5
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);

        gain.gain.setValueAtTime(0, now + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.18 * state.volume, now + idx * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.6);
      });
    } catch (e) {
      console.warn('AudioContext Jingle warning:', e);
    }
  }

  speakText(text, onEndCallback) {
    if (!this.speechSynth) return;
    this.speechSynth.cancel();

    const cleanedText = text
      .replace(/\[SFX:[^\]]+\]/g, ' ')
      .replace(/KÊNH:[^\n]+/g, ' ')
      .replace(/ĐÀI PHÁT THANH[^\n]+/g, ' ')
      .trim();

    this.utterance = new SpeechSynthesisUtterance(cleanedText);
    this.utterance.rate = state.playbackSpeed;
    this.utterance.volume = state.isMuted ? 0 : state.volume;

    const voices = this.speechSynth.getVoices();
    const vnVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
    if (vnVoice) {
      this.utterance.voice = vnVoice;
    } else {
      this.utterance.lang = 'vi-VN';
    }

    if (state.activeChannel && state.activeChannel.voice_name.includes('Nữ')) {
      this.utterance.pitch = 1.15;
    } else {
      this.utterance.pitch = 0.95;
    }

    this.utterance.onend = () => {
      if (onEndCallback) onEndCallback();
    };

    this.speechSynth.speak(this.utterance);
  }

  pause() {
    if (this.speechSynth && this.speechSynth.speaking) {
      this.speechSynth.pause();
    }
  }

  resume() {
    if (this.speechSynth && this.speechSynth.paused) {
      this.speechSynth.resume();
    }
  }

  stop() {
    if (this.speechSynth) {
      this.speechSynth.cancel();
    }
  }
}

const audioEngine = new RadioAudioEngine();

// =============================================================================
// CANVAS AUDIO VISUALIZER (SÓNG ÂM THANH TRỰC TIẾP TRÊN MÀN HÌNH PLAYER)
// =============================================================================
let visualizerAnimationId = null;

function initCanvasVisualizer() {
  const canvas = document.getElementById('visualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  let phase = 0;

  function renderWave() {
    ctx.clearRect(0, 0, width, height);

    const barCount = 28;
    const barWidth = 4;
    const gap = (width - barCount * barWidth) / (barCount - 1);

    for (let i = 0; i < barCount; i++) {
      let barHeight;
      if (state.isPlaying) {
        const wave1 = Math.sin(phase + i * 0.3);
        const wave2 = Math.cos(phase * 1.6 + i * 0.25);
        const intensity = Math.abs(wave1 * wave2);
        barHeight = Math.max(5, intensity * (height - 6));
      } else {
        barHeight = 5;
      }

      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#818cf8');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }

    if (state.isPlaying) {
      phase += 0.08 * state.playbackSpeed;
    }

    visualizerAnimationId = requestAnimationFrame(renderWave);
  }

  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
  }
  renderWave();
}

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    info: 'border-sky-500 bg-slate-900/95 text-sky-300',
    success: 'border-emerald-500 bg-slate-900/95 text-emerald-300',
    warning: 'border-amber-500 bg-slate-900/95 text-amber-300',
    error: 'border-rose-500 bg-slate-900/95 text-rose-300'
  };

  const icons = {
    info: 'info',
    success: 'check-circle-2',
    warning: 'alert-triangle',
    error: 'alert-circle'
  };

  toast.className = `flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-2xl text-xs font-semibold backdrop-blur-md pointer-events-auto transition-all duration-300 ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
    <span class="truncate">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// =============================================================================
// REAL-TIME MOBILE CLOCK
// =============================================================================
function updateMobileClock() {
  const clockEl = document.getElementById('mobileClock');
  if (!clockEl) return;
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  clockEl.textContent = `${hours}:${minutes}`;

  const greetingDateEl = document.getElementById('greetingDate');
  if (greetingDateEl) {
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    greetingDateEl.textContent = `${day}/${month}/${year}`;
  }
}
setInterval(updateMobileClock, 10000);

// =============================================================================
// TAB NAVIGATION CONTROLLER
// =============================================================================
function switchTab(targetScreenId) {
  state.activeTab = targetScreenId;

  // Ẩn tất cả các màn hình
  const screens = ['screenHome', 'screenMyChannels', 'screenProfile'];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (el) {
      if (s === targetScreenId) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  // Cập nhật trạng thái màu sắc trên Bottom Navigation Bar
  document.querySelectorAll('.nav-item').forEach(btn => {
    const target = btn.dataset.target;
    if (target === targetScreenId) {
      btn.className = 'nav-item active flex flex-col items-center gap-1 text-sky-400 transition';
    } else {
      btn.className = 'nav-item flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200 transition';
    }
  });

  // Cuộn về đỉnh của scroll area
  const scrollArea = document.getElementById('mainScrollArea');
  if (scrollArea) scrollArea.scrollTop = 0;
}

// =============================================================================
// API CALLS
// =============================================================================
async function fetchChannels() {
  try {
    const userId = state.user ? state.user.id : 1;
    const res = await fetch(`${API_BASE_URL}/api/channels?user_id=${userId}`);
    if (!res.ok) throw new Error('Không thể tải danh sách kênh');
    const data = await res.json();
    state.channels = data.channels || [];
    renderChannelsList();

    const countBadge = document.getElementById('myChannelsBadge');
    if (countBadge) countBadge.textContent = `${state.channels.length} Kênh`;

    const statChannels = document.getElementById('statChannelsCount');
    if (statChannels) statChannels.textContent = state.channels.length;

    if (!state.activeChannel && state.channels.length > 0) {
      loadChannelForPlayback(state.channels[0], false);
    }
  } catch (err) {
    console.error('fetchChannels error:', err);
    showToast('Lỗi kết nối tới máy chủ Radio VN', 'error');
  }
}

async function fetchVoices() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/voices`);
    if (res.ok) {
      const data = await res.json();
      state.voicesCatalog = data.voices || [];
      renderVoiceSelection();
    }
  } catch (e) {
    console.warn('Cannot fetch voices:', e);
  }
}

async function loadChannelForPlayback(channel, autoPlay = true) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channel.id}`);
    if (!res.ok) throw new Error('Lỗi tải chi tiết kênh');
    const data = await res.json();

    state.activeChannel = data.channel;
    state.activeBroadcast = data.latest_broadcast;
    state.currentTime = 0;
    state.duration = data.latest_broadcast ? data.latest_broadcast.duration_est : 180;

    updatePlayerUI();

    if (autoPlay) {
      startPlayback();
    } else {
      pausePlayback();
    }

    renderChannelsList();
  } catch (err) {
    console.error('loadChannelForPlayback error:', err);
    showToast('Không thể tải số phát thanh của kênh này', 'error');
  }
}

async function refreshChannelBroadcast(channelId) {
  showToast('Đang cập nhật tin mới & biên tập radio...', 'info');
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}/generate-broadcast`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Lỗi làm mới kênh');
    const data = await res.json();
    showToast('Bản tin phát thanh 24/7 đã được cập nhật!', 'success');

    if (state.activeChannel && state.activeChannel.id === channelId) {
      state.activeBroadcast = data.broadcast;
      state.currentTime = 0;
      state.duration = data.broadcast.duration_est;
      updatePlayerUI();
      startPlayback();
    }

    fetchChannels();
  } catch (err) {
    console.error('refreshChannelBroadcast error:', err);
    showToast('Không thể cập nhật bản tin lúc này', 'error');
  }
}

async function deleteChannel(channelId) {
  if (!confirm('Bạn có chắc chắn muốn xóa kênh này không?')) return;

  try {
    const userId = state.user ? state.user.id : 1;
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}?user_id=${userId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Không thể xóa kênh');

    showToast('Đã xóa kênh thành công', 'success');
    if (state.activeChannel && state.activeChannel.id === channelId) {
      audioEngine.stop();
      state.isPlaying = false;
      state.activeChannel = null;
      state.activeBroadcast = null;
      updatePlayerUI();
    }
    fetchChannels();
  } catch (err) {
    console.error('deleteChannel error:', err);
    showToast('Lỗi khi xóa kênh phát thanh', 'error');
  }
}

// =============================================================================
// AUDIO CONTROLS & TIMERS
// =============================================================================
function startPlayback() {
  if (!state.activeChannel || !state.activeBroadcast) {
    showToast('Vui lòng chọn 1 kênh phát thanh để nghe', 'warning');
    return;
  }

  state.isPlaying = true;
  audioEngine.playRadioJingle();

  setTimeout(() => {
    audioEngine.speakText(state.activeBroadcast.script_text, () => {
      if (state.activeChannel.broadcast_mode === 'live') {
        state.currentTime = 0;
        startPlayback();
      } else {
        pausePlayback();
      }
    });
  }, 500);

  if (audioEngine.timerInterval) clearInterval(audioEngine.timerInterval);
  audioEngine.timerInterval = setInterval(() => {
    if (state.isPlaying) {
      state.currentTime += 1;
      if (state.currentTime >= state.duration) {
        state.currentTime = state.duration;
      }
      updatePlayerTimeline();
    }
  }, 1000);

  updatePlayerUI();
  renderChannelsList();
}

function pausePlayback() {
  state.isPlaying = false;
  audioEngine.pause();
  if (audioEngine.timerInterval) {
    clearInterval(audioEngine.timerInterval);
  }
  updatePlayerUI();
  renderChannelsList();
}

function togglePlayPause() {
  if (state.isPlaying) {
    pausePlayback();
  } else {
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      state.isPlaying = true;
      audioEngine.resume();
      audioEngine.timerInterval = setInterval(() => {
        if (state.isPlaying) {
          state.currentTime += 1;
          updatePlayerTimeline();
        }
      }, 1000);
      updatePlayerUI();
      renderChannelsList();
    } else {
      startPlayback();
    }
  }
}

function seekRelative(seconds) {
  state.currentTime = Math.max(0, Math.min(state.duration, state.currentTime + seconds));
  updatePlayerTimeline();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updatePlayerTimeline() {
  const fullCurr = document.getElementById('fullPlayerCurrentTime');
  const fullDur = document.getElementById('fullPlayerDuration');
  const fullProgress = document.getElementById('fullPlayerProgressBar');
  const miniProgressLine = document.getElementById('miniProgressLine');

  const percent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  if (fullCurr) fullCurr.textContent = formatTime(state.currentTime);
  if (fullDur) fullDur.textContent = formatTime(state.duration);
  if (fullProgress) fullProgress.value = percent;
  if (miniProgressLine) miniProgressLine.style.width = `${percent}%`;
}

function updatePlayerUI() {
  // Mini Player elements
  const miniTitle = document.getElementById('miniChannelTitle');
  const miniHeadline = document.getElementById('miniHeadline');
  const miniPlayIcon = document.getElementById('miniPlayIcon');
  const islandTrackName = document.getElementById('islandTrackName');

  // Fullscreen Player elements
  const fullTitle = document.getElementById('fullPlayerTitle');
  const fullHeadline = document.getElementById('fullPlayerHeadline');
  const fullTopic = document.getElementById('fullPlayerTopic');
  const fullTone = document.getElementById('fullPlayerTone');
  const fullVoice = document.getElementById('fullPlayerVoice');
  const fullPlayIcon = document.getElementById('fullPlayIcon');

  const topicNames = {
    'cong-nghe': 'Công Nghệ',
    'giao-thong': 'Giao Thông',
    'kinh-doanh': 'Tài Chính',
    'the-thao': 'Thể Thao',
    'tong-hop': 'Tổng Hợp'
  };

  if (!state.activeChannel) {
    if (miniTitle) miniTitle.textContent = 'Chưa chọn kênh';
    if (miniHeadline) miniHeadline.textContent = 'Bấm chọn 1 kênh bên dưới để nghe';
    if (islandTrackName) islandTrackName.textContent = 'Radio VN';
    return;
  }

  const channelTitle = state.activeChannel.name;
  let headlineSnippet = state.activeChannel.prompt;
  if (state.activeBroadcast && state.activeBroadcast.headlines && state.activeBroadcast.headlines.length > 0) {
    headlineSnippet = state.activeBroadcast.headlines[0].title;
  }

  // Update Mini Player
  if (miniTitle) miniTitle.textContent = channelTitle;
  if (miniHeadline) miniHeadline.textContent = headlineSnippet;
  if (islandTrackName) islandTrackName.textContent = channelTitle.split(' ')[0] || 'Radio VN';

  // Update Full Player
  if (fullTitle) fullTitle.textContent = channelTitle;
  if (fullHeadline) fullHeadline.textContent = headlineSnippet;
  if (fullTopic) fullTopic.textContent = topicNames[state.activeChannel.topic] || 'Tin Tức';
  if (fullTone) fullTone.textContent = state.activeChannel.tone;
  if (fullVoice) fullVoice.innerHTML = `<i data-lucide="mic" class="w-3.5 h-3.5"></i><span>${state.activeChannel.voice_name}</span>`;

  // Toggle play icons
  [miniPlayIcon, fullPlayIcon].forEach(icon => {
    if (icon) {
      if (state.isPlaying) {
        icon.setAttribute('data-lucide', 'pause');
        icon.classList.remove('ml-0.5', 'ml-1');
      } else {
        icon.setAttribute('data-lucide', 'play');
        icon.classList.add('ml-0.5');
      }
    }
  });

  if (window.lucide) window.lucide.createIcons();
  updatePlayerTimeline();
}

function openFullscreenPlayer() {
  const fullPlayer = document.getElementById('fullScreenPlayer');
  if (fullPlayer) {
    fullPlayer.classList.add('player-open');
  }
}

function closeFullscreenPlayer() {
  const fullPlayer = document.getElementById('fullScreenPlayer');
  if (fullPlayer) {
    fullPlayer.classList.remove('player-open');
  }
}

// =============================================================================
// RENDERING MOBILE CHANNELS LIST
// =============================================================================
function renderChannelsList() {
  const homeContainer = document.getElementById('homeChannelsList');
  const myChannelsContainer = document.getElementById('myChannelsContainer');

  let filtered = state.channels;
  if (state.filter === 'live') {
    filtered = filtered.filter(c => c.broadcast_mode === 'live');
  } else if (state.filter === 'podcast') {
    filtered = filtered.filter(c => c.broadcast_mode === 'podcast');
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.prompt.toLowerCase().includes(q) ||
      c.topic.toLowerCase().includes(q)
    );
  }

  const topicBadges = {
    'cong-nghe': { bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30', label: 'Công Nghệ' },
    'giao-thong': { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Giao Thông' },
    'kinh-doanh': { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Tài Chính' },
    'the-thao': { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: 'Thể Thao' },
    'tong-hop': { bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30', label: 'Tổng Hợp' }
  };

  const buildChannelCardHTML = (ch) => {
    const isCurrentActive = state.activeChannel && state.activeChannel.id === ch.id;
    const isThisPlaying = isCurrentActive && state.isPlaying;
    const tBadge = topicBadges[ch.topic] || topicBadges['cong-nghe'];

    return `
      <div class="glass-card rounded-2xl p-3.5 space-y-2.5 relative overflow-hidden transition active:scale-[0.99] ${isCurrentActive ? 'border-sky-500/60 shadow-lg shadow-sky-500/15' : ''}">
        
        <!-- Top bar: Tags + Animated Equalizer -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border ${tBadge.bg}">
              ${tBadge.label}
            </span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              ${ch.tone}
            </span>
            ${ch.broadcast_mode === 'live' ? `
              <span class="text-[9px] font-bold text-red-400 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                24/7
              </span>
            ` : `
              <span class="text-[9px] font-bold text-purple-400">Podcast</span>
            `}
          </div>

          ${isThisPlaying ? `
            <div class="flex items-end gap-0.5 h-4 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          ` : ''}
        </div>

        <!-- Channel Title & Prompt -->
        <div>
          <h4 class="text-xs font-bold text-white line-clamp-1 group-hover:text-sky-300">
            ${ch.name}
          </h4>
          <p class="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
            ${ch.prompt}
          </p>
        </div>

        <!-- Mobile Action Buttons Row -->
        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <div class="text-[10px] text-slate-400 flex items-center gap-1">
            <i data-lucide="mic" class="w-3 h-3 text-sky-400"></i>
            <span class="truncate max-w-[90px]">${ch.voice_name.split('(')[0]}</span>
          </div>

          <div class="flex items-center gap-1">
            <button class="btn-refresh-channel p-1.5 text-slate-400 hover:text-white rounded-lg active:bg-slate-800" title="Làm mới tin" data-id="${ch.id}">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-view-script p-1.5 text-slate-400 hover:text-sky-400 rounded-lg active:bg-slate-800" title="Xem kịch bản" data-id="${ch.id}">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-delete-channel p-1.5 text-slate-500 hover:text-red-400 rounded-lg active:bg-slate-800" title="Xóa kênh" data-id="${ch.id}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-play-channel px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 ${isThisPlaying ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'bg-slate-800 text-white'}" data-id="${ch.id}">
              <i data-lucide="${isThisPlaying ? 'pause' : 'play'}" class="w-3 h-3"></i>
              <span>${isThisPlaying ? 'Tạm Dừng' : 'Nghe Ngay'}</span>
            </button>
          </div>
        </div>

      </div>
    `;
  };

  const cardsHtml = filtered.map(buildChannelCardHTML).join('');

  if (homeContainer) homeContainer.innerHTML = cardsHtml;
  if (myChannelsContainer) myChannelsContainer.innerHTML = cardsHtml;

  if (window.lucide) window.lucide.createIcons();

  // Attach card event listeners
  document.querySelectorAll('.btn-play-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const ch = state.channels.find(c => c.id === id);
      if (ch) {
        if (state.activeChannel && state.activeChannel.id === id) {
          togglePlayPause();
        } else {
          loadChannelForPlayback(ch, true);
        }
      }
    });
  });

  document.querySelectorAll('.btn-refresh-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      refreshChannelBroadcast(id);
    });
  });

  document.querySelectorAll('.btn-view-script').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      openScriptSheetForChannel(id);
    });
  });

  document.querySelectorAll('.btn-delete-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteChannel(id);
    });
  });
}

// =============================================================================
// LIVE SCRIPT BOTTOM SHEET
// =============================================================================
async function openScriptSheetForChannel(channelId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}`);
    if (!res.ok) throw new Error('Không thể tải kịch bản');
    const data = await res.json();

    const titleEl = document.getElementById('scriptSheetTitle');
    const subEl = document.getElementById('scriptSheetSubtitle');
    const contentEl = document.getElementById('scriptSheetContent');
    const sheet = document.getElementById('mobileScriptSheet');

    if (titleEl) titleEl.textContent = `Kịch Bản: ${data.channel.name}`;
    if (subEl) subEl.textContent = `MC: ${data.channel.voice_name} • Phong cách: ${data.channel.tone}`;

    const scriptText = data.latest_broadcast ? data.latest_broadcast.script_text : 'Chưa có kịch bản cho số phát sóng này.';
    const formatted = scriptText.replace(/(\[SFX:[^\]]+\])/g, '<span class="sfx-badge px-2 py-0.5 rounded font-bold inline-block my-1">$1</span>');
    if (contentEl) contentEl.innerHTML = formatted;

    sheet.classList.remove('hidden');
    setTimeout(() => sheet.classList.remove('opacity-0'), 10);
  } catch (e) {
    showToast('Lỗi khi mở kịch bản phát thanh', 'error');
  }
}

function closeScriptSheet() {
  const sheet = document.getElementById('mobileScriptSheet');
  if (!sheet) return;
  sheet.classList.add('opacity-0');
  setTimeout(() => sheet.classList.add('hidden'), 200);
}

// =============================================================================
// MOBILE 4-STEP WIZARD (TẠO KÊNH BẰNG PROMPT)
// =============================================================================
function openWizardModal(preset = null) {
  state.wizard.currentStep = 1;

  if (preset) {
    if (preset.prompt) state.wizard.prompt = preset.prompt;
    if (preset.topic) state.wizard.topic = preset.topic;
    if (preset.tone) state.wizard.tone = preset.tone;
    state.wizard.channelName = preset.prompt.slice(0, 32) + '...';
  } else {
    state.wizard.prompt = '';
    state.wizard.channelName = '';
  }

  const nameInput = document.getElementById('wizChannelName');
  const promptInput = document.getElementById('wizPrompt');
  const topicSelect = document.getElementById('wizTopic');
  const toneSelect = document.getElementById('wizTone');

  if (nameInput) nameInput.value = state.wizard.channelName;
  if (promptInput) promptInput.value = state.wizard.prompt;
  if (topicSelect) topicSelect.value = state.wizard.topic;
  if (toneSelect) toneSelect.value = state.wizard.tone;

  const wlBox = document.getElementById('whitelistResultBox');
  if (wlBox) wlBox.classList.add('hidden');

  updateWizardStepView();

  const modal = document.getElementById('wizardModal');
  modal.classList.remove('hidden');
}

function closeWizardModal() {
  const modal = document.getElementById('wizardModal');
  if (modal) modal.classList.add('hidden');
}

function updateWizardStepView() {
  const step = state.wizard.currentStep;

  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById(`wizardStep${s}`);
    if (el) {
      if (s === step) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  // Step Indicator
  document.querySelectorAll('.step-nav-item').forEach(item => {
    const s = parseInt(item.dataset.step);
    const badge = item.querySelector('.step-badge');
    if (s < step) {
      badge.className = 'step-badge w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold';
      badge.innerHTML = '✓';
    } else if (s === step) {
      badge.className = 'step-badge w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px] font-bold shadow-md shadow-sky-500/40';
      badge.textContent = s;
    } else {
      badge.className = 'step-badge w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]';
      badge.textContent = s;
    }
  });

  for (let i = 1; i <= 3; i++) {
    const line = document.getElementById(`line-${i}`);
    if (line) {
      if (step > i) line.classList.add('active');
      else line.classList.remove('active');
    }
  }

  const btnPrev = document.getElementById('btnWizPrev');
  const btnNext = document.getElementById('btnWizNext');
  const btnFinish = document.getElementById('btnWizFinish');

  if (btnPrev) btnPrev.disabled = (step === 1);

  if (step === 4) {
    if (btnNext) btnNext.classList.add('hidden');
    if (btnFinish) btnFinish.classList.remove('hidden');
  } else {
    if (btnNext) btnNext.classList.remove('hidden');
    if (btnFinish) btnFinish.classList.add('hidden');
  }

  if (step === 2) {
    loadSuggestedSourcesForStep2();
  } else if (step === 3) {
    renderVoiceSelection();
  } else if (step === 4) {
    triggerStep4EditorialPipeline();
  }

  if (window.lucide) window.lucide.createIcons();
}

async function loadSuggestedSourcesForStep2() {
  const container = document.getElementById('wizSourcesList');
  if (!container) return;

  container.innerHTML = '<div class="text-[11px] text-slate-400 py-3 text-center">Đang lọc danh sách báo chính thống...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/sources/suggest?topic=${state.wizard.topic}`);
    if (!res.ok) throw new Error('Không lấy được nguồn');
    const data = await res.json();
    const sources = data.sources || [];

    state.wizard.sources = sources.filter(s => s.active).map(s => s.name);

    container.innerHTML = sources.map(s => {
      const isChecked = state.wizard.sources.includes(s.name);
      return `
        <label class="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 cursor-pointer active:scale-99 transition">
          <div class="flex items-center gap-2">
            <input type="checkbox" class="source-checkbox w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-600 focus:ring-0"
                   value="${s.name}" ${isChecked ? 'checked' : ''} />
            <div>
              <div class="text-xs font-bold text-white">${s.name}</div>
              <div class="text-[9px] text-slate-400 flex items-center gap-1">
                <span class="text-emerald-400 font-semibold">✓ ${s.whitelist_info ? s.whitelist_info.badge_text : 'Chính thống'}</span>
                <span>• ${s.domain}</span>
              </div>
            </div>
          </div>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">Đã duyệt</span>
        </label>
      `;
    }).join('');

    container.querySelectorAll('.source-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const val = cb.value;
        if (cb.checked) {
          if (!state.wizard.sources.includes(val)) state.wizard.sources.push(val);
        } else {
          state.wizard.sources = state.wizard.sources.filter(x => x !== val);
        }
      });
    });

  } catch (err) {
    console.error('loadSuggestedSourcesForStep2 error:', err);
    container.innerHTML = '<div class="text-[11px] text-rose-400 py-2">Không thể tải nguồn tin lúc này.</div>';
  }
}

async function checkCustomUrlWhitelist() {
  const input = document.getElementById('wizCustomUrl');
  const box = document.getElementById('whitelistResultBox');
  if (!input || !box) return;

  const url = input.value.trim();
  if (!url) {
    showToast('Vui lòng nhập URL hoặc tên miền', 'warning');
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = '<div class="text-[11px] text-slate-400">Đang đối soát Whitelist báo chí...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/sources/check-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.is_whitelisted) {
      box.className = 'p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs space-y-1.5';
      box.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-emerald-400">✓ ${data.badge_text}</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">${data.domain}</span>
        </div>
        <p class="text-[10px] text-slate-300 leading-tight">${data.message}</p>
        <button type="button" id="btnAddVerifiedSource" class="mt-1 px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1">
          <i data-lucide="plus" class="w-3 h-3"></i>
          <span>Thêm ${data.source_name} vào kênh</span>
        </button>
      `;

      setTimeout(() => {
        document.getElementById('btnAddVerifiedSource')?.addEventListener('click', () => {
          if (!state.wizard.sources.includes(data.source_name)) {
            state.wizard.sources.push(data.source_name);
            showToast(`Đã thêm ${data.source_name} vào kênh!`, 'success');
            loadSuggestedSourcesForStep2();
          }
        });
      }, 50);

    } else {
      box.className = 'p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs space-y-1';
      box.innerHTML = `
        <div class="font-bold text-amber-400">⚠️ ${data.badge_text} (${data.domain})</div>
        <p class="text-[10px] text-slate-300 leading-tight">${data.message}</p>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    box.className = 'p-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-[11px]';
    box.textContent = 'Lỗi kết nối kiểm tra tên miền.';
  }
}

function renderVoiceSelection() {
  const container = document.getElementById('wizVoicesGrid');
  if (!container) return;

  const voices = state.voicesCatalog.length > 0 ? state.voicesCatalog : [
    { code: 'vi-VN-MinhQuan', name: 'MC Minh Quân', gender: 'Nam', region: 'Giọng Bắc (Hà Nội)', tone_specialty: 'Sôi nổi, Công nghệ', sample_text: 'Xin chào quý thính giả đang nghe Radio VN.' },
    { code: 'vi-VN-ThuHa', name: 'MC Thu Hà', gender: 'Nữ', region: 'Giọng Bắc (Hà Nội)', tone_specialty: 'Trang trọng, Tài chính', sample_text: 'Kính chào quý vị thính giả. Đây là bản tin tài chính.' },
    { code: 'vi-VN-TanPhat', name: 'MC Tấn Phát', gender: 'Nam', region: 'Giọng Nam (Sài Gòn)', tone_specialty: 'Vui vẻ, Thân thiện, Bác tài', sample_text: 'A lô a lô! Tấn Phát thân chào toàn thể anh em bác tài!' },
    { code: 'vi-VN-MaiPhuong', name: 'MC Mai Phương', gender: 'Nữ', region: 'Giọng Nam (Sài Gòn)', tone_specialty: 'Ngọt ngào, Nhẹ nhàng', sample_text: 'Mai Phương mến chào quý thính giả Radio VN.' }
  ];

  container.innerHTML = voices.map(v => {
    const isSelected = (state.wizard.voiceCode === v.code);
    return `
      <div class="voice-card border ${isSelected ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-900/80'} rounded-xl p-3 cursor-pointer active:scale-99 transition relative"
           data-code="${v.code}" data-name="${v.name} (${v.gender} - ${v.region})">
        
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg ${v.gender === 'Nam' ? 'bg-sky-500/20 text-sky-400' : 'bg-pink-500/20 text-pink-400'} flex items-center justify-center font-bold text-xs">
              <i data-lucide="mic" class="w-3.5 h-3.5"></i>
            </div>
            <div>
              <h4 class="text-xs font-bold text-white">${v.name}</h4>
              <p class="text-[9px] text-slate-400">${v.region}</p>
            </div>
          </div>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold border border-slate-700">
            ${v.tone_specialty}
          </span>
        </div>

        <button type="button" class="btn-preview-voice w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-[10px] font-bold flex items-center justify-center gap-1 transition"
                data-text="${v.sample_text}">
          <i data-lucide="volume-2" class="w-3 h-3"></i>
          <span>Nghe thử mẫu giọng</span>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  container.querySelectorAll('.voice-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-preview-voice')) return;
      state.wizard.voiceCode = card.dataset.code;
      state.wizard.voiceName = card.dataset.name;
      renderVoiceSelection();
    });
  });

  container.querySelectorAll('.btn-preview-voice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.text;
      audioEngine.playRadioJingle();
      setTimeout(() => audioEngine.speakText(text), 450);
    });
  });
}

async function triggerStep4EditorialPipeline() {
  const progressText = document.getElementById('pipelineProgressText');
  const previewBox = document.getElementById('wizScriptPreviewBox');
  const durEl = document.getElementById('wizEstimatedDuration');

  if (progressText) progressText.textContent = 'Đang chạy Pipeline AI Editorial...';
  if (previewBox) previewBox.innerHTML = '<span class="text-sky-400 animate-pulse">Đang kết nối RSS báo chí & sinh kịch bản MC...</span>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/editorial-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.wizard.channelName || 'Kênh Tin Tức Mới',
        prompt: state.wizard.prompt,
        topic: state.wizard.topic,
        tone: state.wizard.tone,
        voice_code: state.wizard.voiceCode,
        content_type: state.wizard.contentType,
        sources: state.wizard.sources
      })
    });

    if (!res.ok) throw new Error('Biên tập thất bại');
    const data = await res.json();
    state.wizard.previewData = data.preview;

    if (progressText) progressText.textContent = '✓ Pipeline hoàn tất 100%';
    if (durEl) durEl.textContent = data.preview.duration_formatted;

    const script = data.preview.full_script;
    const formatted = script.replace(/(\[SFX:[^\]]+\])/g, '<span class="sfx-badge px-1.5 py-0.5 rounded font-bold inline-block my-1">$1</span>');
    if (previewBox) previewBox.innerHTML = formatted;

  } catch (err) {
    console.error('triggerStep4EditorialPipeline error:', err);
    if (progressText) progressText.textContent = 'Lỗi pipeline';
    if (previewBox) previewBox.textContent = 'Không thể biên tập kịch bản lúc này.';
  }
}

async function submitCreateChannel() {
  const btn = document.getElementById('btnWizFinish');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Đang lên sóng...</span>';
  }

  try {
    const payload = {
      user_id: state.user ? state.user.id : 1,
      name: state.wizard.channelName || 'Kênh Tin Tức Cá Nhân Hóa',
      prompt: state.wizard.prompt || 'Tin tức tự động theo sở thích',
      topic: state.wizard.topic,
      tone: state.wizard.tone,
      content_type: state.wizard.contentType,
      sources: state.wizard.sources,
      broadcast_mode: state.wizard.broadcastMode,
      voice_code: state.wizard.voiceCode,
      voice_name: state.wizard.voiceName
    };

    const res = await fetch(`${API_BASE_URL}/api/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Không thể tạo kênh');
    const data = await res.json();

    showToast(`Đã tạo kênh '${data.channel.name}' thành công!`, 'success');
    closeWizardModal();

    await fetchChannels();
    loadChannelForPlayback(data.channel, true);
    openFullscreenPlayer();

  } catch (err) {
    console.error('submitCreateChannel error:', err);
    showToast('Lỗi khi lưu kênh phát thanh', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4"></i><span>Lên Sóng Live</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// =============================================================================
// USER PROFILE & AUTH (BOTTOM SHEET)
// =============================================================================
let authMode = 'login';

function openAuthSheet(mode = 'login') {
  setAuthMode(mode);
  const sheet = document.getElementById('mobileAuthSheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');
  setTimeout(() => sheet.classList.remove('opacity-0'), 10);
}

function closeAuthSheet() {
  const sheet = document.getElementById('mobileAuthSheet');
  if (!sheet) return;
  sheet.classList.add('opacity-0');
  setTimeout(() => sheet.classList.add('hidden'), 200);
}

function setAuthMode(mode) {
  authMode = mode;
  const tabLogin = document.getElementById('authTabLogin');
  const tabReg = document.getElementById('authTabRegister');
  const fieldName = document.getElementById('fieldFullName');
  const fieldEmail = document.getElementById('fieldEmail');
  const btnSubmit = document.getElementById('btnSubmitAuth');
  const alertEl = document.getElementById('authAlert');

  if (alertEl) alertEl.classList.add('hidden');

  if (mode === 'login') {
    tabLogin.className = 'flex-1 py-2.5 text-center text-sky-400 border-b-2 border-sky-500 bg-sky-500/5 font-bold';
    tabReg.className = 'flex-1 py-2.5 text-center text-slate-400 hover:text-slate-200';
    if (fieldName) fieldName.classList.add('hidden');
    if (fieldEmail) fieldEmail.classList.add('hidden');
    if (btnSubmit) btnSubmit.textContent = 'Đăng Nhập Ngay';
  } else {
    tabReg.className = 'flex-1 py-2.5 text-center text-sky-400 border-b-2 border-sky-500 bg-sky-500/5 font-bold';
    tabLogin.className = 'flex-1 py-2.5 text-center text-slate-400 hover:text-slate-200';
    if (fieldName) fieldName.classList.remove('hidden');
    if (fieldEmail) fieldEmail.classList.remove('hidden');
    if (btnSubmit) btnSubmit.textContent = 'Tạo Tài Khoản Mới';
  }
}

async function handleAuthSubmit() {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  const email = document.getElementById('authEmail').value.trim();
  const fullName = document.getElementById('authFullName').value.trim();
  const alertEl = document.getElementById('authAlert');

  if (!username || !password) {
    if (alertEl) {
      alertEl.textContent = 'Vui lòng điền tên đăng nhập và mật khẩu.';
      alertEl.classList.remove('hidden');
    }
    return;
  }

  try {
    let endpoint = (authMode === 'login') ? '/api/auth/login' : '/api/auth/register';
    let body = (authMode === 'login')
      ? { username, password }
      : { username, password, email: email || `${username}@radiovn.ai`, full_name: fullName || username };

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Thao tác không thành công');

    state.user = data.user;
    state.token = data.token;
    localStorage.setItem('radiovn_user', JSON.stringify(data.user));
    localStorage.setItem('radiovn_token', data.token);

    updateUserUI();
    closeAuthSheet();
    showToast(`Xin chào ${data.user.full_name || data.user.username}!`, 'success');
    fetchChannels();

  } catch (err) {
    if (alertEl) {
      alertEl.textContent = err.message;
      alertEl.classList.remove('hidden');
    }
  }
}

function handleLogout() {
  localStorage.removeItem('radiovn_user');
  localStorage.removeItem('radiovn_token');
  state.user = null;
  state.token = null;

  updateUserUI();
  showToast('Đã đăng xuất tài khoản Radio VN.', 'info');
  fetchChannels();
}

function updateUserUI() {
  const initialsEl = document.getElementById('userAvatarInitials');
  const greetingName = document.getElementById('greetingUserName');
  const profInitials = document.getElementById('profileAvatarInitials');
  const profName = document.getElementById('profileUserName');
  const profEmail = document.getElementById('profileUserEmail');
  const profBadge = document.getElementById('profileUserBadge');
  const authArea = document.getElementById('profileAuthActionArea');

  if (state.user) {
    const name = state.user.full_name || state.user.username;
    const initials = name.substring(0, 2).toUpperCase();

    if (initialsEl) initialsEl.textContent = initials;
    if (greetingName) greetingName.textContent = name;
    if (profInitials) profInitials.textContent = initials;
    if (profName) profName.textContent = name;
    if (profEmail) profEmail.textContent = state.user.email || `${state.user.username}@radiovn.ai`;
    if (profBadge) {
      profBadge.textContent = 'Thành Viên Đã Xác Thực';
      profBadge.className = 'inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30';
    }

    if (authArea) {
      authArea.innerHTML = `
        <button type="button" id="btnProfileLogout" class="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-98 transition">
          <i data-lucide="log-out" class="w-4 h-4"></i>
          <span>Đăng Xuất Khỏi Thiết Bị</span>
        </button>
      `;
      setTimeout(() => {
        document.getElementById('btnProfileLogout')?.addEventListener('click', handleLogout);
      }, 50);
    }
  } else {
    // Guest State
    if (initialsEl) initialsEl.innerHTML = '<i data-lucide="user" class="w-3.5 h-3.5"></i>';
    if (greetingName) greetingName.textContent = 'Khách';
    if (profInitials) profInitials.innerHTML = '<i data-lucide="user" class="w-5 h-5"></i>';
    if (profName) profName.textContent = 'Khách (Chưa đăng nhập)';
    if (profEmail) profEmail.textContent = 'Đăng nhập để đồng bộ & lưu kênh phát';
    if (profBadge) {
      profBadge.textContent = 'Chế Độ Khách';
      profBadge.className = 'inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
    }

    if (authArea) {
      authArea.innerHTML = `
        <div class="grid grid-cols-2 gap-2">
          <button type="button" id="btnProfileLogin" class="py-2 rounded-xl gradient-accent text-white font-bold text-xs text-center shadow-md active:scale-98">
            🔑 Đăng nhập
          </button>
          <button type="button" id="btnProfileRegister" class="py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs text-center active:scale-98">
            📝 Đăng ký
          </button>
        </div>
      `;
      setTimeout(() => {
        document.getElementById('btnProfileLogin')?.addEventListener('click', () => openAuthSheet('login'));
        document.getElementById('btnProfileRegister')?.addEventListener('click', () => openAuthSheet('register'));
      }, 50);
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

// =============================================================================
// DOM EVENT LISTENERS INITIALIZATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Đồng hồ & Canvas
  updateMobileClock();
  initCanvasVisualizer();
  updateUserUI();

  // Nạp dữ liệu
  fetchVoices();
  fetchChannels();

  // Bottom Nav items tab switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) switchTab(target);
    });
  });

  // Center (+) Navigation Button -> Open Wizard
  document.getElementById('btnNavCreate')?.addEventListener('click', () => openWizardModal());
  document.getElementById('btnHeroCreate')?.addEventListener('click', () => openWizardModal());
  document.getElementById('btnCreateMoreChannels')?.addEventListener('click', () => openWizardModal());
  document.getElementById('btnViewAllChannels')?.addEventListener('click', () => switchTab('screenMyChannels'));

  // Top Bar User Avatar -> Open Profile Bottom Sheet
  document.getElementById('btnOpenProfileSheet')?.addEventListener('click', () => {
    switchTab('screenProfile');
  });

  // Mini Player Click -> Expand to Fullscreen Player
  document.getElementById('miniPlayerClickArea')?.addEventListener('click', openFullscreenPlayer);
  document.getElementById('btnMiniExpand')?.addEventListener('click', openFullscreenPlayer);
  document.getElementById('btnMiniPlayPause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });

  // Fullscreen Player Controls
  document.getElementById('btnCloseFullPlayer')?.addEventListener('click', closeFullscreenPlayer);
  document.getElementById('btnFullPlayPause')?.addEventListener('click', togglePlayPause);
  document.getElementById('btnFullRewind')?.addEventListener('click', () => seekRelative(-10));
  document.getElementById('btnFullForward')?.addEventListener('click', () => seekRelative(10));

  document.getElementById('fullPlayerProgressBar')?.addEventListener('input', (e) => {
    const percent = parseFloat(e.target.value);
    state.currentTime = (percent / 100) * state.duration;
    updatePlayerTimeline();
  });

  // Speed Chips in Full Player
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => {
        b.className = 'speed-btn px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-bold text-slate-300';
      });
      btn.className = 'speed-btn active px-2 py-1 rounded-lg bg-sky-500 text-[10px] font-bold text-white';
      state.playbackSpeed = parseFloat(btn.dataset.speed);
      if (audioEngine.utterance) {
        audioEngine.utterance.rate = state.playbackSpeed;
      }
    });
  });

  document.getElementById('btnFullViewScript')?.addEventListener('click', () => {
    if (state.activeChannel) {
      openScriptSheetForChannel(state.activeChannel.id);
    }
  });

  document.getElementById('btnShareBroadcast')?.addEventListener('click', () => {
    if (navigator.share && state.activeChannel) {
      navigator.share({
        title: state.activeChannel.name,
        text: `Đang nghe bản tin Radio VN: ${state.activeChannel.name}`,
        url: window.location.href
      }).catch(() => {});
    } else {
      showToast('Đã sao chép link kênh phát thanh!', 'info');
    }
  });

  // Hero Quick Preset buttons
  document.querySelectorAll('.quick-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      const topic = btn.dataset.topic;
      const tone = btn.dataset.tone;
      openWizardModal({ prompt, topic, tone });
    });
  });

  // Wizard Sample prompt pills
  document.querySelectorAll('.sample-prompt-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const pInput = document.getElementById('wizPrompt');
      if (pInput) {
        pInput.value = pill.dataset.text;
        state.wizard.prompt = pill.dataset.text;
      }
    });
  });

  // Wizard Step Navigation
  document.getElementById('btnWizNext')?.addEventListener('click', () => {
    const step = state.wizard.currentStep;

    if (step === 1) {
      const name = document.getElementById('wizChannelName').value.trim();
      const prompt = document.getElementById('wizPrompt').value.trim();
      const topic = document.getElementById('wizTopic').value;
      const tone = document.getElementById('wizTone').value;
      const contentType = document.querySelector('input[name="wizContentType"]:checked')?.value || 'continuous';

      if (!name) {
        showToast('Vui lòng nhập tên cho kênh phát thanh', 'warning');
        return;
      }
      if (!prompt) {
        showToast('Vui lòng nhập Prompt yêu cầu', 'warning');
        return;
      }

      state.wizard.channelName = name;
      state.wizard.prompt = prompt;
      state.wizard.topic = topic;
      state.wizard.tone = tone;
      state.wizard.contentType = contentType;
    }

    if (step === 2) {
      if (state.wizard.sources.length === 0) {
        showToast('Vui lòng giữ ít nhất 1 nguồn báo', 'warning');
        return;
      }
    }

    if (step === 3) {
      const bMode = document.querySelector('input[name="wizBroadcastMode"]:checked')?.value || 'live';
      state.wizard.broadcastMode = bMode;
    }

    if (state.wizard.currentStep < 4) {
      state.wizard.currentStep += 1;
      updateWizardStepView();
    }
  });

  document.getElementById('btnWizPrev')?.addEventListener('click', () => {
    if (state.wizard.currentStep > 1) {
      state.wizard.currentStep -= 1;
      updateWizardStepView();
    }
  });

  document.getElementById('btnCloseWizard')?.addEventListener('click', closeWizardModal);
  document.getElementById('btnWizFinish')?.addEventListener('click', submitCreateChannel);
  document.getElementById('btnCheckWhitelist')?.addEventListener('click', checkCustomUrlWhitelist);

  // Script Sheet Close & Copy
  document.getElementById('btnCloseScriptSheet')?.addEventListener('click', closeScriptSheet);
  document.getElementById('btnCopyScriptSheet')?.addEventListener('click', () => {
    const text = document.getElementById('scriptSheetContent')?.innerText || '';
    if (text) {
      navigator.clipboard.writeText(text);
      showToast('Đã sao chép kịch bản phát thanh!', 'success');
    }
  });

  // Auth Sheet Controls
  document.getElementById('btnCloseAuthSheet')?.addEventListener('click', closeAuthSheet);
  document.getElementById('authTabLogin')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('authTabRegister')?.addEventListener('click', () => setAuthMode('register'));
  document.getElementById('btnSubmitAuth')?.addEventListener('click', handleAuthSubmit);
  document.getElementById('btnQuickDemoLogin')?.addEventListener('click', () => {
    document.getElementById('authUsername').value = 'demo_user';
    document.getElementById('authPassword').value = 'demo123';
    handleAuthSubmit();
  });

  // Filter Tabs on My Channels Screen
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => {
        t.className = 'filter-tab flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white text-center transition';
      });
      tab.className = 'filter-tab active flex-1 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-center transition';
      state.filter = tab.dataset.filter;
      renderChannelsList();
    });
  });

  document.getElementById('mobileSearchInput')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderChannelsList();
  });
});
