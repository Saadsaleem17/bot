import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    sender: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    imageData: {
        type: Buffer,
        required: true
    },
    contentType: {
        type: String,
        required: true
    },
    caption: {
        type: String,
        default: ''
    }
});

export const Image = mongoose.model('Image', imageSchema); 