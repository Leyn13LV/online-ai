// Configuration
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const STORAGE_KEYS = {
    API_KEY: 'openrouter_api_key',
    SELECTED_MODEL: 'selected_model',
    CHAT_HISTORY: 'chat_history'
};

// State
let state = {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    selectedModel: localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL) || '',
    models: [],
    isLoading: false,
    chatHistory: JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]'),
    recognition: null,
    isRecording: false
};

// DOM Elements
const elements = {
    messagesContainer: document.getElementById('messages'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    voiceBtn: document.getElementById('voiceBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    apiKeyInput: document.getElementById('apiKey'),
    modelSelect: document.getElementById('modelSelect'),
    modelDisplay: document.getElementById('modelDisplay'),
    inputHint: document.getElementById('inputHint')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupVoiceRecognition();
    restoreSettings();
    displayChatHistory();
});

function setupEventListeners() {
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    elements.voiceBtn.addEventListener('click', toggleVoiceRecognition);
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.closeSettingsBtn.addEventListener('click', closeSettings);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettings();
    });
}

function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        elements.voiceBtn.disabled = true;
        elements.voiceBtn.title = 'Voice recognition not supported';
        return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.language = 'en-US';

    state.recognition.onstart = () => {
        state.isRecording = true;
        elements.voiceBtn.classList.add('recording');
        elements.inputHint.textContent = 'Listening...';
    };

    state.recognition.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i].transcript;
            if (event.results[i].isFinal) {
                elements.messageInput.value += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (interimTranscript) {
            elements.inputHint.textContent = `Interim: ${interimTranscript}`;
        }
    };

    state.recognition.onend = () => {
        state.isRecording = false;
        elements.voiceBtn.classList.remove('recording');
        elements.inputHint.textContent = '';
    };

    state.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        elements.inputHint.textContent = `Error: ${event.error}`;
    };
}

function toggleVoiceRecognition() {
    if (!state.recognition) return;
    
    if (state.isRecording) {
        state.recognition.stop();
    } else {
        elements.messageInput.value = '';
        state.recognition.start();
    }
}

function openSettings() {
    elements.apiKeyInput.value = state.apiKey;
    elements.settingsModal.classList.add('show');
    
    if (!state.models.length && state.apiKey) {
        fetchModels();
    }
}

function closeSettings() {
    elements.settingsModal.classList.remove('show');
}

async function saveSettings() {
    const apiKey = elements.apiKeyInput.value.trim();
    const selectedModel = elements.modelSelect.value;

    if (!apiKey) {
        alert('Please enter your OpenRouter API key');
        return;
    }

    state.apiKey = apiKey;
    state.selectedModel = selectedModel;

    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, selectedModel);

    updateModelDisplay();
    closeSettings();
    
    alert('Settings saved!');
}

function restoreSettings() {
    state.apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    state.selectedModel = localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL) || '';
    state.chatHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    updateModelDisplay();
}

function updateModelDisplay() {
    if (state.selectedModel) {
        const model = state.models.find(m => m.id === state.selectedModel);
        elements.modelDisplay.textContent = model ? model.name : 'Model selected';
    } else {
        elements.modelDisplay.textContent = 'No model selected';
    }
}

async function fetchModels() {
    if (!state.apiKey) {
        alert('Please enter your API key first');
        return;
    }

    try {
        elements.modelSelect.innerHTML = '<option value="">Loading models...</option>';
        
        const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        state.models = data.data || [];

        populateModelSelect();
    } catch (error) {
        console.error('Error fetching models:', error);
        elements.modelSelect.innerHTML = '<option value="">Error loading models</option>';
        alert(`Failed to load models: ${error.message}`);
    }
}

function populateModelSelect() {
    elements.modelSelect.innerHTML = '<option value="">Select a model...</option>';
    
    state.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} - $${(model.pricing?.prompt || 0) * 1000000}/1M tokens`;
        elements.modelSelect.appendChild(option);
    });

    if (state.selectedModel) {
        elements.modelSelect.value = state.selectedModel;
    }
}

async function sendMessage() {
    const message = elements.messageInput.value.trim();

    if (!message) return;
    if (!state.apiKey) {
        alert('Please enter your OpenRouter API key in settings');
        return;
    }
    if (!state.selectedModel) {
        alert('Please select a model in settings');
        return;
    }

    if (state.isLoading) return;

    // Add user message to UI
    addMessageToUI(message, 'user');
    elements.messageInput.value = '';
    state.isLoading = true;

    // Add to chat history
    state.chatHistory.push({ role: 'user', content: message });

    try {
        // Show loading indicator
        showLoadingIndicator();

        // Prepare messages for API
        const messages = state.chatHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // Call OpenRouter API
        const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey}`,
                'HTTP-Referer': window.location.href,
                'X-Title': 'Online AI iPad'
            },
            body: JSON.stringify({
                model: state.selectedModel,
                messages: messages,
                temperature: 0.7,
                top_p: 1,
                top_k: 0,
                frequency_penalty: 0,
                repetition_penalty: 1,
                min_p: 0
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        const aiMessage = data.choices[0]?.message?.content;

        if (!aiMessage) {
            throw new Error('No response from AI');
        }

        // Remove loading indicator and add AI message
        removeLoadingIndicator();
        addMessageToUI(aiMessage, 'ai');

        // Add to chat history
        state.chatHistory.push({ role: 'assistant', content: aiMessage });

        // Save chat history
        saveChatHistory();

    } catch (error) {
        console.error('Error:', error);
        removeLoadingIndicator();
        addMessageToUI(`Error: ${error.message}`, 'ai');
    } finally {
        state.isLoading = false;
    }
}

function addMessageToUI(content, role) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;

    messageEl.appendChild(contentEl);
    elements.messagesContainer.appendChild(messageEl);

    // Auto-scroll to bottom
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function showLoadingIndicator() {
    const messageEl = document.createElement('div');
    messageEl.className = 'message ai loading';
    messageEl.id = 'loadingMessage';

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';

    messageEl.appendChild(contentEl);
    elements.messagesContainer.appendChild(messageEl);

    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function removeLoadingIndicator() {
    const loadingMsg = document.getElementById('loadingMessage');
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

function displayChatHistory() {
    state.chatHistory.forEach(msg => {
        addMessageToUI(msg.content, msg.role === 'assistant' ? 'ai' : 'user');
    });
}

function saveChatHistory() {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(state.chatHistory));
}

// Optional: Add clear chat history function
function clearChatHistory() {
    if (confirm('Are you sure you want to clear the chat history?')) {
        state.chatHistory = [];
        elements.messagesContainer.innerHTML = '';
        localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
    }
}