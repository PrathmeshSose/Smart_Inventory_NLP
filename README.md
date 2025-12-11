🌟 Smart Inventory AI
NLP + Voice-Powered Inventory Management System

Smart Inventory AI is an advanced inventory management system powered by NLP, Voice Commands, and AI intent detection.
Users can interact naturally:

Add 5 apples at ₹50

Show all electronics

Reduce 3 bananas

What items are low on stock?

The system automatically updates inventory and responds in a conversational tone.

🚀 Live Demo

Frontend: https://smartinventory-1-p0ss.onrender.com

Backend API: https://smartinventory-l965.onrender.com

🎯 Key Features
🤖 AI-Powered NLP

Understands human commands

Detects intent (add, update, delete, view items)

Works with English, Hindi, Marathi

🎤 Voice Interaction

Voice input using Web Speech API

AI voice responses

Smooth conversational mode

📦 Inventory Management

Add / Update / Delete items

Auto category detection

Price averaging logic

Low-stock alerts

Total stock value calculation

🗣 Human-like AI Chat

Friendly responses

Maintains conversation context

Small-talk support

🏗 Architecture
Frontend (React + Tailwind + Web Speech API)
        ↓
Backend (Node.js + Express)
        ↓
Groq LLaMA 3.3 — NLP Intent Parser
        ↓
MongoDB — Inventory Database

🔌 API Flow

User sends text or voice command

Backend sends message to Groq AI

AI returns structured JSON:

{
  "intent": "add_item",
  "item": "apple",
  "quantity": 5,
  "price": 50
}


Backend updates MongoDB

System replies with chat + optional voice output

🛠 Tech Stack

Frontend: React, TailwindCSS, Axios, Web Speech API
Backend: Node.js, Express, MongoDB, Mongoose, Groq LLaMA 3.3
Deployment: Render

⚙ Installation
1. Clone Repo
git clone https://github.com/PrathmeshSose/Smart_Inventory_NLP

2. Backend Setup
cd backend
npm install


Create .env:

PORT=5000
MONGO_URI=your_mongo_url
GROQ_API_KEY=your_api_key
GROQ_MODEL=llama-3.3-70b-versatile


Run:

npm start

3. Frontend Setup
cd frontend
npm install
npm run dev

📈 Future Improvements

Multilingual voice output

Barcode scanning

Analytics dashboard

Export PDF/Excel

Multi-user login

👨‍💻 Developers

Om Shedage

Rohit Gaikwad

Prathmesh Sose

Sujit Chavan

Jay Ithape

✅ This README will NOT give “Error getting preview”

If you want I can also:

📌 Add screenshots properly
📌 Add badges (Stars, Forks, Tech Stack)
📌 Generate a perfect GitHub professional README layout
