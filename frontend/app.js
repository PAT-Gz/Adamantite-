/**
 * app.js - Xử lý toàn bộ logic giao diện, tương tác API, bộ phát sóng Audio Visualizer
 * và quy trình Wizard 4 bước của Radio VN.
 */

// Xác định API Base URL linh hoạt: nếu chạy qua backend server port 8000 thì dùng origin, nếu mở file:// thì dùng http://localhost:8000
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

  // Danh bạ giọng đọc AI
  voicesCatalog: []
};

// =============================================================================
// WEB AUDIO & SPEECH SYNTHESIS ENGINE (BỘ PHÁT THANH & TIẾNG HIỆU RADIO)
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

  /**
   * Phát tiếng nhạc hiệu (Jingle Chime) đặc trưng của đài phát thanh Radio VN bằng Web Audio API
   */
  playRadioJingle() {
    try {
      this.initAudioContext();
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Hợp âm Radio Chime 3 nốt: C5 -> E5 -> G5
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

  /**
   * Đọc kịch bản bằng Web Speech API
   */
  speakText(text, onEndCallback) {
    if (!this.speechSynth) return;
    this.speechSynth.cancel();

    // Loại bỏ các thẻ chỉ dẫn âm thanh [SFX: ...] khi đọc thoại
    const cleanedText = text
      .replace(/\[SFX:[^\]]+\]/g, ' ')
      .replace(/KÊNH:[^\n]+/g, ' ')
      .replace(/ĐÀI PHÁT THANH[^\n]+/g, ' ')
      .trim();

    this.utterance = new SpeechSynthesisUtterance(cleanedText);
    this.utterance.rate = state.playbackSpeed;
    this.utterance.volume = state.isMuted ? 0 : state.volume;

    // Tìm giọng đọc tiếng Việt nếu có
    const voices = this.speechSynth.getVoices();
    const vnVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
    if (vnVoice) {
      this.utterance.voice = vnVoice;
    } else {
      this.utterance.lang = 'vi-VN';
    }

    // Điều chỉnh cao độ tùy theo MC
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
// CANVAS AUDIO VISUALIZER (SÓNG ÂM THANH TRỰC TIẾP)
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

    const barCount = 22;
    const barWidth = 3;
    const gap = (width - barCount * barWidth) / (barCount - 1);

    for (let i = 0; i < barCount; i++) {
      let barHeight;
      if (state.isPlaying) {
        // Tạo nhịp sóng âm thanh động học khi phát thanh
        const wave1 = Math.sin(phase + i * 0.35);
        const wave2 = Math.cos(phase * 1.5 + i * 0.2);
        const intensity = Math.abs(wave1 * wave2);
        barHeight = Math.max(4, intensity * (height - 4));
      } else {
        // Khi dừng thì sóng phẳng nhẹ
        barHeight = 4;
      }

      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      // Gradient màu neon chuyển từ Cyan sang Indigo
      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#6366f1');

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
  const borderColors = {
    info: 'border-sky-500 bg-slate-900 text-sky-300',
    success: 'border-emerald-500 bg-slate-900 text-emerald-300',
    warning: 'border-amber-500 bg-slate-900 text-amber-300',
    error: 'border-rose-500 bg-slate-900 text-rose-300'
  };

  const icons = {
    info: 'info',
    success: 'check-circle-2',
    warning: 'alert-triangle',
    error: 'alert-circle'
  };

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold animate-slide-in pointer-events-auto transition-all duration-300 ${borderColors[type] || borderColors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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

    // Cập nhật tổng số kênh
    const countEl = document.getElementById('totalChannelsCount');
    if (countEl) countEl.textContent = state.channels.length;

    // Nếu chưa chọn kênh phát, chọn kênh đầu tiên làm mặc định
    if (!state.activeChannel && state.channels.length > 0) {
      loadChannelForPlayback(state.channels[0], false);
    }
  } catch (err) {
    console.error('fetchChannels error:', err);
    showToast('Lỗi kết nối tới máy chủ Backend Radio VN', 'error');
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
    showToast('Không tải được bản tin phát thanh của kênh này', 'error');
  }
}

async function refreshChannelBroadcast(channelId) {
  showToast('Đang cào tin tức mới & biên tập bản tin live...', 'info');
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
  if (!confirm('Bạn có chắc chắn muốn xóa kênh phát thanh này không?')) return;

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
// AUDIO PLAYER CONTROLS & TIMERS
// =============================================================================
function startPlayback() {
  if (!state.activeChannel || !state.activeBroadcast) {
    showToast('Vui lòng chọn 1 kênh phát thanh để nghe', 'warning');
    return;
  }

  state.isPlaying = true;
  audioEngine.playRadioJingle();

  // Đọc kịch bản phát thanh bằng AI Voice
  setTimeout(() => {
    audioEngine.speakText(state.activeBroadcast.script_text, () => {
      // Khi đọc xong: Nếu là Live 24/7 thì lặp lại hoặc làm mới, nếu podcast thì dừng
      if (state.activeChannel.broadcast_mode === 'live') {
        state.currentTime = 0;
        startPlayback();
      } else {
        pausePlayback();
      }
    });
  }, 600);

  // Bộ đếm thời gian phát thanh
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
  const currEl = document.getElementById('playerCurrentTime');
  const durEl = document.getElementById('playerDuration');
  const progressEl = document.getElementById('playerProgressBar');

  if (currEl) currEl.textContent = formatTime(state.currentTime);
  if (durEl) durEl.textContent = formatTime(state.duration);
  if (progressEl) {
    const percent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    progressEl.value = percent;
  }
}

function updatePlayerUI() {
  const titleEl = document.getElementById('playerChannelTitle');
  const headlineEl = document.getElementById('playerHeadline');
  const badgeEl = document.getElementById('playerBadge');
  const voiceBadgeEl = document.getElementById('playerVoiceBadge');
  const playIcon = document.getElementById('playIcon');
  const liveDot = document.getElementById('playerLiveDot');

  if (!state.activeChannel) {
    if (titleEl) titleEl.textContent = 'Chưa chọn kênh phát';
    if (headlineEl) headlineEl.textContent = 'Hãy chọn 1 kênh bên trên để bắt đầu nghe';
    if (badgeEl) badgeEl.textContent = 'OFFLINE';
    return;
  }

  if (titleEl) titleEl.textContent = state.activeChannel.name;

  if (headlineEl) {
    if (state.activeBroadcast && state.activeBroadcast.headlines && state.activeBroadcast.headlines.length > 0) {
      headlineEl.textContent = `Tiêu điểm: ${state.activeBroadcast.headlines[0].title}`;
    } else {
      headlineEl.textContent = state.activeChannel.prompt;
    }
  }

  if (badgeEl) {
    if (state.activeChannel.broadcast_mode === 'live') {
      badgeEl.textContent = '🔴 LIVE 24/7';
      badgeEl.className = 'text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30';
      if (liveDot) liveDot.classList.remove('hidden');
    } else {
      badgeEl.textContent = '🎙️ PODCAST';
      badgeEl.className = 'text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30';
      if (liveDot) liveDot.classList.add('hidden');
    }
  }

  if (voiceBadgeEl) {
    voiceBadgeEl.innerHTML = `<i data-lucide="mic" class="w-3 h-3"></i><span>${state.activeChannel.voice_name}</span>`;
  }

  // Play/Pause icon
  if (playIcon) {
    if (state.isPlaying) {
      playIcon.setAttribute('data-lucide', 'pause');
      playIcon.classList.remove('ml-0.5');
    } else {
      playIcon.setAttribute('data-lucide', 'play');
      playIcon.classList.add('ml-0.5');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  updatePlayerTimeline();
}

// =============================================================================
// RENDERING CHANNELS GRID
// =============================================================================
function renderChannelsList() {
  const grid = document.getElementById('channelsGrid');
  const emptyState = document.getElementById('channelsEmptyState');
  if (!grid) return;

  // Lọc kênh theo tab và ô tìm kiếm
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

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  const topicColors = {
    'cong-nghe': { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', label: 'Công Nghệ' },
    'giao-thong': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Giao Thông' },
    'kinh-doanh': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Tài Chính' },
    'the-thao': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', label: 'Thể Thao' },
    'tong-hop': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', label: 'Tổng Hợp' }
  };

  grid.innerHTML = filtered.map(ch => {
    const isCurrentActive = state.activeChannel && state.activeChannel.id === ch.id;
    const isThisPlaying = isCurrentActive && state.isPlaying;
    const tColor = topicColors[ch.topic] || topicColors['cong-nghe'];

    const sourcesBadges = (ch.sources || []).slice(0, 3).map(s => {
      const sName = typeof s === 'string' ? s : (s.name || 'Báo chính thống');
      return `<span class="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300 border border-slate-700">${sName}</span>`;
    }).join('');

    return `
      <div class="glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group ${isCurrentActive ? 'border-sky-500/60 shadow-lg shadow-sky-500/10' : ''}">
        
        <!-- Equalizer indicator on card when playing -->
        ${isThisPlaying ? `
          <div class="absolute top-4 right-4 flex items-end gap-1 h-5 px-2 py-1 rounded-full bg-sky-500/20 border border-sky-500/30">
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
          </div>
        ` : ''}

        <div>
          <!-- Header tags -->
          <div class="flex items-center gap-2 mb-3 pr-12">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tColor.bg} ${tColor.text} ${tColor.border}">
              ${tColor.label}
            </span>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
              ${ch.tone}
            </span>
            ${ch.broadcast_mode === 'live' ? `
              <span class="text-[10px] font-bold text-red-400 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                24/7
              </span>
            ` : `
              <span class="text-[10px] font-bold text-purple-400">Podcast</span>
            `}
          </div>

          <!-- Channel Title -->
          <h3 class="text-base font-bold text-white mb-1.5 group-hover:text-sky-300 transition line-clamp-1">
            ${ch.name}
          </h3>

          <!-- Prompt description -->
          <p class="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
            ${ch.prompt}
          </p>

          <!-- Sources tags -->
          <div class="flex flex-wrap items-center gap-1.5 mb-4">
            <span class="text-[10px] text-slate-500 font-medium">Nguồn:</span>
            ${sourcesBadges}
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs text-slate-400">
            <i data-lucide="mic" class="w-3.5 h-3.5 text-sky-400"></i>
            <span class="truncate max-w-[110px] text-[11px]">${ch.voice_name.split('(')[0]}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <button class="btn-refresh-channel p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition" title="Làm mới bản tin Live" data-id="${ch.id}">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-view-script p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition" title="Xem kịch bản" data-id="${ch.id}">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-delete-channel p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition" title="Xóa kênh" data-id="${ch.id}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-play-channel px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${isThisPlaying ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25' : 'bg-slate-800 hover:bg-sky-600 text-white'}" data-id="${ch.id}">
              <i data-lucide="${isThisPlaying ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
              <span>${isThisPlaying ? 'Tạm Dừng' : 'Phát Kênh'}</span>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Gắn sự kiện cho các nút hành động trên thẻ
  grid.querySelectorAll('.btn-play-channel').forEach(btn => {
    btn.addEventListener('click', () => {
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

  grid.querySelectorAll('.btn-refresh-channel').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      refreshChannelBroadcast(id);
    });
  });

  grid.querySelectorAll('.btn-view-script').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      openScriptModalForChannel(id);
    });
  });

  grid.querySelectorAll('.btn-delete-channel').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      deleteChannel(id);
    });
  });
}

// =============================================================================
// MODAL XEM KỊCH BẢN PHÁT THANH
// =============================================================================
async function openScriptModalForChannel(channelId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}`);
    if (!res.ok) throw new Error('Không thể tải kịch bản');
    const data = await res.json();

    const titleEl = document.getElementById('scriptModalTitle');
    const subEl = document.getElementById('scriptModalSubtitle');
    const contentEl = document.getElementById('scriptModalContent');
    const modal = document.getElementById('scriptModal');

    if (titleEl) titleEl.textContent = `Kịch Bản: ${data.channel.name}`;
    if (subEl) subEl.textContent = `Giọng đọc: ${data.channel.voice_name} • Phong cách: ${data.channel.tone}`;

    const scriptText = data.latest_broadcast ? data.latest_broadcast.script_text : 'Chưa có kịch bản cho số phát sóng này.';
    
    // Tô sáng các thẻ SFX để thính giả thấy trực quan các điểm nhạc hiệu & hiệu ứng
    const formatted = scriptText.replace(/(\[SFX:[^\]]+\])/g, '<span class="sfx-badge px-2 py-0.5 rounded font-bold inline-block my-1">$1</span>');
    if (contentEl) contentEl.innerHTML = formatted;

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
  } catch (e) {
    showToast('Lỗi khi mở kịch bản phát thanh', 'error');
  }
}

function closeScriptModal() {
  const modal = document.getElementById('scriptModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

// =============================================================================
// WIZARD 4 BƯỚC: KHỞI TẠO KÊNH BẰNG PROMPT
// =============================================================================
function openWizardModal(preset = null) {
  state.wizard.currentStep = 1;

  if (preset) {
    if (preset.prompt) state.wizard.prompt = preset.prompt;
    if (preset.topic) state.wizard.topic = preset.topic;
    if (preset.tone) state.wizard.tone = preset.tone;
    state.wizard.channelName = preset.prompt.slice(0, 35) + '...';
  } else {
    state.wizard.prompt = '';
    state.wizard.channelName = '';
  }

  // Cập nhật giá trị vào form Step 1
  const nameInput = document.getElementById('wizChannelName');
  const promptInput = document.getElementById('wizPrompt');
  const topicSelect = document.getElementById('wizTopic');
  const toneSelect = document.getElementById('wizTone');

  if (nameInput) nameInput.value = state.wizard.channelName;
  if (promptInput) promptInput.value = state.wizard.prompt;
  if (topicSelect) topicSelect.value = state.wizard.topic;
  if (toneSelect) toneSelect.value = state.wizard.tone;

  // Xóa kết quả kiểm tra Whitelist cũ
  const wlBox = document.getElementById('whitelistResultBox');
  if (wlBox) wlBox.classList.add('hidden');

  updateWizardStepView();

  const modal = document.getElementById('wizardModal');
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeWizardModal() {
  const modal = document.getElementById('wizardModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

function updateWizardStepView() {
  const step = state.wizard.currentStep;

  // Ẩn tất cả các bước
  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById(`wizardStep${s}`);
    if (el) {
      if (s === step) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  // Cập nhật thanh Step Indicator
  document.querySelectorAll('.step-nav-item').forEach(item => {
    const s = parseInt(item.dataset.step);
    const badge = item.querySelector('.step-badge');
    const label = item.querySelector('span:last-child');

    if (s < step) {
      badge.className = 'step-badge w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold';
      badge.innerHTML = '✓';
      if (label) label.className = 'text-emerald-400 font-semibold hidden sm:inline';
    } else if (s === step) {
      badge.className = 'step-badge w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-sky-500/40';
      badge.textContent = s;
      if (label) label.className = 'text-sky-400 font-bold hidden sm:inline';
    } else {
      badge.className = 'step-badge w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs';
      badge.textContent = s;
      if (label) label.className = 'text-slate-500 hidden sm:inline';
    }
  });

  // Cập nhật đường nối giữa các bước
  for (let i = 1; i <= 3; i++) {
    const line = document.getElementById(`line-${i}`);
    if (line) {
      if (step > i) line.classList.add('active');
      else line.classList.remove('active');
    }
  }

  // Cập nhật nút Prev/Next/Finish
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

  // Hành động kích hoạt theo từng bước
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

  container.innerHTML = '<div class="text-xs text-slate-400 col-span-2 py-4 text-center">Đang lọc danh sách báo chính thống...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/sources/suggest?topic=${state.wizard.topic}`);
    if (!res.ok) throw new Error('Không lấy được nguồn');
    const data = await res.json();
    const sources = data.sources || [];

    // Mặc định chọn các nguồn active
    state.wizard.sources = sources.filter(s => s.active).map(s => s.name);

    container.innerHTML = sources.map(s => {
      const isChecked = state.wizard.sources.includes(s.name);
      return `
        <label class="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 hover:border-sky-500/40 cursor-pointer transition">
          <div class="flex items-center gap-2.5">
            <input type="checkbox" class="source-checkbox w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-600 focus:ring-0"
                   value="${s.name}" ${isChecked ? 'checked' : ''} />
            <div>
              <div class="text-xs font-bold text-white">${s.name}</div>
              <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span class="text-emerald-400 font-semibold">✓ ${s.whitelist_info ? s.whitelist_info.badge_text : 'Chính thống'}</span>
                <span>• ${s.domain}</span>
              </div>
            </div>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">Đã duyệt</span>
        </label>
      `;
    }).join('');

    // Bắt sự kiện check/uncheck
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
    container.innerHTML = '<div class="text-xs text-rose-400 col-span-2 py-2">Không thể tải danh sách nguồn. Bạn có thể tự thêm URL bên dưới.</div>';
  }
}

async function checkCustomUrlWhitelist() {
  const input = document.getElementById('wizCustomUrl');
  const box = document.getElementById('whitelistResultBox');
  if (!input || !box) return;

  const url = input.value.trim();
  if (!url) {
    showToast('Vui lòng nhập đường dẫn URL hoặc tên miền báo chí', 'warning');
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = '<div class="text-xs text-slate-400 flex items-center gap-2"><i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Đang đối soát với Whitelist báo chí Việt Nam...</div>';
  if (window.lucide) window.lucide.createIcons();

  try {
    const res = await fetch(`${API_BASE_URL}/api/sources/check-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.is_whitelisted) {
      box.className = 'p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs space-y-2';
      box.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-emerald-400">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
            <span>${data.badge_text} (${data.domain})</span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">${data.tier || 'Uy tín'}</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">${data.message}</p>
        <button type="button" id="btnAddVerifiedSource" class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Thêm ${data.source_name} vào danh sách nguồn kênh</span>
        </button>
      `;

      setTimeout(() => {
        const addBtn = document.getElementById('btnAddVerifiedSource');
        if (addBtn) {
          addBtn.addEventListener('click', () => {
            if (!state.wizard.sources.includes(data.source_name)) {
              state.wizard.sources.push(data.source_name);
              showToast(`Đã thêm nguồn ${data.source_name} vào kênh!`, 'success');
              loadSuggestedSourcesForStep2();
            } else {
              showToast('Nguồn này đã có trong danh sách', 'info');
            }
          });
        }
      }, 50);

    } else {
      box.className = 'p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs space-y-1.5';
      box.innerHTML = `
        <div class="flex items-center gap-2 font-bold text-amber-400">
          <i data-lucide="alert-triangle" class="w-4 h-4"></i>
          <span>${data.badge_text} (${data.domain || 'Ngoại lai'})</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">${data.message}</p>
      `;
    }

    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('checkCustomUrlWhitelist error:', err);
    box.className = 'p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-xs';
    box.textContent = 'Lỗi kết nối kiểm tra tên miền. Vui lòng thử lại.';
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
      <div class="voice-card border ${isSelected ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-900/80'} rounded-xl p-3.5 cursor-pointer hover:border-sky-500/50 transition relative"
           data-code="${v.code}" data-name="${v.name} (${v.gender} - ${v.region})">
        
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg ${v.gender === 'Nam' ? 'bg-sky-500/20 text-sky-400' : 'bg-pink-500/20 text-pink-400'} flex items-center justify-center font-bold text-xs">
              <i data-lucide="mic" class="w-4 h-4"></i>
            </div>
            <div>
              <h4 class="text-xs font-bold text-white">${v.name}</h4>
              <p class="text-[10px] text-slate-400">${v.region}</p>
            </div>
          </div>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            ${v.tone_specialty}
          </span>
        </div>

        <p class="text-[11px] text-slate-400 mb-3 italic">"${v.description || v.sample_text}"</p>

        <button type="button" class="btn-preview-voice w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                data-text="${v.sample_text}" data-gender="${v.gender}">
          <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
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
      const gender = btn.dataset.gender;
      audioEngine.playRadioJingle();
      setTimeout(() => {
        audioEngine.speakText(text);
      }, 500);
    });
  });
}

async function triggerStep4EditorialPipeline() {
  const progressText = document.getElementById('pipelineProgressText');
  const previewBox = document.getElementById('wizScriptPreviewBox');
  const durEl = document.getElementById('wizEstimatedDuration');
  const countEl = document.getElementById('wizHeadlinesCount');

  if (progressText) progressText.textContent = 'Đang chạy Pipeline AI Editorial...';
  if (previewBox) previewBox.innerHTML = '<span class="text-sky-400 animate-pulse">Đang kết nối RSS báo chí chính thống & tạo kịch bản phát thanh MC...</span>';

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
    if (countEl) countEl.textContent = data.preview.headlines_count;

    // Hiển thị kịch bản với SFX badge
    const script = data.preview.full_script;
    const formatted = script.replace(/(\[SFX:[^\]]+\])/g, '<span class="sfx-badge px-2 py-0.5 rounded font-bold inline-block my-1">$1</span>');
    if (previewBox) previewBox.innerHTML = formatted;

  } catch (err) {
    console.error('triggerStep4EditorialPipeline error:', err);
    if (progressText) progressText.textContent = 'Lỗi chạy pipeline';
    if (previewBox) previewBox.textContent = 'Không thể biên tập kịch bản lúc này. Vui lòng thử lại.';
  }
}

async function submitCreateChannel() {
  const btn = document.getElementById('btnWizFinish');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Đang tạo kênh & lên sóng...</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  try {
    const payload = {
      user_id: state.user.id,
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

    showToast(`Đã tạo kênh '${data.channel.name}' thành công! Bắt đầu phát sóng.`, 'success');
    closeWizardModal();

    // Làm mới danh sách kênh và phát ngay kênh mới tạo
    await fetchChannels();
    loadChannelForPlayback(data.channel, true);

  } catch (err) {
    console.error('submitCreateChannel error:', err);
    showToast('Lỗi khi lưu kênh phát thanh', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4"></i><span>Lưu & Bắt Đầu Nghe Live</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// =============================================================================
// AUTHENTICATION (ĐĂNG NHẬP / ĐĂNG KÝ)
// =============================================================================
let authMode = 'login'; // 'login' | 'register'

function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  setAuthMode('login');
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
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
    tabLogin.className = 'flex-1 py-3 text-center text-sky-400 border-b-2 border-sky-500 bg-sky-500/5 font-bold transition';
    tabReg.className = 'flex-1 py-3 text-center text-slate-400 hover:text-slate-200 font-medium transition';
    if (fieldName) fieldName.classList.add('hidden');
    if (fieldEmail) fieldEmail.classList.add('hidden');
    if (btnSubmit) btnSubmit.textContent = 'Đăng Nhập Ngay';
  } else {
    tabReg.className = 'flex-1 py-3 text-center text-sky-400 border-b-2 border-sky-500 bg-sky-500/5 font-bold transition';
    tabLogin.className = 'flex-1 py-3 text-center text-slate-400 hover:text-slate-200 font-medium transition';
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
      alertEl.textContent = 'Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.';
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
    if (!res.ok) {
      throw new Error(data.detail || 'Thao tác không thành công');
    }

    // Lưu phiên đăng nhập
    state.user = data.user;
    state.token = data.token;
    localStorage.setItem('radiovn_user', JSON.stringify(data.user));
    localStorage.setItem('radiovn_token', data.token);

    updateUserMenuUI();
    closeAuthModal();
    showToast(`Xin chào ${data.user.full_name || data.user.username}!`, 'success');

    // Tải lại các kênh của người dùng
    fetchChannels();

  } catch (err) {
    if (alertEl) {
      alertEl.textContent = err.message;
      alertEl.classList.remove('hidden');
    }
  }
}

// =============================================================================
// FACEBOOK-STYLE USER PROFILE & AUTH DROPDOWN
// =============================================================================
let isUserDropdownOpen = false;

function toggleUserDropdown(forceState) {
  const menu = document.getElementById('userDropdownMenu');
  const chevron = document.getElementById('userChevron');
  const btn = document.getElementById('btnUserMenu');
  if (!menu) return;

  if (typeof forceState === 'boolean') {
    isUserDropdownOpen = forceState;
  } else {
    isUserDropdownOpen = !isUserDropdownOpen;
  }

  if (isUserDropdownOpen) {
    menu.classList.remove('hidden');
    void menu.offsetWidth; // Force reflow
    menu.classList.remove('opacity-0', 'translate-y-2');
    menu.classList.add('opacity-100', 'translate-y-0');
    if (chevron) chevron.classList.add('rotate-180');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.remove('opacity-100', 'translate-y-0');
    menu.classList.add('opacity-0', 'translate-y-2');
    if (chevron) chevron.classList.remove('rotate-180');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      if (!isUserDropdownOpen) {
        menu.classList.add('hidden');
      }
    }, 200);
  }
}

function closeUserDropdown() {
  if (isUserDropdownOpen) {
    toggleUserDropdown(false);
  }
}

function updateUserMenuUI() {
  const avatarInitials = document.getElementById('userAvatarInitials');
  const onlineDot = document.getElementById('userOnlineDot');
  const dropdownAvatar = document.getElementById('dropdownAvatarInitials');
  const dropdownName = document.getElementById('dropdownUserName');
  const dropdownEmail = document.getElementById('dropdownUserEmail');
  const dropdownBadge = document.getElementById('dropdownUserBadge');
  const loggedInSection = document.getElementById('dropdownLoggedInSection');
  const guestSection = document.getElementById('dropdownGuestSection');

  if (state.user) {
    const displayName = state.user.full_name || state.user.username;
    const initials = displayName.substring(0, 2).toUpperCase();

    if (avatarInitials) avatarInitials.textContent = initials;
    if (dropdownAvatar) dropdownAvatar.textContent = initials;
    if (onlineDot) {
      onlineDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-[#070b14]';
    }
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = state.user.email || `${state.user.username}@radiovn.ai`;
    if (dropdownBadge) {
      dropdownBadge.textContent = 'Thành Viên Đã Xác Thực';
      dropdownBadge.className = 'inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30';
    }

    if (loggedInSection) loggedInSection.classList.remove('hidden');
    if (guestSection) guestSection.classList.add('hidden');
  } else {
    // Guest state
    if (avatarInitials) avatarInitials.innerHTML = '<i data-lucide="user" class="w-4 h-4"></i>';
    if (dropdownAvatar) dropdownAvatar.innerHTML = '<i data-lucide="user" class="w-5 h-5 text-slate-300"></i>';
    if (onlineDot) {
      onlineDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-500 rounded-full ring-2 ring-[#070b14]';
    }
    if (dropdownName) dropdownName.textContent = 'Khách (Chưa đăng nhập)';
    if (dropdownEmail) dropdownEmail.textContent = 'Đăng nhập để lưu & cá nhân hóa kênh';
    if (dropdownBadge) {
      dropdownBadge.textContent = 'Chế Độ Khách';
      dropdownBadge.className = 'inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30';
    }

    if (loggedInSection) loggedInSection.classList.add('hidden');
    if (guestSection) guestSection.classList.remove('hidden');
  }

  if (window.lucide) window.lucide.createIcons();
}

function handleLogout() {
  localStorage.removeItem('radiovn_user');
  localStorage.removeItem('radiovn_token');
  state.user = null;
  state.token = null;

  closeUserDropdown();
  updateUserMenuUI();
  showToast('Đã đăng xuất khỏi tài khoản Radio VN.', 'info');
  fetchChannels();
}

// =============================================================================
// DOM EVENT LISTENERS INITIALIZATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Khởi tạo visualizer
  initCanvasVisualizer();

  // Cập nhật giao diện người dùng
  updateUserMenuUI();

  // Lấy dữ liệu ban đầu
  fetchVoices();
  fetchChannels();

  // Header buttons
  document.getElementById('btnOpenWizard')?.addEventListener('click', () => openWizardModal());
  document.getElementById('btnCloseWizard')?.addEventListener('click', () => closeWizardModal());
  document.getElementById('btnEmptyCreate')?.addEventListener('click', () => openWizardModal());

  // Facebook-Style User Dropdown Toggle
  const btnUserMenu = document.getElementById('btnUserMenu');
  btnUserMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUserDropdown();
  });

  // Click Outside to close Dropdown
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('userMenuWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeUserDropdown();
    }
  });

  // ESC key to close Dropdown
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUserDropdown();
    }
  });

  // Dropdown Action Buttons (Logged In)
  document.getElementById('menuBtnMyChannels')?.addEventListener('click', () => {
    closeUserDropdown();
    // Chuyển sang xem danh sách kênh
    const grid = document.getElementById('channelsGrid');
    if (grid) {
      grid.scrollIntoView({ behavior: 'smooth' });
    }
    showToast('Đang hiển thị danh sách kênh của bạn', 'info');
  });

  document.getElementById('menuBtnSettings')?.addEventListener('click', () => {
    closeUserDropdown();
    showToast('Cài đặt & Tùy chọn: Tính năng cấu hình nâng cao đang sẵn sàng!', 'info');
  });

  document.getElementById('menuBtnTheme')?.addEventListener('click', () => {
    closeUserDropdown();
    showToast('Chế độ tối (Dark Mode) chuẩn phòng thu đang được kích hoạt tối ưu!', 'info');
  });

  document.getElementById('menuBtnLogout')?.addEventListener('click', () => {
    handleLogout();
  });

  // Dropdown Action Buttons (Guest)
  document.getElementById('menuBtnLogin')?.addEventListener('click', () => {
    closeUserDropdown();
    setAuthMode('login');
    openAuthModal();
  });

  document.getElementById('menuBtnRegister')?.addEventListener('click', () => {
    closeUserDropdown();
    setAuthMode('register');
    openAuthModal();
  });

  document.getElementById('menuBtnQuickDemo')?.addEventListener('click', () => {
    closeUserDropdown();
    document.getElementById('authUsername').value = 'demo_user';
    document.getElementById('authPassword').value = 'demo123';
    setAuthMode('login');
    openAuthModal();
    handleAuthSubmit();
  });

  // Auth modal controls
  document.getElementById('btnCloseAuthModal')?.addEventListener('click', () => closeAuthModal());
  document.getElementById('authTabLogin')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('authTabRegister')?.addEventListener('click', () => setAuthMode('register'));
  document.getElementById('btnSubmitAuth')?.addEventListener('click', handleAuthSubmit);

  // Quick Demo Login in Auth Modal
  document.getElementById('btnQuickDemoLogin')?.addEventListener('click', () => {
    document.getElementById('authUsername').value = 'demo_user';
    document.getElementById('authPassword').value = 'demo123';
    handleAuthSubmit();
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => {
        t.className = 'filter-tab px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
      });
      tab.className = 'filter-tab px-3.5 py-1.5 rounded-lg bg-sky-500 text-white font-semibold transition';
      state.filter = tab.dataset.filter;
      renderChannelsList();
    });
  });

  // Search input
  document.getElementById('channelSearchInput')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderChannelsList();
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

  // Wizard Step 1 Sample prompt pills
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

    // Validate Step 1
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

    // Validate Step 2
    if (step === 2) {
      if (state.wizard.sources.length === 0) {
        showToast('Vui lòng giữ ít nhất 1 nguồn báo chí chính thống', 'warning');
        return;
      }
    }

    // Validate Step 3
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

  document.getElementById('btnWizFinish')?.addEventListener('click', submitCreateChannel);

  // Whitelist verification button in Step 2
  document.getElementById('btnCheckWhitelist')?.addEventListener('click', checkCustomUrlWhitelist);

  // Sticky Player Controls
  document.getElementById('btnPlayPause')?.addEventListener('click', togglePlayPause);
  document.getElementById('btnRewind')?.addEventListener('click', () => seekRelative(-10));
  document.getElementById('btnForward')?.addEventListener('click', () => seekRelative(10));

  // Progress Bar Seek
  document.getElementById('playerProgressBar')?.addEventListener('input', (e) => {
    const percent = parseFloat(e.target.value);
    state.currentTime = (percent / 100) * state.duration;
    updatePlayerTimeline();
  });

  // Playback Speed
  document.getElementById('playerSpeedSelect')?.addEventListener('change', (e) => {
    state.playbackSpeed = parseFloat(e.target.value);
    if (audioEngine.utterance) {
      audioEngine.utterance.rate = state.playbackSpeed;
    }
  });

  // Volume Slider
  document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
    state.volume = parseFloat(e.target.value);
    state.isMuted = (state.volume === 0);
    if (audioEngine.utterance) {
      audioEngine.utterance.volume = state.volume;
    }
    const volIcon = document.getElementById('volumeIcon');
    if (volIcon) {
      volIcon.setAttribute('data-lucide', state.isMuted ? 'volume-x' : 'volume-2');
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // Mute button
  document.getElementById('btnMuteToggle')?.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    const volSlider = document.getElementById('volumeSlider');
    const volIcon = document.getElementById('volumeIcon');

    if (state.isMuted) {
      if (volSlider) volSlider.value = 0;
      if (volIcon) volIcon.setAttribute('data-lucide', 'volume-x');
    } else {
      if (volSlider) volSlider.value = state.volume || 0.8;
      if (volIcon) volIcon.setAttribute('data-lucide', 'volume-2');
    }
    if (window.lucide) window.lucide.createIcons();
  });

  // Open Current Script Modal
  document.getElementById('btnOpenCurrentScript')?.addEventListener('click', () => {
    if (state.activeChannel) {
      openScriptModalForChannel(state.activeChannel.id);
    } else {
      showToast('Chưa có kênh nào đang phát', 'info');
    }
  });

  document.getElementById('btnCloseScriptModal')?.addEventListener('click', closeScriptModal);

  // Copy Script Button
  document.getElementById('btnCopyScript')?.addEventListener('click', () => {
    const text = document.getElementById('scriptModalContent')?.innerText || '';
    if (text) {
      navigator.clipboard.writeText(text);
      showToast('Đã sao chép kịch bản phát thanh vào bộ nhớ tạm!', 'success');
    }
  });
});
