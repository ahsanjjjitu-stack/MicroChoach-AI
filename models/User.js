const mongoose = require('mongoose');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

    googleId: {
        type: String,
        required: true,
        unique: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    createAt: {
        type: Date,
        default: Date.now
    }


});


module.exports = mongoose.model('User',userSchema);
const sessionSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true
    },

    title: {
        type: String,
        required: true,
        default: 'New Chat'
    },

    crea
});
