# AI Waifu VTuber - Gemini Powered 3D Character

A beautiful 3D anime waifu character powered by Google's Gemini 2.5 Flash AI! Chat with your waifu and watch her express emotions through animations like a real VTuber.

## Features

- **3D Character**: VRM-compatible 3D anime character with full animation support
- **AI-Powered**: Uses Gemini 2.5 Flash for natural, personality-driven conversations
- **Emotion System**: Character displays emotions (happy, excited, shy, thinking, surprised, sad, loving) based on AI responses
- **VTuber-Style**: Real-time character animations synced with AI personality
- **Beautiful UI**: Modern, gradient-based chat interface
- **Responsive**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Three.js, VRM (Virtual Reality Model)
- **Backend**: Node.js, Express
- **AI**: Google Gemini 2.5 Flash
- **Deployment**: Render (or any Node.js hosting)

## Setup

### Prerequisites

- Node.js 18+ installed
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd My-step-gf
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

5. Run the application:
```bash
npm start
```

6. Open your browser and visit:
```
http://localhost:3000
```

## Deploy to Render

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click "New +" and select "Web Service"
4. Connect your GitHub repository
5. Render will automatically detect the `render.yaml` configuration
6. Add your `GEMINI_API_KEY` in the Environment Variables section
7. Click "Create Web Service"

Your waifu will be live in minutes!

## Customization

### Change the 3D Model

Replace the VRM model URL in `public/js/main.js`:

```javascript
const modelUrl = 'YOUR_VRM_MODEL_URL_HERE';
```

You can find free VRM models at:
- [VRoid Hub](https://hub.vroid.com/)
- [Live3D](https://live3d.io/vroid_model)
- [Sketchfab](https://sketchfab.com/tags/vrm)

### Customize AI Personality

Edit the `SYSTEM_PROMPT` in `server.js` to change your waifu's personality:

```javascript
const SYSTEM_PROMPT = `You are a friendly and cute anime waifu character...`;
```

### Add More Emotions

Add new emotions in both files:

1. `server.js` - Add to available emotions list
2. `public/js/main.js` - Add to `getEmotionRotation()` function

## API Endpoints

- `POST /api/chat` - Send a message to the AI
- `POST /api/reset` - Reset the conversation
- `GET /api/health` - Health check

## Project Structure

```
My-step-gf/
├── public/
│   ├── css/
│   │   └── style.css          # Styling
│   ├── js/
│   │   └── main.js            # 3D rendering & chat logic
│   ├── models/                # Place VRM models here
│   └── index.html             # Main HTML
├── server.js                  # Express server & Gemini AI
├── package.json
├── .env                       # Environment variables (not in git)
├── .env.example              # Example env file
├── render.yaml               # Render deployment config
└── README.md
```

## Troubleshooting

### Character Not Loading

If the VRM model fails to load, the app will automatically use a fallback 3D character made from basic shapes.

### API Errors

Make sure your Gemini API key is valid and has API access enabled.

### Port Already in Use

Change the PORT in your `.env` file to a different number.

## Credits

- 3D Rendering: [Three.js](https://threejs.org/)
- VRM Support: [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- AI: [Google Gemini](https://ai.google.dev/)

## License

MIT License - Feel free to use and modify!

---

Made with love for waifu enthusiasts everywhere! 💖
