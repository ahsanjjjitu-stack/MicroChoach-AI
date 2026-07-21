require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const {OAuth2Client} = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('./models/User');


app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));



// set dns servers to avoid DNS resolution issues
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);


const app = express();

// google auth client setup
const client = new OAuth2Client(process.env.GOOFLE_CLIENT_ID);

// MongoDB Conection
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error', err));


// Google login/ Signup
app.post('/api/auth/google-login', async (req, res) => {

try{
    
     console.log("Received Body:", req.body);
    const {idToken} = req.body;
    if (!idToken) {
            return res.status(400).json({ success: false, message: "idToken is required" });
        }

    // verify idToken
    const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const {sub: googleId, email} = payload;

    // Find or create user in MongoDB
    let user = await User.findOne({googleId});
    if(!user){
        user = new User({googleId, email});
        await user.save();
    }


    // Generate JWT
    const token = jwt.sign({userId: user._id}, process.env.JWT_SECRET);

    res.status(200).json({
        success: true,
        message: "Login successfull",
        userId: user._id,
        token: token
    });





}
catch(error){
console.error("Auth Error:", error);
        res.status(401).json({
            success: false,
            message: "Invalid Google Token",
            error: error.message
        });
}





});


const PORT = process.env.PORT // 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ⚡`);
});