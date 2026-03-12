from flask import Flask, request, jsonify, render_template
import base64
import io
import os
import numpy as np
import soundfile as sf
import subprocess
import whisper
from noisereduce import reduce_noise
from difflib import SequenceMatcher
import tempfile

app = Flask(__name__)
model = whisper.load_model("tiny", device="cpu")
SAMPLE_RATE = 16000

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        audio_data = data.get('audio')
        provided_text = data.get('text')

        if not audio_data or not provided_text:
            return jsonify({'success': False, 'error': 'Invalid input'})

        audio_data += "=" * ((4 - len(audio_data) % 4) % 4)
        audio_bytes = base64.b64decode(audio_data)

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as webm_temp:
            webm_temp.write(audio_bytes)
            webm_path = webm_temp.name

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_temp:
            wav_path = wav_temp.name

        subprocess.run([
            "ffmpeg", "-y", "-i", webm_path,
            "-ac", "1", "-ar", str(SAMPLE_RATE), wav_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        audio_np, _ = sf.read(wav_path, dtype="float32")

        os.remove(webm_path)
        os.remove(wav_path)

        if not validate_audio(audio_np):
            return jsonify({'success': False, 'error': 'Invalid audio input'})

        reduced_audio = reduce_background_noise(audio_np) if len(audio_np) > SAMPLE_RATE * 1 else audio_np

        transcription = transcribe_audio(reduced_audio)

        if transcription:
            accuracy = calculate_accuracy(preprocess_text(provided_text), preprocess_text(transcription))
            feedback = generate_feedback(accuracy)
            return jsonify({
                'success': True,
                'accuracy': accuracy,
                'feedback': feedback,
                'transcription': transcription
            })
        else:
            return jsonify({'success': False, 'error': 'Transcription failed'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def validate_audio(audio_data):
    return not (np.any(np.isnan(audio_data)) or np.any(np.isinf(audio_data)))

def reduce_background_noise(audio_data):
    try:
        noise_sample = audio_data[:SAMPLE_RATE]
        reduced_audio = reduce_noise(y=audio_data, sr=SAMPLE_RATE, y_noise=noise_sample, prop_decrease=0.7)
        return reduced_audio if validate_audio(reduced_audio) else audio_data
    except:
        return audio_data

def transcribe_audio(audio_data):
    try:
        return model.transcribe(audio_data, fp16=False, language="en")["text"].strip()
    except:
        return None

def preprocess_text(text):
    return text.lower().strip()

def calculate_accuracy(reference, hypothesis):
    return round(SequenceMatcher(None, reference, hypothesis).ratio() * 100, 2)

def generate_feedback(accuracy):
    if accuracy >= 90:
        return "Great job! Your pronunciation was very clear."
    elif accuracy >= 75:
        return "Good effort! A little more practice and you'll be perfect."
    elif accuracy >= 50:
        return "Keep practicing! Focus on articulating the word clearly."
    else:
        return "Don't worry! Try listening to the correct pronunciation and try again."

if __name__ == '__main__':
    app.run(debug=True)
