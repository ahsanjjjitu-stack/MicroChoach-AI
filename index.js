require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const dns = require('dns');
const { GoogleGenAI } = require('@google/genai');



const User = require('./models/User');
const Note = require('./models/Note');



// 1. Initialize Express app ONLY ONCE
const app = express();



// Set DNS servers to avoid resolution issues
dns.setServers(['8.8.8.8', '8.8.4.4']);



// 2. Middlewares (Must be before routes)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));





// 2. Middlewares (Payload limit 50mb barano hoise large Base64 image-er jonno)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true}));



// Google Auth Client Setup (Fixed spelling: GOOGLE_CLIENT_ID)
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ai = new GoogleGenAI({apiKey: process.env.GOOGLE_API_KEY});




// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL)
    .then(() => console.log('MongoDB Connected 🚀'))
    .catch(err => console.error('MongoDB Connection Error:', err));




// Google Login / Signup Endpoint
app.post('/api/auth/google-login', async (req, res) => {
    try {
        console.log("Received Body:", req.body);
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, message: "idToken is required" });
        }

        // Verify idToken
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email } = payload;

        // Find or Create User in MongoDB
        let user = await User.findOne({ googleId });
        if (!user) {
            user = new User({ googleId, email });
            await user.save();
        }

        // Generate JWT
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







// process google gen ai request 

app.post('/api/notes/process-image', async (req, res) => {

    try {
        console.log("Processing Note Request Received...");
        const { imageBase64, mimeType = 'image/jpeg', userId } =  req.body;
        
        if (!imageBase64) {
            return res.status(400).json({ success: false, message: 'imageBase64 is required.' });
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required.' });
        }


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
                },
                {
                  "question": "How does hard work affect character?",
                  "answer": "It builds discipline, confidence, and resilience."
                }
              ]
            }

            IMPORTANT INSTRUCTIONS:
            - "flashcards" MUST NOT BE EMPTY. Generate at least 2 to 4 Q&A pairs directly from the text.
            - Do not wrap in markdown or standard text. Return raw JSON string only.
        `;





        // call gemei model
        const response = await ai.models.generateContent({

            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: imageBase64
                            }
                        }
                      ]
                  }
              ]

        });




        const aiRawText = response.text.trim();




        // Clean markdown wrapper if Gemini adds it
        const cleanedJsonText = aiRawText.replace(/^```json\s*/, '').replace(/```$/, '');
        const parsedData = JSON.parse(cleanedJsonText);

        const generatedCards = parsedData.flashcards || parsedData.flashCards || [];



        const newNote = new Note({
            userId,
            title: parsedData.title,
            summary: parsedData.summary,
            keyPoints: parsedData.keyPoints,
            flashCards: generatedCards
        });

        await newNote.save();



        res.status(201).json({
            success: true,
            message: 'Note processed and saved successfully!',
            note: newNote
        });


    }
    catch (error){
        console.error('Gemini Processing Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process note image',
            error: error.message
        });
    }



});














// Port declaration fixed syntax
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ⚡`);
});