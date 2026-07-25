require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const dns = require('dns');
const { GoogleGenAI } = require('@google/genai');

const User = require('./models/User');
const Session = require('./models/Session');
const Note = require('./models/Note');

const app = express();

// Set DNS servers to avoid resolution issues
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Middlewares (Payload limit 50mb for Base64 image)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Google Auth Client & Gemini Setup
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL)
    .then(() => console.log('MongoDB Connected 🚀'))
    .catch(err => console.error('MongoDB Connection Error:', err));


// 1. Google Login / Signup Endpoint
app.post('/api/auth/google-login', async (req, res) => {
    try {
        console.log("Received Auth Request");
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, message: "idToken is required" });
        }

        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email } = payload;

        let user = await User.findOne({ googleId });
        if (!user) {
            user = new User({ googleId, email });
            await user.save();
        }

        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'secretkey'
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            userId: user._id,
            token: token
        });

    } catch (error) {
        console.error("Auth Error:", error);
        res.status(401).json({
            success: false,
            message: "Invalid Google Token",
            error: error.message
        });
    }
});


// 2. Get User Sessions
app.get('/api/notes/session/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required" });
        }

        const sessions = await Session.find({ userId })
            .select('_id title createdAt')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            sessions: sessions.map(s => ({
                sessionId: s._id.toString(),
                title: s.title,
                createdAt: s.createdAt
            }))
        });

    } catch (error) {
        console.error('Error fetching sessions:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});


// 3. Get Session Messages
app.get('/session-message/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({ success: false, message: "sessionId is required" });
        }

        const notes = await Note.find({ sessionId }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            notes: notes
        });

    } catch (error) {
        console.error('Error fetching session messages:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});


// 4. Process Image with Gemini AI
app.post('/api/notes/process-image', async (req, res) => {
    try {
        console.log("Processing Note Request Received...");
        const { imageBase64, userId, sessionId, mimeType } = req.body;
        
        if (!imageBase64) {
            return res.status(400).json({ success: false, message: 'imageBase64 is required.' });
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required.' });
        }

        // Clean Base64 String if prefix attached
        const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const imageMimeType = mimeType || 'image/jpeg';

        const prompt = `
            Analyze the attached image of study notes or text carefully.
            Generate a detailed note breakdown.

            Respond strictly in valid JSON format with this exact layout:
            {
              "title": "A short descriptive title",
              "summary": "A concise summary of the main idea",
              "keyPoints": [
                "Key takeaway 1",
                "Key takeaway 2"
              ],
              "flashcards": [
                {
                  "question": "What is the main requirement for success mentioned in the text?",
                  "answer": "Hard work and dedication."
                }
              ]
            }

            IMPORTANT INSTRUCTIONS:
            - "flashcards" MUST NOT BE EMPTY. Generate at least 2 to 4 Q&A pairs directly from the text.
            - Do not wrap in markdown or standard text. Return raw JSON string only.
        `;
        

        
        // Call Gemini Model
        const geminiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Correct Model Name
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: imageMimeType,
                                data: cleanBase64
                            }
                        }
                    ]
                }
            ]
        });

        // Parse AI Output
        let aiAnalysisResult;
        try {
            const rawText = geminiResponse.text.replace(/```json|```/g, '').trim();
            aiAnalysisResult = JSON.parse(rawText);
        } catch (e) {
            console.error("Failed to parse AI response as JSON:", geminiResponse.text);
            return res.status(500).json({ success: false, message: "AI response formatting error" });
        }

        // Handle Session
        let activeSessionId = sessionId;
        let session = null;

        if (activeSessionId) {
            session = await Session.findById(activeSessionId);
        }

        if (!session) {
            session = new Session({
                userId: userId,
                title: aiAnalysisResult.title || 'New Chat'
            });

            await session.save();
            activeSessionId = session._id.toString();
        }

        // Save Note
        const newNote = new Note({
            sessionId: activeSessionId,
            userId: userId,
            imageUrl: imageBase64,
            title: aiAnalysisResult.title,
            summary: aiAnalysisResult.summary,
            keyPoints: aiAnalysisResult.keyPoints,
            flashcards: aiAnalysisResult.flashcards || aiAnalysisResult.flashCards
        });

        await newNote.save();

        return res.status(200).json({
            success: true,
            sessionId: activeSessionId, 
            note: newNote
        });

    } catch (error) {
        console.error('Error processing image:', error);
        return res.status(500).json({ success: false, message: 'Failed to process note', error: error.message });
    }
});


// Server Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ⚡`);
});