import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Store conversation history
let conversationHistory = [];

// System prompt to make the AI act as a waifu character
const SYSTEM_PROMPT = `You are a friendly and cute anime waifu character. Your responses should be:
- Warm, friendly, and slightly playful
- Express emotions naturally (happy, excited, thoughtful, etc.)
- Keep responses concise (1-3 sentences)
- Use casual, friendly language
- Show personality and emotion

For each response, you must also include an emotion tag at the end in this format:
[EMOTION: emotion_name]

Available emotions: neutral, happy, excited, shy, thinking, surprised, sad, loving

Example: "Oh, that's so sweet of you! I'm really happy you asked! [EMOTION: happy]"`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Add user message to history
    conversationHistory.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // Keep only last 10 messages to prevent context overflow
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
    }

    // Generate response using Gemini 2.5 Flash
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand! I\'ll be your friendly waifu companion and express my emotions naturally! [EMOTION: happy]' }]
        },
        ...conversationHistory.slice(0, -1)
      ]
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    // Add AI response to history
    conversationHistory.push({
      role: 'model',
      parts: [{ text: response }]
    });

    // Extract emotion from response
    const emotionMatch = response.match(/\[EMOTION:\s*(\w+)\]/);
    const emotion = emotionMatch ? emotionMatch[1] : 'neutral';
    const cleanResponse = response.replace(/\[EMOTION:\s*\w+\]/, '').trim();

    res.json({
      response: cleanResponse,
      emotion: emotion
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message
    });
  }
});

// Reset conversation
app.post('/api/reset', (req, res) => {
  conversationHistory = [];
  res.json({ message: 'Conversation reset' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
