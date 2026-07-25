const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({

    sessionId: {
        type: String,
        required: true,
        index: true
    },

    userId: {
        type: String,
        required: true
    },

    imageUrl: {
        type: String,
        required: true
    },

    title: String,
    summary: String,

    keyPoints: [String],

    flashCards:[{
        question: String,
        answer: String
    }],

    createAt: {
        type: Date,
        default: Date.now
    }


});


module.exports = mongoose.model('Note',noteSchema);
