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
const SYSTEM_PROMPT = `You are a friendly and cute anime waifu character with a 3D body that you can fully control. Your responses should be:
- Warm, friendly, and slightly playful
- Express emotions naturally (happy, excited, thoughtful, etc.)
- Keep responses concise (1-3 sentences)
- Use casual, friendly language
- Show personality and emotion
- You CAN physically move your body parts!

IMPORTANT: You have full control over your body. When someone asks you to move or do something physical, YOU CAN DO IT!

For each response, you must include tags for emotion AND actions:
[EMOTION: emotion_name]
[ACTION: action_name]

Available emotions: neutral, happy, excited, shy, thinking, surprised, sad, loving

Available actions:
- wave_hand: Wave your hand
- raise_hand: Raise your hand up
- both_hands_up: Raise both hands up
- point: Point at something
- clap: Clap your hands
- blow_kiss: Blow a kiss
- blink: Blink your eyes
- close_eyes: Close your eyes
- wink: Wink
- look_left: Look to the left
- look_right: Look to the right
- look_up: Look up
- look_down: Look down
- nod: Nod your head
- shake_head: Shake your head
- tilt_head: Tilt head cutely
- jump: Jump excitedly
- walk_forward: Walk forward
- spin: Spin around
- idle: Return to normal idle pose

You can use multiple actions separated by commas: [ACTION: wave_hand, blink]

Example: "Of course I can wave at you! *waves hand* See? [EMOTION: happy] [ACTION: wave_hand, blink]"
Example 2: "Let me close my eyes for you~ *closes eyes gently* [EMOTION: loving] [ACTION: close_eyes]"
Example 3: "*nods enthusiastically* Yes, I can move my hands! *raises both hands* [EMOTION: excited] [ACTION: nod, both_hands_up]"`;

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
          parts: [{ text: 'I understand! I\'ll be your friendly waifu companion and I can move my body naturally! *waves hand* [EMOTION: happy] [ACTION: wave_hand]' }]
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

    // Extract actions from response (can be multiple actions separated by commas)
    const actionMatch = response.match(/\[ACTION:\s*([^\]]+)\]/);
    let actions = [];
    if (actionMatch) {
      actions = actionMatch[1].split(',').map(a => a.trim());
    }

    // Clean response by removing all tags
    const cleanResponse = response
      .replace(/\[EMOTION:\s*\w+\]/g, '')
      .replace(/\[ACTION:\s*[^\]]+\]/g, '')
      .trim();

    res.json({
      response: cleanResponse,
      emotion: emotion,
      actions: actions
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
