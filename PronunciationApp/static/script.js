const recordButton = document.getElementById('record-btn');
const speakButton = document.getElementById('speak-btn');
const recordStatus = document.getElementById('record-status');
const wordInput = document.getElementById('word-input');
const progressBarFill = document.querySelector('.progress-fill');
const accuracyScore = document.getElementById('accuracy-score');
const feedbackMessage = document.getElementById('feedback-message');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Initialize speech synthesis
const speechSynthesis = window.speechSynthesis;

// Request microphone access and set up MediaRecorder
navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();

            reader.onload = async () => {
                const base64Audio = reader.result.split(',')[1];
                await analyzeAudio(base64Audio, wordInput.value);
            };

            reader.readAsDataURL(audioBlob);
        };
    })
    .catch(err => {
        console.error('Microphone access error:', err);
        recordStatus.textContent = 'Error: Microphone access denied';
    });

// Text-to-speech function
function speakText(text) {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    if (text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9; // Slightly slower for better pronunciation clarity
        utterance.pitch = 1.0;
        speechSynthesis.speak(utterance);
        recordStatus.textContent = 'Listen to the correct pronunciation...';

        utterance.onend = () => {
            recordStatus.textContent = 'Ready to record your pronunciation';
        };
    }
}

// Add event listener for the speak button
speakButton.addEventListener('click', () => {
    const text = wordInput.value.trim();
    if (text) {
        speakText(text);
    } else {
        alert('Please enter a word first!');
    }
});

// Handle Enter key press on the input field
wordInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        const text = wordInput.value.trim();
        if (text) {
            speakText(text);
        }
    }
});

// Handle record button click
recordButton.addEventListener('click', () => {
    if (!wordInput.value.trim()) {
        alert('Please enter a word first!');
        return;
    }

    if (!isRecording) {
        audioChunks = [];
        mediaRecorder.start();
        isRecording = true;
        recordButton.innerHTML = '<i class="fas fa-stop"></i>';
        recordStatus.textContent = 'Recording... Click to stop.';
        setTimeout(() => {
            if (isRecording) stopRecording();
        }, 5000);
    } else {
        stopRecording();
    }
});

// Stop recording function
function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
    recordStatus.textContent = 'Processing...';
}

// Analyze audio by sending it to the server
async function analyzeAudio(audioData, text) {
    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: audioData.trim(), text: text })
        });

        const result = await response.json();

        if (result.success) {
            progressBarFill.style.width = `${result.accuracy}%`;
            accuracyScore.textContent = `Accuracy: ${result.accuracy}%`;
            feedbackMessage.textContent = `💬 ${result.feedback}`;
            recordStatus.textContent = '✅ Recording complete!';
        } else {
            recordStatus.textContent = 'Error: ' + result.error;
            feedbackMessage.textContent = '⚠ Unable to process the recording.';
        }
    } catch (error) {
        recordStatus.textContent = 'Error analyzing audio';
        feedbackMessage.textContent = '⚠ Network or server error occurred.';
    }
}
