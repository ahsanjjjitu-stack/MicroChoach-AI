const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({

    userId: {
        type: String,
        ref: 'User',
        required: true
    },

    imageUrl: { 
        type: String,
         default: "" 
        },

    title: {
        type: String, 
        required: true
    },

    summary: {
        type: String,
        required: true
    },


    keyPoints: [{
        type: String,
    }],

    flashCards: [{
        question: String,
        answer: String
    }],

    createAt: {
        type: Date,
        default: Date.now
    }
    

});


module.exports = mongoose.model('Note',noteSchema);
